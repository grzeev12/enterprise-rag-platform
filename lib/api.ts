import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logError } from "@/lib/observability/logger";
import { redact } from "@/lib/security/redaction";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(redact(data), { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: error.flatten() },
      { status: 400 }
    );
  }

  logError("api.error", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
