"use client";
import { markUiCopy } from "@/lib/i18n";

import { MCPServer } from "@/components/mcp_tools/types";

export interface RequiredFieldDef {
  key: string;
  label: string;
  description: string;
  check: (server: MCPServer) => boolean;
}

export interface FieldGroup {
  label: string;
  fields: RequiredFieldDef[];
}

export const FIELD_GROUPS: FieldGroup[] = [
  markUiCopy(
    {
      label: "Documentation",
      fields: [
        markUiCopy(
          {
            key: "description",
            label: "Description",
            description: "Must have a non-empty description",
            check: (s) => !!s.description?.trim(),
          },
          { label: "Description", description: "Must have a non-empty description" },
        ),
        markUiCopy(
          {
            key: "alias",
            label: "Alias",
            description: "Must have a display alias",
            check: (s) => !!s.alias?.trim(),
          },
          { label: "Alias", description: "Must have a display alias" },
        ),
      ],
    },
    { label: "Documentation" },
  ),
  markUiCopy(
    {
      label: "Source",
      fields: [
        markUiCopy(
          {
            key: "source_url",
            label: "GitHub / Source URL",
            description: "Must link to a source repository",
            check: (s) => !!s.source_url?.trim(),
          },
          { label: "GitHub / Source URL", description: "Must link to a source repository" },
        ),
      ],
    },
    { label: "Source" },
  ),
  markUiCopy(
    {
      label: "Connection",
      fields: [
        markUiCopy(
          {
            key: "url",
            label: "Server URL",
            description: "Must have a URL configured",
            check: (s) => !!s.url?.trim(),
          },
          { label: "Server URL", description: "Must have a URL configured" },
        ),
      ],
    },
    { label: "Connection" },
  ),
  markUiCopy(
    {
      label: "Security",
      fields: [
        markUiCopy(
          {
            key: "auth_type",
            label: "Auth configured",
            description: "Must use authentication (not 'none')",
            check: (s) => !!s.auth_type && s.auth_type !== "none",
          },
          { label: "Auth configured", description: "Must use authentication (not 'none')" },
        ),
      ],
    },
    { label: "Security" },
  ),
];

export const MCP_REQUIRED_FIELD_DEFS: RequiredFieldDef[] = FIELD_GROUPS.flatMap((g) => g.fields);

export const SETTINGS_KEY = "mcp_required_fields";
