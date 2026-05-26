const sensitiveKeys = ["password", "secret", "token", "apiKey", "authorization", "cookie", "connectionString"];

export function redact(value: unknown): unknown {
  if (value instanceof Error) {
    return redactMessage(value.message);
  }
  if (typeof value === "string") return redactMessage(value);
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))
        ? "[REDACTED]"
        : redact(entry)
    ])
  );
}

export function redactMessage(message: string) {
  return message
    .replaceAll(/(sk-[A-Za-z0-9_-]{12,})/g, "[REDACTED]")
    .replaceAll(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
    .replaceAll(/(postgres(?:ql)?:\/\/)[^\s]+/gi, "$1[REDACTED]")
    .replaceAll(/(rediss?:\/\/)[^\s]+/gi, "$1[REDACTED]");
}
