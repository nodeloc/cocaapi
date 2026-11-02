import { markUiCopy } from "@/lib/i18n";
export type CoordinationFieldType = "string" | "password" | "integer" | "boolean" | "list";

export type CoordinationRedisType = "node" | "cluster" | "sentinel";

export type CoordinationSection = "connection" | "cluster" | "sentinel" | "ssl";

export type CoordinationFieldRule = (value: unknown) => string | null;

export interface CoordinationField {
  readonly name: string;
  readonly label: string;
  readonly type: CoordinationFieldType;
  readonly section: CoordinationSection;
  readonly helpText: string;
  readonly redisType: CoordinationRedisType | null;
  readonly secret: boolean;
  readonly defaultValue?: string | number | boolean;
  readonly rules?: CoordinationFieldRule[];
}

export const COORDINATION_REDIS_TYPES: readonly CoordinationRedisType[] = ["node", "cluster", "sentinel"];

export const COORDINATION_REDIS_TYPE_DESCRIPTIONS: Readonly<Record<CoordinationRedisType, string>> = markUiCopy(
  {
    node: "Standard Redis node/single instance",
    cluster: "Redis Cluster mode for high availability and horizontal scaling",
    sentinel: "Redis Sentinel mode for high availability with automatic failover",
  },
  {
    node: "Standard Redis node/single instance",
    cluster: "Redis Cluster mode for high availability and horizontal scaling",
    sentinel: "Redis Sentinel mode for high availability with automatic failover",
  },
);

export const COORDINATION_REDIS_TYPE_LABELS: Readonly<Record<CoordinationRedisType, string>> = markUiCopy(
  {
    node: "Node (Single Instance)",
    cluster: "Cluster",
    sentinel: "Sentinel",
  },
  { node: "Node (Single Instance)", cluster: "Cluster", sentinel: "Sentinel" },
);

const isBlank = (value: unknown): boolean => value === undefined || value === null || String(value).trim() === "";

const portRule: CoordinationFieldRule = (value) => {
  if (isBlank(value)) {
    return null;
  }
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? null : "Port must be an integer between 1 and 65535";
};

const jsonListRule: CoordinationFieldRule = (value) => {
  if (isBlank(value)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    return "Must be a valid JSON array (use double quotes)";
  }
  return Array.isArray(parsed) ? null : "Must be a JSON array";
};

export const COORDINATION_FIELDS: readonly CoordinationField[] = [
  markUiCopy(
    {
      name: "url",
      label: "Redis URL",
      type: "password" as const,
      section: "connection",
      helpText:
        "Full Redis/Valkey connection URL (e.g. redis://:password@host:6379/1). When set, it takes precedence over Host, Port, Username, and Password.",
      redisType: null,
      secret: true,
    },
    { label: "Redis URL" },
  ),
  markUiCopy(
    {
      name: "host",
      label: "Host",
      type: "string" as const,
      section: "connection",
      helpText: "Redis server hostname or IP address",
      redisType: null,
      secret: false,
    },
    { label: "Host" },
  ),
  markUiCopy(
    {
      name: "port",
      label: "Port",
      type: "integer" as const,
      section: "connection",
      helpText: "Redis server port number",
      redisType: null,
      secret: false,
      defaultValue: "6379",
      rules: [portRule],
    },
    { label: "Port" },
  ),
  markUiCopy(
    {
      name: "username",
      label: "Username",
      type: "string" as const,
      section: "connection",
      helpText: "Redis server username (if required)",
      redisType: null,
      secret: false,
    },
    { label: "Username" },
  ),
  markUiCopy(
    {
      name: "password",
      label: "Password",
      type: "password" as const,
      section: "connection",
      helpText: "Redis server password",
      redisType: null,
      secret: true,
    },
    { label: "Password" },
  ),
  markUiCopy(
    {
      name: "startup_nodes",
      label: "Startup Nodes",
      type: "list" as const,
      section: "cluster",
      helpText: 'List of startup nodes for Redis Cluster (e.g., [{"host": "127.0.0.1", "port": 7001}])',
      redisType: "cluster",
      secret: false,
      rules: [jsonListRule],
    },
    { label: "Startup Nodes" },
  ),
  markUiCopy(
    {
      name: "sentinel_nodes",
      label: "Sentinel Nodes",
      type: "list" as const,
      section: "sentinel",
      helpText: 'List of Sentinel nodes (e.g., [["localhost", 26379]])',
      redisType: "sentinel",
      secret: false,
      rules: [jsonListRule],
    },
    { label: "Sentinel Nodes" },
  ),
  markUiCopy(
    {
      name: "service_name",
      label: "Service Name",
      type: "string" as const,
      section: "sentinel",
      helpText: "Master service name for Redis Sentinel",
      redisType: "sentinel",
      secret: false,
    },
    { label: "Service Name" },
  ),
  markUiCopy(
    {
      name: "sentinel_password",
      label: "Sentinel Password",
      type: "password" as const,
      section: "sentinel",
      helpText: "Password for Redis Sentinel authentication",
      redisType: "sentinel",
      secret: true,
    },
    { label: "Sentinel Password" },
  ),
  markUiCopy(
    {
      name: "ssl",
      label: "SSL",
      type: "boolean" as const,
      section: "ssl",
      helpText: "Enable SSL/TLS connection",
      redisType: null,
      secret: false,
      defaultValue: false,
    },
    { label: "SSL" },
  ),
];
