const databaseErrorPatterns = [
  "could not find the table",
  "schema cache",
  "postgrest",
  "pgrst",
  "42p01",
  "42703",
  "relation",
  "column",
  "permission denied",
  "row-level security",
  "violates row-level security",
  "jwt",
  "fetch failed",
];

export function getFriendlyErrorMessage(
  value: unknown,
  fallback = "Unable to load this data right now. Please try again.",
) {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  const normalizedMessage = message.toLowerCase();

  if (!message) {
    return fallback;
  }

  if (databaseErrorPatterns.some((pattern) => normalizedMessage.includes(pattern))) {
    return fallback;
  }

  return message;
}

export function logDeveloperError(label: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(label, error);
  }
}
