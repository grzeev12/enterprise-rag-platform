type LogFields = Record<string, unknown>;

export function logInfo(event: string, fields: LogFields = {}) {
  console.log(JSON.stringify({ level: "info", event, ...fields, at: new Date().toISOString() }));
}

export function logError(event: string, error: unknown, fields: LogFields = {}) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(JSON.stringify({ level: "error", event, error: message, ...fields, at: new Date().toISOString() }));
}
