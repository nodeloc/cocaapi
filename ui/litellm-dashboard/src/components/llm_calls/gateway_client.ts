import OpenAI, { type ClientOptions } from "openai";
import { getProxyBaseUrl } from "@/components/networking";
import { getAuthHeaderName } from "@/lib/http/runtime";
import { dashboardFetch } from "@/lib/http/customerTransport";

type GatewayClientOptions = Pick<ClientOptions, "baseURL" | "defaultHeaders" | "fetch" | "maxRetries" | "timeout"> & {
  accessToken: string;
};

export function createGatewayClient({ accessToken, ...options }: GatewayClientOptions): OpenAI {
  const authHeader = getAuthHeaderName();
  const config: ClientOptions = {
    ...options,
    apiKey: accessToken,
    baseURL: options.baseURL || getProxyBaseUrl(),
    dangerouslyAllowBrowser: true,
    fetch: options.fetch ?? dashboardFetch,
    defaultHeaders: {
      Authorization: null,
      [authHeader]: `Bearer ${accessToken}`,
      ...options.defaultHeaders,
    },
  };
  return new OpenAI.OpenAI(config);
}
