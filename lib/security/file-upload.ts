import { ApiError } from "@/lib/api";

const allowedMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

export function validateUploadMetadata(input: {
  filename: string;
  contentType: string;
  sizeBytes: number;
  maxBytes?: number;
}) {
  const maxBytes = input.maxBytes ?? 20 * 1024 * 1024;
  if (!input.filename || input.filename.includes("/") || input.filename.includes("\\")) {
    throw new ApiError(400, "Invalid filename");
  }
  if (!allowedMimeTypes.has(input.contentType)) {
    throw new ApiError(400, "Unsupported file type");
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > maxBytes) {
    throw new ApiError(413, "File size exceeds upload limit");
  }
}

export function allowedUploadMimeTypes() {
  return [...allowedMimeTypes];
}
