"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";
import CopyButton from "@/components/shared/CopyButton";
import { buildCurlCommand, type CurlCommandInput } from "./lib/curlCommand";

interface CurlPreviewProps extends CurlCommandInput {
  errorCount?: number;
}

export default function CurlPreview({ errorCount = 0, ...input }: CurlPreviewProps) {
  useUiLocale();
  const command = buildCurlCommand(input);
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-md border">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm">
        <span className="font-medium">
          <LocalizedText text={"cURL request"} />
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {errorCount > 0 ? (
            <span role="alert" className="text-destructive">
              <LocalizedText text={"Fix "} />
              {errorCount} {errorCount === 1 ? translateMessage("issue") : translateMessage("issues")}
              <LocalizedText text={" on the Form tab before copying"} />
            </span>
          ) : (
            <>
              <span>
                <LocalizedText text={"Replace $LITELLM_API_KEY with a virtual key"} />
              </span>
              <CopyButton value={command} label={translateMessage("Copy cURL")} variant="action" />
            </>
          )}
        </div>
      </div>
      <pre
        aria-label="cURL request"
        className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap wrap-anywhere px-3 py-3 font-mono text-xs leading-5"
      >
        {command}
      </pre>
    </div>
  );
}
