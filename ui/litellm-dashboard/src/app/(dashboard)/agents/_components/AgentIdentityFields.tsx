"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";
import React, { useEffect, useState } from "react";
import { useWatch } from "react-hook-form";
import { apiClient } from "@/components/networking";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AgentFormField, type AgentFormValues } from "./AgentFormKit";
import { entraTenantFromIssuer, IDENTITY_UUID_PATTERN } from "./agent_identity";

const PROVIDER_OPTIONS = [
  markUiCopy({ value: "none", label: "No explicit identity binding" }, { label: "No explicit identity binding" }),
  markUiCopy({ value: "microsoft_entra", label: "Microsoft Entra ID" }, { label: "Microsoft Entra ID" }),
];
const EXECUTION_MODE_OPTIONS = [
  markUiCopy({ value: "autonomous", label: "Autonomous" }, { label: "Autonomous" }),
  markUiCopy({ value: "delegated", label: "On behalf of a user" }, { label: "On behalf of a user" }),
  markUiCopy({ value: "both", label: "Both" }, { label: "Both" }),
];
const EXECUTION_OPTIONS = [
  markUiCopy({ value: "enabled", label: "Enabled" }, { label: "Enabled" }),
  markUiCopy({ value: "disabled", label: "Disabled" }, { label: "Disabled" }),
];

export const AgentIdentityFields = ({ accessToken }: { accessToken: string | null }) => {
  useUiLocale();
  const provider = useWatch<AgentFormValues>({ name: "identity_provider" });
  const mode = useWatch<AgentFormValues>({ name: "execution_mode" });
  const showScopes = mode !== "autonomous" && mode !== undefined;
  const [tenants, setTenants] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || provider !== "microsoft_entra") return;
    let active = true;
    apiClient
      .get<string[]>("/v1/agents/identity/providers", { accessToken })
      .then((issuers) => {
        if (active) {
          setError(null);
          setTenants(
            issuers.flatMap((issuer) => {
              const tenant = entraTenantFromIssuer(issuer);
              return tenant ? [tenant] : [];
            }),
          );
        }
      })
      .catch(() => {
        if (active) setError(translateMessage("Could not load the gateway's trusted identity providers"));
      });
    return () => {
      active = false;
    };
  }, [accessToken, provider]);

  return (
    <>
      <section
        aria-label={translateMessage("Agent Identity")}
        className="my-6 space-y-4 rounded-lg border border-border p-4"
      >
        <div>
          <h3 className="font-medium">
            <LocalizedText text={"Agent Identity"} />
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            <LocalizedText
              text={
                "Connect an existing identity provider application to this agent. Its name and runtime address can change independently."
              }
            />
          </p>
        </div>
        <AgentFormField name="identity_provider" label={translateMessage("Identity Provider")} defaultValue="none">
          {({ value, onChange, id }) => (
            <Select
              items={PROVIDER_OPTIONS}
              value={typeof value === "string" ? value : "none"}
              onValueChange={onChange}
            >
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {localizedProperty(option, "label", option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </AgentFormField>
        {provider === "microsoft_entra" && (
          <>
            <AgentFormField
              name="identity_tenant_id"
              label={translateMessage("Trusted Entra Tenant")}
              rules={{ required: "Select a trusted tenant" }}
            >
              {({ value, onChange, id }) => (
                <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
                  <SelectTrigger id={id}>
                    <SelectValue placeholder={translateMessage("Select the gateway's trusted tenant")} />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant} value={tenant}>
                        {tenant}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </AgentFormField>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {!error && tenants.length === 0 && (
              <p className="text-sm text-muted-foreground">
                <LocalizedText
                  text={
                    "No trusted Entra tenant is available. Configure JWT issuer and audience validation on the gateway first. Dashboard Microsoft SSO is configured separately."
                  }
                />
              </p>
            )}
            <AgentFormField
              name="identity_client_id"
              label={translateMessage("Application (Client) ID")}
              rules={{
                required: "Enter the Entra application client ID",
                pattern: { value: IDENTITY_UUID_PATTERN, message: "Enter a valid application client UUID" },
              }}
              description={
                <>
                  <LocalizedText text={"Find this under"} />{" "}
                  <a className="underline" href="https://entra.microsoft.com/" target="_blank" rel="noreferrer">
                    <LocalizedText text={"Entra App registrations"} />
                  </a>
                  <LocalizedText
                    text={", select your agent application, then Overview. No client secret is required here."}
                  />
                </>
              }
            >
              {({ value, onChange, ref, ...control }) => (
                <Input
                  {...control}
                  ref={ref}
                  value={typeof value === "string" ? value : ""}
                  onChange={onChange}
                  placeholder={translateMessage("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")}
                />
              )}
            </AgentFormField>
            <AgentFormField name="execution_mode" label={translateMessage("Execution Mode")} defaultValue="autonomous">
              {({ value, onChange, id }) => (
                <Select
                  items={EXECUTION_MODE_OPTIONS}
                  value={typeof value === "string" ? value : "autonomous"}
                  onValueChange={onChange}
                >
                  <SelectTrigger id={id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXECUTION_MODE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {localizedProperty(option, "label", option.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </AgentFormField>
            <AgentFormField
              name="identity_service_principal_id"
              label={translateMessage("Enterprise Application Object ID")}
              rules={{
                required: mode !== "delegated" ? "Enter the service principal Object ID" : false,
                pattern: { value: IDENTITY_UUID_PATTERN, message: "Enter a valid service principal UUID" },
              }}
              description={
                <>
                  <LocalizedText text={"Open"} />{" "}
                  <a
                    className="underline"
                    href="https://entra.microsoft.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <LocalizedText text={"Entra Enterprise applications"} />
                  </a>
                  <LocalizedText
                    text={
                      ", select this application, and copy its Object ID. The App registrations Object ID is a different value."
                    }
                  />
                </>
              }
            >
              {({ value, onChange, ref, ...control }) => (
                <Input {...control} ref={ref} value={typeof value === "string" ? value : ""} onChange={onChange} />
              )}
            </AgentFormField>

            <AgentFormField
              name="identity_required_roles"
              label={translateMessage("Required Application Roles")}
              description={translateMessage("Comma-separated role values required on autonomous application tokens")}
            >
              {({ value, onChange, ref, ...control }) => (
                <Input
                  {...control}
                  ref={ref}
                  value={typeof value === "string" ? value : ""}
                  onChange={onChange}
                  placeholder={translateMessage("Agent.Invoke")}
                />
              )}
            </AgentFormField>

            {showScopes && (
              <>
                <AgentFormField
                  name="identity_required_scopes"
                  label={translateMessage("Required Delegated Scopes")}
                  defaultValue="user_impersonation"
                  rules={{ required: "Enter a delegated scope" }}
                >
                  {({ value, onChange, ref, ...control }) => (
                    <Input
                      {...control}
                      ref={ref}
                      value={typeof value === "string" ? value : "user_impersonation"}
                      onChange={onChange}
                    />
                  )}
                </AgentFormField>
                <p className="text-sm text-muted-foreground">
                  <LocalizedText
                    text={
                      "Users must first sign in through this gateway's Microsoft SSO. Subsequent delegated calls must satisfy both user and agent permissions."
                    }
                  />
                </p>
              </>
            )}
            <AgentFormField name="enabled" label={translateMessage("Execution")} defaultValue={true}>
              {({ value, onChange, id }) => (
                <Select
                  items={EXECUTION_OPTIONS}
                  value={value === false ? "disabled" : "enabled"}
                  onValueChange={(next) => onChange(next === "enabled")}
                >
                  <SelectTrigger id={id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXECUTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {localizedProperty(option, "label", option.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </AgentFormField>
            <p className="text-sm text-muted-foreground">
              <LocalizedText
                text={
                  "LiteLLM verifies the agent's Entra token before matching this identity. Saving these fields configures the binding; an authenticated request provides verification. Runtime authentication headers are configured separately."
                }
              />
            </p>
          </>
        )}
      </section>
    </>
  );
};
