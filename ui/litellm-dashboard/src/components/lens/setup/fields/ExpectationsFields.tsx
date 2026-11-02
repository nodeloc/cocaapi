"use client";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { WatchPicker } from "../WatchPicker";

import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import type { InvestigationInput } from "../investigationSchema";

export function ExpectationsFields() {
  useUiLocale();
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<InvestigationInput>();
  const { fields, append, remove } = useFieldArray({ control, name: "questions", keyName: "fieldId" });
  return (
    <div className="space-y-5">
      <label className="grid gap-2 text-sm font-medium">
        <LocalizedText text={"What should the agent be doing?"} />
        <Textarea
          {...register("context")}
          rows={4}
          placeholder={translateMessage(
            "Answer the customer's question using verified sources and explain when information is missing.",
          )}
        />
      </label>
      {errors.context?.message && (
        <p role="alert" className="text-sm text-destructive">
          {localizedProperty(errors.context, "message")}
        </p>
      )}
      <Controller
        control={control}
        name="watching"
        render={({ field }) => (
          <WatchPicker
            selected={new Set(field.value)}
            onChange={(values) => field.onChange([...values])}
            onAddCustom={() => append({ id: crypto.randomUUID(), instruction: "", enabled: true })}
          />
        )}
      />
      <fieldset className="space-y-2">
        <legend className="sr-only">
          <LocalizedText text={"Custom checks"} />
        </legend>
        {fields.map((check, index) => (
          <div key={check.fieldId} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Textarea
                aria-label={translateMessage("Check %{0}", [index + 1])}
                {...register(`questions.${index}.instruction`)}
                rows={2}
                placeholder={translateMessage("e.g. Quotes a price without checking the pricing tool")}
              />
              {errors.questions?.[index]?.instruction?.message && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {localizedProperty(errors.questions[index].instruction, "message")}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={translateMessage("Remove check %{0}", [index + 1])}
              onClick={() => remove(index)}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
