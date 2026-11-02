import { markUiCopy } from "@/lib/i18n";
// Define the available test modes
export const TEST_MODES = [
  markUiCopy({ value: "chat", label: "Chat - /chat/completions" }, { label: "Chat - /chat/completions" }),
  markUiCopy({ value: "completion", label: "Completion - /completions" }, { label: "Completion - /completions" }),
  markUiCopy({ value: "embedding", label: "Embedding - /embeddings" }, { label: "Embedding - /embeddings" }),
  markUiCopy(
    { value: "audio_speech", label: "Audio Speech - /audio/speech" },
    { label: "Audio Speech - /audio/speech" },
  ),
  markUiCopy(
    { value: "audio_transcription", label: "Audio Transcription - /audio/transcriptions" },
    { label: "Audio Transcription - /audio/transcriptions" },
  ),
  markUiCopy(
    { value: "image_generation", label: "Image Generation - /images/generations" },
    { label: "Image Generation - /images/generations" },
  ),
  markUiCopy({ value: "image_edit", label: "Image Edit - /images/edits" }, { label: "Image Edit - /images/edits" }),
  markUiCopy(
    { value: "video_generation", label: "Video Generation - /videos" },
    { label: "Video Generation - /videos" },
  ),
  markUiCopy({ value: "rerank", label: "Rerank - /rerank" }, { label: "Rerank - /rerank" }),
  markUiCopy({ value: "realtime", label: "Realtime - /realtime" }, { label: "Realtime - /realtime" }),
  markUiCopy({ value: "batch", label: "Batch - /batch" }, { label: "Batch - /batch" }),
  markUiCopy(
    { value: "anthropic_messages", label: "Anthropic Messages - /v1/messages" },
    { label: "Anthropic Messages - /v1/messages" },
  ),
  markUiCopy({ value: "ocr", label: "OCR - /ocr" }, { label: "OCR - /ocr" }),
  markUiCopy({ value: "evaluation", label: "Evaluation - /v1/decisions" }, { label: "Evaluation - /v1/decisions" }),
];

// Define the available auto router routing strategies
export const AUTO_ROUTER_MODES = [
  markUiCopy(
    { value: "simple-shuffle", label: "Simple Shuffle - Random selection from available models" },
    { label: "Simple Shuffle - Random selection from available models" },
  ),
  markUiCopy(
    { value: "least-busy", label: "Least Busy - Route to model with lowest current load" },
    { label: "Least Busy - Route to model with lowest current load" },
  ),
  markUiCopy(
    { value: "latency-based", label: "Latency Based - Route to model with best response time" },
    { label: "Latency Based - Route to model with best response time" },
  ),
  markUiCopy(
    { value: "cost-based", label: "Cost Based - Route to most cost-effective model" },
    { label: "Cost Based - Route to most cost-effective model" },
  ),
  markUiCopy(
    { value: "usage-based", label: "Usage Based - Route based on historical usage patterns" },
    { label: "Usage Based - Route based on historical usage patterns" },
  ),
  markUiCopy(
    { value: "custom", label: "Custom - Use custom routing logic defined in config" },
    { label: "Custom - Use custom routing logic defined in config" },
  ),
];
