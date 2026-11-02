import { markUiCopy } from "@/lib/i18n";
import { z } from "zod";

const analysisAccessFields = { model: z.string().nullable(), budget: z.string() };
const workerFormFields = {
  useExisting: z.boolean(),
  analysisKey: z.string().nullable(),
  access: z.object(analysisAccessFields),
};
export const analysisAccessSchema = z
  .object(analysisAccessFields)
  .superRefine((access, ctx) => {
    if (!access.model || !Number.isFinite(Number(access.budget)) || Number(access.budget) <= 0)
      ctx.addIssue(
        markUiCopy(
          { code: "custom" as const, message: "Choose a model and a monthly limit greater than zero" },
          { message: "Choose a model and a monthly limit greater than zero" },
        ),
      );
  })
  .transform((access) => ({ model: access.model ?? "", budget: Number(access.budget) }));

export type AnalysisAccess = z.input<typeof analysisAccessSchema>;

export const workerFormSchema = z.object(workerFormFields).superRefine((values, ctx) => {
  if (values.useExisting) {
    if (!values.analysisKey) {
      ctx.addIssue(
        markUiCopy(
          {
            code: "custom" as const,
            message: "Choose an existing virtual key",
            path: ["analysisKey"],
          },
          { message: "Choose an existing virtual key" },
        ),
      );
    }
  } else {
    const result = analysisAccessSchema.safeParse(values.access);
    if (!result.success) {
      ctx.addIssue({
        code: "custom",
        message: result.error.issues[0].message,
        path: ["access"],
      });
    }
  }
});

export type WorkerFormInput = z.input<typeof workerFormSchema>;
