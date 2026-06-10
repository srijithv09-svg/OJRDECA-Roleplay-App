import type { z } from "zod";

export type SchemaValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errorMessage: string; issues: string[] };

export function validateWithSchema<T>(schema: z.ZodType<T>, value: unknown): SchemaValidationResult<T> {
  const result = schema.safeParse(value);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  const issues = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });

  return {
    ok: false,
    errorMessage: issues.length > 0 ? issues.join("; ") : "AI response did not match schema.",
    issues,
  };
}
