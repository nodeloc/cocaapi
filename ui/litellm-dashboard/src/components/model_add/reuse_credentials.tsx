"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import { z } from "zod";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FormField } from "@/components/shared/form/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useZodForm } from "@/lib/forms/useZodForm";
import { CredentialItem } from "../networking";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ReuseCredentialsModalProps {
  isVisible: boolean;
  onCancel: () => void;
  onAddCredential: (values: Record<string, unknown>) => void;
  existingCredential: CredentialItem | null;
  setIsCredentialModalOpen: (isVisible: boolean) => void;
}

const reuseCredentialsSchema = z.object({
  credential_name: z.string().min(1, "Credential name is required"),
});

type ReuseCredentialsFormValues = z.infer<typeof reuseCredentialsSchema>;

const storedValuesOf = (existingCredential: CredentialItem | null): Record<string, unknown> => {
  const values: unknown = existingCredential?.credential_values;
  return typeof values === "object" && values !== null ? (values as Record<string, unknown>) : {};
};

const ReuseCredentialsModal: React.FC<ReuseCredentialsModalProps> = ({
  isVisible,
  onCancel,
  onAddCredential,
  existingCredential,
  setIsCredentialModalOpen,
}) => {
  useUiLocale();
  const fieldIdPrefix = React.useId();
  const storedValues = storedValuesOf(existingCredential);
  const form = useZodForm(reuseCredentialsSchema, {
    defaultValues: { credential_name: existingCredential?.credential_name ?? "" },
  });

  const handleSubmit = (values: ReuseCredentialsFormValues) => {
    onAddCredential({ ...storedValues, ...values });
    form.reset();
    setIsCredentialModalOpen(false);
  };

  const handleCancel = () => {
    onCancel();
    form.reset();
  };

  return (
    <Dialog open={isVisible} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            <LocalizedText text={"Reuse Credentials"} />
          </DialogTitle>
        </DialogHeader>
        <TooltipProvider>
          <form onSubmit={form.handleSubmit(handleSubmit)} noValidate>
            <FieldGroup>
              <FormField control={form.control} name="credential_name" label={translateMessage("Credential Name:")}>
                {({ ref, ...field }) => (
                  <Input
                    {...field}
                    ref={ref}
                    placeholder={translateMessage("Enter a friendly name for these credentials")}
                  />
                )}
              </FormField>

              {Object.entries(storedValues).map(([key, value]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`${fieldIdPrefix}-${key}`}>{key}</FieldLabel>
                  <Input
                    id={`${fieldIdPrefix}-${key}`}
                    value={String(value)}
                    placeholder={translateMessage("Enter %{0}", [key])}
                    disabled
                    readOnly
                  />
                </Field>
              ))}

              <div className="flex items-center justify-between">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <a
                        href="https://github.com/BerriAI/litellm/issues"
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        <LocalizedText text={"Need Help?"} />
                      </a>
                    }
                  />
                  <TooltipContent>
                    <LocalizedText text={"Get help on our github"} />
                  </TooltipContent>
                </Tooltip>

                <div className="flex gap-2.5">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    <LocalizedText text={"Cancel"} />
                  </Button>
                  <Button type="submit">
                    <LocalizedText text={"Reuse Credentials"} />
                  </Button>
                </div>
              </div>
            </FieldGroup>
          </form>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
};

export default ReuseCredentialsModal;
