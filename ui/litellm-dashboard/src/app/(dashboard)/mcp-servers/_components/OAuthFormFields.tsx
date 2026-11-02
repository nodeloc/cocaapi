"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";
import { Info } from "lucide-react";
import React from "react";
import { MultiSelect } from "@/components/shared/MultiSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OAUTH_FLOW } from "@/components/mcp_tools/types";
import { MountedFormField } from "@/components/common_components/MountedFormField";
import { requiredRule } from "@/components/common_components/formRules";
import TokenEndpointAuthMethodField from "./TokenEndpointAuthMethodField";
import UpstreamTokenHeaderField from "./UpstreamTokenHeaderField";
import {
  numberControl,
  parsesAsJson,
  selectControl,
  selectTriggerControl,
  tagsControl,
  textControl,
} from "./mcpFieldRules";

interface OAuthFlowStatus {
  startOAuthFlow: () => void;
  status: string;
  error: string | null;
  tokenResponse: { access_token?: string; expires_in?: number } | null;
}

interface OAuthFormFieldsProps {
  isM2M: boolean;
  isEditing?: boolean;
  oauthFlow?: OAuthFlowStatus;
  initialFlowType?: string;
  /** Link to provider docs for creating an OAuth app (e.g. GitHub). */
  docsUrl?: string | null;
}

const fieldClassName = "rounded-lg border-border focus:border-info focus:ring-ring";

const OAUTH_FLOW_ITEMS = [
  markUiCopy({ value: OAUTH_FLOW.M2M, label: "Machine-to-Machine (M2M)" }, { label: "Machine-to-Machine (M2M)" }),
  markUiCopy({ value: OAUTH_FLOW.INTERACTIVE, label: "Interactive (PKCE)" }, { label: "Interactive (PKCE)" }),
];

const UPSTREAM_RESOURCE_TOOLTIP =
  "RFC 8707 resource indicator sent to the authorization server so it mints a token audienced for this MCP server. " +
  "Leave blank to send nothing, which is the default and what most providers expect. Use 'auto' to send this server's " +
  "own URL. Set an exact identifier when the authorization server expects a specific one. Some providers reject this " +
  "parameter and take the audience from scopes instead; if you see AADSTS901002, leave it blank. If you see " +
  "invalid_target, the authorization server needs it set.";

const FieldLabel: React.FC<{ label: string; tooltip: string }> = (cocaCopyProps0) => {
  const { label, tooltip } = cocaCopyProps0;
  useUiLocale();
  return (
    <span className="text-sm font-medium text-foreground flex items-center">
      {localizedProperty(cocaCopyProps0, "label", label)}
      <SimpleTooltip content={tooltip}>
        <Info className="ml-2 size-4 text-info hover:text-info/80 cursor-help" />
      </SimpleTooltip>
    </span>
  );
};

const UpstreamResourceField: React.FC = () => {
  useUiLocale();
  return (
    <MountedFormField
      label={
        <FieldLabel label={translateMessage("Resource Indicator (optional)")} tooltip={UPSTREAM_RESOURCE_TOOLTIP} />
      }
      name={["credentials", "upstream_resource"]}
    >
      {(control) => (
        <Input
          {...textControl(control)}
          placeholder={translateMessage("auto, or https://mcp.example.com/mcp")}
          className={fieldClassName}
        />
      )}
    </MountedFormField>
  );
};

const OAuthFormFields: React.FC<OAuthFormFieldsProps> = ({
  isM2M,
  isEditing = false,
  oauthFlow,
  initialFlowType,
  docsUrl,
}) => {
  useUiLocale();
  const placeholderSuffix = isEditing ? " (leave blank to keep existing)" : "";
  const requiredWhenCreating = (message: string) =>
    isEditing ? undefined : { validate: { required: requiredRule(message) } };

  return (
    <>
      <MountedFormField
        label={
          <FieldLabel
            label={translateMessage("OAuth Flow Type")}
            tooltip={translateMessage(
              "Choose how the proxy authenticates with this MCP server. M2M is for server-to-server communication using client credentials. Interactive (PKCE) is for user-facing flows that require browser-based authorization.",
            )}
          />
        }
        name="oauth_flow_type"
        {...(initialFlowType ? { defaultValue: initialFlowType } : {})}
      >
        {(control) => (
          <Select {...selectControl<string>(control)} items={OAUTH_FLOW_ITEMS}>
            <SelectTrigger {...selectTriggerControl(control)} className="w-full rounded-lg">
              <SelectValue placeholder={translateMessage("Select OAuth flow")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OAUTH_FLOW.M2M}>
                <div>
                  <span className="font-medium">
                    <LocalizedText text={"Machine-to-Machine (M2M)"} />
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    <LocalizedText text={"server-to-server, no user interaction"} />
                  </span>
                </div>
              </SelectItem>
              <SelectItem value={OAUTH_FLOW.INTERACTIVE}>
                <div>
                  <span className="font-medium">
                    <LocalizedText text={"Interactive (PKCE)"} />
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    <LocalizedText text={"browser-based user authorization"} />
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </MountedFormField>

      {isM2M ? (
        <>
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Client ID")}
                tooltip={translateMessage("OAuth2 client ID for the client_credentials grant.")}
              />
            }
            name={["credentials", "client_id"]}
            required={!isEditing}
            rules={requiredWhenCreating("Client ID is required for M2M OAuth")}
          >
            {(control) => (
              <PasswordInput
                {...textControl(control)}
                placeholder={translateMessage("Enter OAuth client ID%{0}", [placeholderSuffix])}
                groupClassName={fieldClassName}
              />
            )}
          </MountedFormField>
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Client Secret")}
                tooltip={translateMessage("OAuth2 client secret for the client_credentials grant.")}
              />
            }
            name={["credentials", "client_secret"]}
            required={!isEditing}
            rules={requiredWhenCreating("Client Secret is required for M2M OAuth")}
          >
            {(control) => (
              <PasswordInput
                {...textControl(control)}
                placeholder={translateMessage("Enter OAuth client secret%{0}", [placeholderSuffix])}
                groupClassName={fieldClassName}
              />
            )}
          </MountedFormField>
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Token URL")}
                tooltip={translateMessage("Token endpoint URL for the client_credentials grant.")}
              />
            }
            name="token_url"
            required={!isEditing}
            rules={requiredWhenCreating("Token URL is required for M2M OAuth")}
          >
            {(control) => (
              <Input
                {...textControl(control)}
                placeholder="https://auth.example.com/oauth/token"
                className={fieldClassName}
              />
            )}
          </MountedFormField>
          <TokenEndpointAuthMethodField isEditing={isEditing} />
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Scopes (optional)")}
                tooltip={translateMessage("Optional scopes to request with the client_credentials grant.")}
              />
            }
            name={["credentials", "scopes"]}
          >
            {(control) => (
              <MultiSelect
                {...tagsControl(control)}
                placeholder={translateMessage("Add scopes")}
                className="rounded-lg"
              />
            )}
          </MountedFormField>
          <UpstreamResourceField />
          <UpstreamTokenHeaderField />
        </>
      ) : (
        <>
          <MountedFormField
            label={
              <span className="flex items-center justify-between w-full">
                <FieldLabel
                  label={translateMessage("Client ID (optional)")}
                  tooltip={translateMessage(
                    "Provide only if your MCP server cannot handle dynamic client registration.",
                  )}
                />
                {docsUrl && (
                  <a
                    href={docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-info hover:text-info/80 ml-2 font-normal"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <LocalizedText text={"Create OAuth App →"} />
                  </a>
                )}
              </span>
            }
            name={["credentials", "client_id"]}
          >
            {(control) => (
              <PasswordInput
                {...textControl(control)}
                placeholder={translateMessage("Enter client ID%{0}", [placeholderSuffix])}
                groupClassName={fieldClassName}
              />
            )}
          </MountedFormField>
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Client Secret (optional)")}
                tooltip={translateMessage("Provide only if your MCP server cannot handle dynamic client registration.")}
              />
            }
            name={["credentials", "client_secret"]}
          >
            {(control) => (
              <PasswordInput
                {...textControl(control)}
                placeholder={translateMessage("Enter client secret%{0}", [placeholderSuffix])}
                groupClassName={fieldClassName}
              />
            )}
          </MountedFormField>
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Scopes (optional)")}
                tooltip={translateMessage(
                  "Optional scopes requested during token exchange. Separate multiple scopes with enter or commas.",
                )}
              />
            }
            name={["credentials", "scopes"]}
          >
            {(control) => (
              <MultiSelect
                {...tagsControl(control)}
                placeholder={translateMessage("Add scopes")}
                className="rounded-lg"
              />
            )}
          </MountedFormField>
          <UpstreamResourceField />
          <UpstreamTokenHeaderField />
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Issuer (optional)")}
                tooltip={translateMessage(
                  "OAuth 2.0 authorization server issuer (RFC 8414). Leave empty to discover endpoints from the upstream resource; set it to pin the trust anchor, which makes this issuer's document the only endpoint source (RFC 8414 §3.3), overriding the Authorization/Token/Registration URLs above and failing closed if its metadata cannot be fetched.",
                )}
              />
            }
            name="issuer"
          >
            {(control) => (
              <Input {...textControl(control)} placeholder="https://issuer.example.com" className={fieldClassName} />
            )}
          </MountedFormField>
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Authorization URL (optional)")}
                tooltip={translateMessage("Optional override for the authorization endpoint.")}
              />
            }
            name="authorization_url"
          >
            {(control) => (
              <Input
                {...textControl(control)}
                placeholder="https://example.com/oauth/authorize"
                className={fieldClassName}
              />
            )}
          </MountedFormField>
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Token URL (optional)")}
                tooltip={translateMessage("Optional override for the token endpoint.")}
              />
            }
            name="token_url"
          >
            {(control) => (
              <Input
                {...textControl(control)}
                placeholder="https://example.com/oauth/token"
                className={fieldClassName}
              />
            )}
          </MountedFormField>
          <TokenEndpointAuthMethodField isEditing={isEditing} />
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Registration URL (optional)")}
                tooltip={translateMessage("Optional override for the dynamic client registration endpoint.")}
              />
            }
            name="registration_url"
          >
            {(control) => (
              <Input
                {...textControl(control)}
                placeholder="https://example.com/oauth/register"
                className={fieldClassName}
              />
            )}
          </MountedFormField>
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Token Validation Rules (optional)")}
                tooltip={translateMessage(
                  'JSON object of key-value rules checked against the OAuth token response before storing. Supports dot-notation for nested fields (e.g. {"organization": "my-org", "team.id": "123"}). Tokens that fail validation are rejected with HTTP 403.',
                )}
              />
            }
            name="token_validation_json"
            rules={{ validate: { json: parsesAsJson("Must be valid JSON") } }}
          >
            {(control) => (
              <Textarea
                {...textControl(control)}
                placeholder={'{\n  "organization": "my-org",\n  "team.id": "123"\n}'}
                rows={4}
                className="font-mono text-sm rounded-lg border-border focus:border-info focus:ring-ring"
              />
            )}
          </MountedFormField>
          <MountedFormField
            label={
              <FieldLabel
                label={translateMessage("Token Storage TTL (seconds, optional)")}
                tooltip={translateMessage(
                  "How long to cache each user's OAuth access token in Redis before evicting it (never longer than the token's own expires_in). Leave blank to derive the TTL from the token's expires_in, or fall back to the 12-hour default.",
                )}
              />
            }
            name="token_storage_ttl_seconds"
          >
            {(control) => (
              <Input
                {...numberControl(control)}
                min={1}
                placeholder={translateMessage("e.g. 3600")}
                className="w-full rounded-lg"
              />
            )}
          </MountedFormField>
          {oauthFlow && (
            <div className="rounded-lg border border-dashed border-border p-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                <LocalizedText
                  text={
                    "Use OAuth to fetch a fresh access token and temporarily save it in the session as the authentication value."
                  }
                />
              </p>
              <Button
                variant="secondary"
                onClick={oauthFlow.startOAuthFlow}
                disabled={oauthFlow.status === "authorizing" || oauthFlow.status === "exchanging"}
              >
                {oauthFlow.status === "authorizing"
                  ? translateMessage("Waiting for authorization...")
                  : oauthFlow.status === "exchanging"
                    ? translateMessage("Exchanging authorization code...")
                    : translateMessage("Authorize & Fetch Token")}
              </Button>
              {oauthFlow.error && <p className="text-sm text-destructive">{oauthFlow.error}</p>}
              {oauthFlow.status === "success" && oauthFlow.tokenResponse?.access_token && (
                <p className="text-sm text-success">
                  <LocalizedText text={"Token fetched. Expires in "} />
                  {oauthFlow.tokenResponse.expires_in ?? "?"}
                  <LocalizedText text={" seconds."} />
                </p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
};

export default OAuthFormFields;
