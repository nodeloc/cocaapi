import json
import threading
import time
from collections.abc import Mapping, Sequence
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import ClassVar, Final

from pydantic import JsonValue, TypeAdapter

_BODY: Final = TypeAdapter(dict[str, JsonValue])


class BillingUpstream(BaseHTTPRequestHandler):
    requests: ClassVar[int] = 0
    lock: ClassVar[threading.Lock] = threading.Lock()

    def log_message(self, format: str, *args: object) -> None:
        pass

    def do_GET(self) -> None:
        self.send_json(200, {"requests": BillingUpstream.requests})

    def do_POST(self) -> None:
        body: Final = _BODY.validate_json(self.rfile.read(int(self.headers["Content-Length"])))
        with BillingUpstream.lock:
            BillingUpstream.requests += 1
        trigger: Final = request_trigger(body)
        if trigger == "delayed-response":
            time.sleep(1)
        if trigger == "fail-before-response":
            self.send_json(503, {"error": {"message": "Scripted provider failure", "type": "server_error"}})
            return
        created: Final = int(time.time())
        request_id: Final = str(time.time_ns())
        if self.path.endswith("/embeddings"):
            self.send_json(
                200,
                {
                    "object": "list",
                    "model": "test-model",
                    "data": [{"object": "embedding", "index": 0, "embedding": [0.1, 0.2]}],
                    "usage": {"prompt_tokens": 7, "total_tokens": 7},
                },
            )
            return
        if self.path.endswith("/responses"):
            response: Final = {
                "id": "resp-billing-" + request_id,
                "object": "response",
                "created_at": created,
                "status": "completed",
                "model": "test-model",
                "error": None,
                "incomplete_details": None,
                "output": [
                    {
                        "id": "msg-billing",
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{"type": "output_text", "text": "Billing test response", "annotations": []}],
                    }
                ],
                "usage": {
                    "input_tokens": 7,
                    "output_tokens": 5,
                    "total_tokens": 12,
                    "input_tokens_details": {"cached_tokens": 0},
                    "output_tokens_details": {"reasoning_tokens": 0},
                    "cost": 0,
                },
            }
            if body.get("stream"):
                self.send_sse(
                    (
                        {
                            "type": "response.created",
                            "sequence_number": 0,
                            "response": {**response, "status": "in_progress", "output": [], "usage": None},
                        },
                        {"type": "response.completed", "sequence_number": 1, "response": response},
                    ),
                    responses=True,
                )
            else:
                self.send_json(200, response)
            return
        result: Final = {
            "id": "chatcmpl-billing-" + request_id,
            "object": "chat.completion",
            "created": created,
            "model": "test-model",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {
                        "role": "assistant",
                        "content": None if trigger == "invalid-playground-response" else "Billing test response",
                    },
                }
            ],
            "usage": {
                "prompt_tokens": 7, "completion_tokens": 5, "total_tokens": 12,
                "prompt_tokens_details": {"cached_tokens": 0},
                "completion_tokens_details": {"reasoning_tokens": 0},
                "cost": 0.0025 if trigger == "priced-provider-cost" else 0, "is_byok": False,
            },
        }
        if self.path.endswith("/completions") and not self.path.endswith("/chat/completions"):
            self.send_json(
                200,
                {
                    **result,
                    "object": "text_completion",
                    "choices": [
                        {"index": 0, "finish_reason": "stop", "text": "Billing test response", "logprobs": None}
                    ],
                },
            )
        elif body.get("stream"):
            partial: Final = (
                {
                    **result,
                    "object": "chat.completion.chunk",
                    "usage": None,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"role": "assistant", "content": "Billing test response"},
                            "finish_reason": None,
                        }
                    ],
                },
            )
            tail: Final = (
                ()
                if trigger == "fail-after-chunk"
                else (
                    {
                        **result,
                        "object": "chat.completion.chunk",
                        "usage": None,
                        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                    },
                    {**result, "object": "chat.completion.chunk", "choices": []},
                )
            )
            self.send_sse(
                (*partial, *tail), done=trigger != "fail-after-chunk", pause_after_first=trigger == "delayed-stream"
            )
        else:
            self.send_json(200, result)

    def send_json(self, status: int, payload: Mapping[str, object]) -> None:
        data: Final = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            return

    def send_sse(
        self,
        events: Sequence[Mapping[str, object]],
        responses: bool = False,
        done: bool = True,
        pause_after_first: bool = False,
    ) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        try:
            for index, event in enumerate(events):
                prefix: Final = "event: " + str(event["type"]) + "\n" if responses else ""
                self.wfile.write((prefix + "data: " + json.dumps(event) + "\n\n").encode())
                self.wfile.flush()
                if pause_after_first and index == 0:
                    time.sleep(2)
            if done:
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            return


def request_trigger(body: Mapping[str, JsonValue]) -> str:
    messages: Final = body.get("messages")
    if not isinstance(messages, list):
        return ""
    return next(
        (
            text for message in messages
            if (text := message_text(message)).startswith(("fail-", "delayed-", "invalid-", "priced-"))
        ),
        "",
    )


def message_text(value: JsonValue) -> str:
    if not isinstance(value, dict):
        return ""
    content: Final = value.get("content")
    return content if isinstance(content, str) else ""


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 9000), BillingUpstream).serve_forever()
