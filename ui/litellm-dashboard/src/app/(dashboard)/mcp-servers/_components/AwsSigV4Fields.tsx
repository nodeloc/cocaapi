"use client";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import { Info } from "lucide-react";
import React from "react";
import { SimpleTooltip } from "@/components/ui/tooltip";

import { MountedFormField } from "@/components/common_components/MountedFormField";
import { requiredRule } from "@/components/common_components/formRules";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Input } from "@/components/ui/input";
import { requiredWhenSiblingSet, textControl } from "./mcpFieldRules";

const fieldClassName = "rounded-lg border-border focus:border-info focus:ring-ring";

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

const ACCESS_KEY_PATH = ["credentials", "aws_access_key_id"] as const;
const SECRET_KEY_PATH = ["credentials", "aws_secret_access_key"] as const;

const AwsSigV4Fields: React.FC = () => {
  useUiLocale();
  return (
    <>
      <p className="text-sm text-muted-foreground mb-2">
        <LocalizedText text={"For MCP servers hosted on AWS Bedrock AgentCore."} />{" "}
        <a
          href="https://docs.litellm.ai/docs/mcp_aws_sigv4"
          target="_blank"
          rel="noopener noreferrer"
          className="text-info hover:text-info/80"
        >
          <LocalizedText text={"View docs →"} />
        </a>
      </p>
      <MountedFormField
        label={
          <FieldLabel
            label={translateMessage("AWS Region")}
            tooltip={translateMessage("AWS region for SigV4 signing (e.g., us-east-1)")}
          />
        }
        name={["credentials", "aws_region_name"]}
        required
        rules={{ validate: { required: requiredRule("AWS region is required for SigV4 auth") } }}
      >
        {(control) => (
          <Input {...textControl(control)} placeholder={translateMessage("us-east-1")} className={fieldClassName} />
        )}
      </MountedFormField>
      <MountedFormField
        label={
          <FieldLabel
            label={translateMessage("AWS Service Name")}
            tooltip={translateMessage("AWS service name for SigV4 signing. Defaults to 'bedrock-agentcore'.")}
          />
        }
        name={["credentials", "aws_service_name"]}
      >
        {(control) => (
          <Input
            {...textControl(control)}
            placeholder={translateMessage("bedrock-agentcore")}
            className={fieldClassName}
          />
        )}
      </MountedFormField>
      <MountedFormField
        label={
          <FieldLabel
            label={translateMessage("AWS Access Key ID")}
            tooltip={translateMessage(
              "Optional. If not provided, falls back to the boto3 credential chain (IAM role, env vars, etc.).",
            )}
          />
        }
        name={ACCESS_KEY_PATH}
        rules={{
          deps: ["credentials.aws_secret_access_key"],
          validate: {
            pairedWithSecret: requiredWhenSiblingSet(
              SECRET_KEY_PATH,
              "Access Key ID is required when Secret Access Key is provided",
            ),
          },
        }}
      >
        {(control) => (
          <PasswordInput
            {...textControl(control)}
            placeholder={translateMessage("AKIA... (optional — uses IAM role if blank)")}
            groupClassName={fieldClassName}
          />
        )}
      </MountedFormField>
      <MountedFormField
        label={
          <FieldLabel
            label={translateMessage("AWS Secret Access Key")}
            tooltip={translateMessage("Optional. Required if AWS Access Key ID is provided.")}
          />
        }
        name={SECRET_KEY_PATH}
        rules={{
          deps: ["credentials.aws_access_key_id"],
          validate: {
            pairedWithAccessKey: requiredWhenSiblingSet(
              ACCESS_KEY_PATH,
              "Secret Access Key is required when Access Key ID is provided",
            ),
          },
        }}
      >
        {(control) => (
          <PasswordInput
            {...textControl(control)}
            placeholder={translateMessage("Enter secret key (optional — uses IAM role if blank)")}
            groupClassName={fieldClassName}
          />
        )}
      </MountedFormField>
      <MountedFormField
        label={
          <FieldLabel
            label={translateMessage("AWS Session Token")}
            tooltip={translateMessage("Optional. Only needed for temporary STS credentials.")}
          />
        }
        name={["credentials", "aws_session_token"]}
      >
        {(control) => (
          <PasswordInput
            {...textControl(control)}
            placeholder={translateMessage("Enter session token (optional)")}
            groupClassName={fieldClassName}
          />
        )}
      </MountedFormField>
      <MountedFormField
        label={
          <FieldLabel
            label={translateMessage("AWS Role ARN")}
            tooltip={translateMessage(
              "Optional. IAM role ARN to assume via STS before signing. If set, LiteLLM calls sts:AssumeRole to get temporary credentials. Uses ambient credentials (IAM role, env vars) as the source identity unless explicit keys are also provided.",
            )}
          />
        }
        name={["credentials", "aws_role_name"]}
      >
        {(control) => (
          <Input
            {...textControl(control)}
            placeholder={translateMessage("arn:aws:iam::123456789012:role/MyRole (optional)")}
            className={fieldClassName}
          />
        )}
      </MountedFormField>
      <MountedFormField
        label={
          <FieldLabel
            label={translateMessage("AWS Session Name")}
            tooltip={translateMessage(
              "Optional. Session name for the AssumeRole call — appears in CloudTrail logs. Auto-generated if omitted.",
            )}
          />
        }
        name={["credentials", "aws_session_name"]}
      >
        {(control) => (
          <Input
            {...textControl(control)}
            placeholder={translateMessage("litellm-prod (optional, auto-generated if blank)")}
            className={fieldClassName}
          />
        )}
      </MountedFormField>
    </>
  );
};

export default AwsSigV4Fields;
