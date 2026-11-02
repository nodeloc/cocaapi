import { z } from "zod";
import { AccountRequestError, type Profile } from "../accountApi";
import { gatewayApi } from "../gatewayApi";
import { nativeKey, nativeModels, nativeUser } from "./customerNativeData";
import { nativeUsage, nativeWindow } from "./customerNativeUsage";
import type { CustomerTransport } from "@/lib/http/customerTransport";
import { getAuthHeaderName } from "@/lib/http/runtime";
import { streamResponse } from "./customerChatStream";

const bodySchema = z.record(z.string(), z.unknown());
const denied = () =>
  Response.json(
    {
      detail: "customer_operation_unavailable",
      error: { message: "This operation is not available for personal accounts." },
    },
    { status: 403 },
  );

function matchesStatus(key: ReturnType<typeof nativeKey>, status: string) {
  const expired = key.expires !== null && Date.parse(key.expires) <= Date.now();
  if (status === "active") return !expired && !key.blocked;
  if (status === "expired") return expired;
  if (status === "revoked") return key.blocked;
  return false;
}

function compareValues(a: string | number | null, b: string | number | null) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function createCustomerTransport(profile: Profile): CustomerTransport {
  const keyCache = new Map<string, ReturnType<typeof nativeKey>>();
  const access = () => gatewayApi.access();
  const list = async () => {
    keyCache.clear();
    const rights = await access();
    const entries = [];
    for (let offset = 0; offset <= 100_000; offset += 25) {
      const page = await gatewayApi.keys(offset);
      for (const key of page.items) {
        const converted = nativeKey(key, profile, rights);
        keyCache.set(key.id, converted);
        entries.push(converted);
      }
      if (!page.has_more) return entries;
    }
    throw new Error("Too many keys to load.");
  };
  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");
    const query = url.searchParams;
    if (query.has("user_id") && query.get("user_id") !== profile.user_id) return denied();
    const data = request.method === "GET" ? {} : bodySchema.parse(await request.json());
    if (data.user_id && data.user_id !== profile.user_id) return denied();
    if (request.method === "GET") {
      if (path === "/key/list") {
        const keyId = query.get("key_hash");
        let rows = keyId ? [nativeKey(await gatewayApi.key(keyId), profile, await access())] : await list();
        const search = (query.get("search") ?? "").toLowerCase();
        if (search) rows = rows.filter((key) => key.key_alias.toLowerCase().includes(search));
        if (query.get("team_id") || query.get("organization_id")) rows = [];
        const status = query.get("status");
        if (status) rows = rows.filter((key) => matchesStatus(key, status));
        const field = z
          .enum(["key_alias", "token", "created_at", "spend", "max_budget"])
          .catch("created_at")
          .parse(query.get("sort_by"));
        rows.sort((left, right) => {
          const a = left[field],
            b = right[field];
          const order = compareValues(a, b);
          return query.get("sort_order") === "asc" ? order : -order;
        });
        const page = Math.max(1, Number(query.get("page")) || 1);
        const size = Math.max(1, Math.min(100, Number(query.get("size")) || 50));
        return Response.json({
          keys: rows.slice((page - 1) * size, page * size),
          total_count: rows.length,
          current_page: page,
          total_pages: Math.max(1, Math.ceil(rows.length / size)),
        });
      }
      if (path === "/key/info" || path === "/v2/key/info") {
        const id = query.get("key") ?? "";
        const key = keyCache.get(id) ?? nativeKey(await gatewayApi.key(id), profile, await access());
        return key
          ? Response.json({ key: key.token, info: key })
          : Response.json({ detail: "key_not_found" }, { status: 404 });
      }
      if (path === "/user/daily/activity/aggregated") {
        const range = nativeWindow(query);
        return Response.json(
          nativeUsage(await gatewayApi.usage(30, range.start_time, range.end_time, Number(query.get("timezone") ?? 0))),
        );
      }
      if (path === "/spend/logs/ui" || path.startsWith("/spend/logs/ui/")) {
        const detailId = path.startsWith("/spend/logs/ui/")
          ? decodeURIComponent(path.slice("/spend/logs/ui/".length))
          : null;
        const page = Math.max(1, Number(query.get("page")) || 1);
        const limit = Math.max(1, Math.min(100, Number(query.get("page_size")) || 50));
        const status = query.get("status_filter");
        if (status && status !== "success" && status !== "failure") return denied();
        const sort = query.get("sort_by") ?? "startTime";
        if (!["startTime", "spend", "total_tokens", "request_duration_ms", "model"].includes(sort)) return denied();
        const result = await gatewayApi.nativeLogs({
          ...nativeWindow(
            detailId
              ? new URLSearchParams({
                  start_date: query.get("start_date")?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
                  end_date: query.get("start_date")?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
                })
              : query,
          ),
          limit,
          offset: (page - 1) * limit,
          model: query.get("model") ?? query.get("model_id"),
          request_id: detailId ?? query.get("request_id"),
          status: status ?? undefined,
          search: query.get("search"),
          sort_by: z.enum(["startTime", "spend", "total_tokens", "request_duration_ms", "model"]).parse(sort),
          sort_order: query.get("sort_order") === "asc" ? "asc" : "desc",
        });
        const rows = result.items.map((row) => ({
          request_id: row.request_id,
          model: row.model,
          model_group: row.model,
          status: row.status,
          startTime: row.started_at,
          endTime: row.ended_at,
          spend: row.spend_usd,
          total_tokens: row.total_tokens,
          prompt_tokens: row.prompt_tokens,
          completion_tokens: row.completion_tokens,
          metadata: { status: row.status },
          request_duration_ms: row.ended_at
            ? Math.max(0, Date.parse(row.ended_at) - Date.parse(row.started_at))
            : undefined,
        }));
        if (detailId)
          return rows.length
            ? Response.json({ ...rows[0], messages: null, response: null })
            : Response.json({ detail: "log_not_found" }, { status: 404 });
        return Response.json({
          data: rows,
          page,
          page_size: limit,
          has_more: result.has_more,
          total: (page - 1) * limit + rows.length + (result.has_more ? 1 : 0),
          total_pages: page + (result.has_more ? 1 : 0),
        });
      }
      if (path === "/management/v1/budgets") {
        const rights = await access();
        const row = {
          budget_id: profile.user_id,
          max_budget: rights.max_budget_usd,
          tpm_limit: rights.tpm_limit,
          rpm_limit: rights.rpm_limit,
          budget_reset_at: rights.budget_reset_at,
          budget_duration: rights.budget_duration,
          created_at: null,
          updated_at: null,
        };
        const search = (query.get("search") ?? "").toLowerCase();
        let rows = !search || profile.user_id.toLowerCase().includes(search) ? [row] : [];
        const minimum = query.get("filter[max_budget][gte]");
        const maximum = query.get("filter[max_budget][lte]");
        if (minimum !== null)
          rows = rows.filter((value) => value.max_budget !== null && value.max_budget >= Number(minimum));
        if (maximum !== null)
          rows = rows.filter((value) => value.max_budget !== null && value.max_budget <= Number(maximum));
        if (query.get("filter[max_budget][is_null]") === "true")
          rows = rows.filter((value) => value.max_budget === null);
        const durations = query.get("filter[budget_duration][in]")?.split(",");
        if (durations)
          rows = rows.filter((value) => value.budget_duration && durations.includes(value.budget_duration));
        if (query.get("filter[budget_duration][is_null]") === "true")
          rows = rows.filter((value) => !value.budget_duration);
        return Response.json({
          data: rows,
          links: {},
          meta: { page: 1, page_size: 50, total_count: rows.length, total_pages: 1 },
        });
      }
      if (path === "/user/info" || path === "/user/v2/info" || path === "/user/info/v2" || path === "/v2/user/info") {
        const user = nativeUser(profile, await access());
        return Response.json({ ...user, user_info: user, keys: [], teams: [] });
      }
      if (
        (path === "/v1/models" || path === "/models") &&
        query.get("only_model_access_groups")?.toLowerCase() === "true"
      )
        return Response.json({ data: [] });
      if (path === "/v1/models" || path === "/models")
        return Response.json({
          data: (await access()).models.map((id) => ({ id, object: "model", owned_by: "gateway" })),
        });
      if (path === "/model/info" || path === "/v2/model/info") {
        const rights = await access();
        const rows = nativeModels(rights).filter(
          (model) =>
            !query.get("search") || model.model_name.toLowerCase().includes(query.get("search")!.toLowerCase()),
        );
        const filtered = rows.filter(
          (model) =>
            (!query.get("modelId") || model.model_info.id === query.get("modelId")) &&
            (!query.get("model") || model.model_name === query.get("model")),
        );
        if ((query.get("sortOrder") ?? query.get("sort_order")) === "desc") filtered.reverse();
        const page = Math.max(1, Number(query.get("page")) || 1);
        const size = Math.max(1, Math.min(100, Number(query.get("size")) || 50));
        return Response.json({
          data: filtered.slice((page - 1) * size, page * size),
          total_count: filtered.length,
          current_page: page,
          total_pages: Math.max(1, Math.ceil(filtered.length / size)),
          size,
        });
      }
      if (path === "/model_group/info")
        return Response.json({ data: (await access()).models.map((model_group) => ({ model_group })) });
      if (path === "/v2/team/list")
        return Response.json({ teams: [], total_count: 0, current_page: 1, total_pages: 1 });
      if (path === "/team/list" || path === "/organization/list" || path === "/organizations") return Response.json([]);
      if (path === "/project/list") return Response.json({ projects: [], total: 0 });
      if (path === "/tag/list" || path === "/tags/list") return Response.json([]);
      if (path === "/agents/list") return Response.json({ agents: [] });
      if (path === "/get/ui_settings") {
        const rights = await access();
        return Response.json({
          values: { disable_model_add_for_internal_users: true },
          disabled_non_admin_personal_key_creation: !rights.can_create_key,
          key_creation_reason: rights.key_creation_reason,
        });
      }
      if (path === "/get/proxy_settings" || path === "/sso/get/ui_settings")
        return Response.json({ PROXY_BASE_URL: url.origin, LITELLM_UI_API_DOC_BASE_URL: url.origin + "/v1" });
      if (path === "/model/available") return Response.json({ data: (await access()).models.map((id) => ({ id })) });
    }
    if (request.method === "POST") {
      if (path === "/key/generate") {
        if (
          data.team_id ||
          data.organization_id ||
          data.project_id ||
          data.agent_id ||
          (data.key_type && data.key_type !== "llm_api")
        )
          return denied();
        const name = z.string().min(1).max(80).parse(data.key_alias);
        const duration = typeof data.duration === "string" && data.duration ? data.duration : "30d";
        const selected = data.models === undefined ? undefined : z.array(z.string()).parse(data.models);
        const models = selected?.length ? selected : undefined;
        const created = await gatewayApi.createNative(
          { name, duration, models, expires_in_days: 30 },
          profile.csrf_token,
        );
        return Response.json({
          key: created.key,
          key_alias: name,
          user_id: profile.user_id,
          models: (await access()).models,
        });
      }
      if (path === "/chat/completions" || path === "/v1/chat/completions") {
        if (data.stream !== false && data.stream !== true) return denied();
        const rawKey = request.headers.get(getAuthHeaderName())?.replace(/^Bearer /, "") ?? "";
        const model = z.string().parse(data.model);
        const messages = z
          .array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() }))
          .parse(data.messages);
        const maxTokens =
          data.max_tokens === undefined ? 4096 : z.number().int().min(1).max(32768).parse(data.max_tokens);
        if (data.stream) {
          await gatewayApi.authorizePlayground(
            { api_key: rawKey, model, messages, prompt: "", max_tokens: maxTokens },
            profile.csrf_token,
            request.signal,
          );
          const response = await globalThis.fetch(
            new Request(new URL("/v1/chat/completions", url.origin), {
              method: "POST",
              credentials: "omit",
              signal: request.signal,
              headers: {
                [getAuthHeaderName()]: "Bearer " + rawKey,
                "Content-Type": "application/json",
                Accept: "text/event-stream",
              },
              body: JSON.stringify({
                model,
                messages,
                max_tokens: maxTokens,
                stream: true,
                stream_options: { include_usage: true },
              }),
            }),
          );
          return streamResponse(response);
        }
        const answer = await gatewayApi.chat(
          { api_key: rawKey, model, messages, prompt: "", max_tokens: maxTokens },
          profile.csrf_token,
        );
        return Response.json({
          object: "chat.completion",
          id: answer.request_id,
          created: answer.created,
          model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: answer.content },
              finish_reason: answer.finish_reason ?? null,
            },
          ],
          usage: answer.usage,
        });
      }
      if (path === "/key/delete") {
        const keys = z.array(z.string()).length(1).parse(data.keys);
        await gatewayApi.remove(keys[0], profile.csrf_token);
        keyCache.delete(keys[0]);
        return Response.json({ deleted_keys: keys });
      }
    }
    return denied();
  };
  return {
    profile,
    marker: "customer-ui:" + profile.user_id,
    request: async (request) => {
      try {
        return await handle(request);
      } catch (cause) {
        const status = cause instanceof AccountRequestError ? cause.status : 400;
        return Response.json(
          { error: { message: cause instanceof Error ? cause.message : "Customer request failed" } },
          { status },
        );
      }
    },
  };
}
