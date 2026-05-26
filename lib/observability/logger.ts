import { AsyncLocalStorage } from "node:async_hooks";
import { redact } from "@/lib/security/redaction";

type LogFields = Record<string, unknown>;
type LogContext = {
  requestId?: string;
  correlationId?: string;
};

const logContext = new AsyncLocalStorage<LogContext>();

export function withLogContext<T>(context: LogContext, callback: () => T) {
  return logContext.run(context, callback);
}

export function currentLogContext() {
  return logContext.getStore() ?? {};
}

export function logInfo(event: string, fields: LogFields = {}) {
  console.log(JSON.stringify(baseLog("info", event, fields)));
}

export function logError(event: string, error: unknown, fields: LogFields = {}) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(JSON.stringify(baseLog("error", event, { ...fields, error: message })));
}

function baseLog(level: "info" | "error", event: string, fields: LogFields) {
  return {
    level,
    event,
    ...currentLogContext(),
    ...(redact(fields) as LogFields),
    at: new Date().toISOString()
  };
}
