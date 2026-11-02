"use client";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldTitle } from "@/components/ui/field";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { AgentFormField, AgentFormValues, labelWithHint } from "./AgentFormKit";
import { KILL_SWITCH_AUTH_TYPES, KILL_SWITCH_METHODS, validateKillSwitchBody } from "./kill_switch_config";

const KeyValueFieldArray = ({
  name,
  addLabel,
  keyPlaceholder,
  valuePlaceholder,
}: {
  name: "kill_switch.headers" | "kill_switch.query_params";
  addLabel: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) => {
  useUiLocale();
  const { control } = useFormContext<AgentFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <div className="flex flex-col gap-2">
      {fields.map((item, index) => (
        <div key={item.id} className="flex items-start gap-2">
          <AgentFormField name={`${name}.${index}.key`} rules={{ required: "Name required" }}>
            {({ value, onChange, ref, ...control }) => (
              <Input
                {...control}
                ref={ref}
                className="w-55"
                placeholder={keyPlaceholder}
                value={typeof value === "string" ? value : ""}
                onChange={onChange}
              />
            )}
          </AgentFormField>
          <AgentFormField name={`${name}.${index}.value`}>
            {({ value, onChange, ref, ...control }) => (
              <Input
                {...control}
                ref={ref}
                className="w-65"
                placeholder={valuePlaceholder}
                value={typeof value === "string" ? value : ""}
                onChange={onChange}
              />
            )}
          </AgentFormField>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={translateMessage("Remove %{0}", [addLabel.replace(/^Add /, "").toLowerCase()])}
            className="text-destructive hover:text-destructive/80"
            onClick={() => remove(index)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => append({})}>
        <Plus />
        {addLabel}
      </Button>
    </div>
  );
};

const TextField = (cocaCopyProps0: {
  name: `kill_switch.${string}`;
  label: React.ReactNode;
  placeholder?: string;
  required?: string;
  secret?: boolean;
}) => {
  const { name, label, placeholder, required, secret } = cocaCopyProps0;
  useUiLocale();
  return (
    <AgentFormField
      name={name}
      label={localizedProperty(cocaCopyProps0, "label", label)}
      rules={required ? { required } : undefined}
    >
      {({ value, onChange, ref, ...control }) =>
        secret ? (
          <PasswordInput
            {...control}
            ref={ref}
            placeholder={localizedProperty(cocaCopyProps0, "placeholder", placeholder)}
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
          />
        ) : (
          <Input
            {...control}
            ref={ref}
            placeholder={localizedProperty(cocaCopyProps0, "placeholder", placeholder)}
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
          />
        )
      }
    </AgentFormField>
  );
};

const KillSwitchAuthFields = () => {
  useUiLocale();
  const { control } = useFormContext<AgentFormValues>();
  const authType = useWatch({ control, name: "kill_switch.auth_type" });

  switch (authType) {
    case "bearer":
      return (
        <TextField
          name="kill_switch.auth_token"
          label={translateMessage("Bearer token")}
          required="Token required"
          secret
        />
      );
    case "api_key":
      return (
        <>
          <TextField
            name="kill_switch.auth_header_name"
            label={translateMessage("Header name")}
            placeholder={translateMessage("X-API-Key")}
          />
          <TextField
            name="kill_switch.auth_api_key"
            label={translateMessage("API key")}
            required="API key required"
            secret
          />
        </>
      );
    case "basic":
      return (
        <>
          <TextField
            name="kill_switch.auth_username"
            label={translateMessage("Username")}
            required="Username required"
          />
          <TextField
            name="kill_switch.auth_password"
            label={translateMessage("Password")}
            required="Password required"
            secret
          />
        </>
      );
    default:
      return null;
  }
};

const KillSwitchFormFields = () => {
  useUiLocale();
  return (
    <>
      <TextField
        name="kill_switch.url"
        label={labelWithHint(
          "Webhook URL",
          "Absolute http(s) URL LiteLLM calls when the kill switch is triggered. Leave empty to remove the kill switch.",
        )}
        placeholder="https://example.com/hooks/kill-agent"
      />

      <AgentFormField name="kill_switch.method" label={translateMessage("Method")}>
        {({ value, onChange, ref: _ref, ...control }) => (
          <Select value={typeof value === "string" ? value : "POST"} onValueChange={onChange}>
            <SelectTrigger {...control} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KILL_SWITCH_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </AgentFormField>

      <Field>
        <FieldTitle>
          <LocalizedText text={"Headers"} />
        </FieldTitle>
        <KeyValueFieldArray
          name="kill_switch.headers"
          addLabel="Add Header"
          keyPlaceholder="Header name"
          valuePlaceholder="Header value"
        />
      </Field>

      <Field>
        <FieldTitle>
          <LocalizedText text={"Query Parameters"} />
        </FieldTitle>
        <KeyValueFieldArray
          name="kill_switch.query_params"
          addLabel="Add Query Parameter"
          keyPlaceholder="Parameter name"
          valuePlaceholder="Parameter value"
        />
      </Field>

      <AgentFormField
        name="kill_switch.body"
        label={labelWithHint("JSON Body", "Optional JSON object sent as the request body")}
        rules={{ validate: (value) => validateKillSwitchBody(typeof value === "string" ? value : "") }}
      >
        {({ value, onChange, ref, ...control }) => (
          <Textarea
            {...control}
            ref={ref}
            rows={4}
            placeholder='{"reason": "manual kill switch"}'
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
          />
        )}
      </AgentFormField>

      <AgentFormField name="kill_switch.auth_type" label={translateMessage("Authentication")}>
        {({ value, onChange, ref: _ref, ...control }) => (
          <Select value={typeof value === "string" ? value : "none"} onValueChange={onChange}>
            <SelectTrigger {...control} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KILL_SWITCH_AUTH_TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {localizedProperty(option, "label", option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </AgentFormField>

      <KillSwitchAuthFields />
    </>
  );
};

export default KillSwitchFormFields;
