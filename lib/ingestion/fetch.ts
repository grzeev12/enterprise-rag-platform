import { ApiError } from "@/lib/api";
import { assertPublicHostname, validatePublicHttpUrl } from "@/lib/ingestion/safe-url";

type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
  redirects?: number;
};

export type SafeFetchResponse = {
  finalUrl: string;
  status: number;
  contentType: string | null;
  body: string;
};

export async function safeFetchText(
  inputUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResponse> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxBytes = options.maxBytes ?? 1_500_000;
  const userAgent = options.userAgent ?? "EnterpriseAISaaSBot/0.1 (+respectful crawler)";
  const redirects = options.redirects ?? 0;

  const safeUrl = await validatePublicHttpUrl(inputUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(safeUrl.url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml,text/plain,application/xml;q=0.9,*/*;q=0.5"
      }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects >= 5) {
        throw new ApiError(400, "Redirect could not be followed safely");
      }
      const nextUrl = new URL(location, safeUrl.url).toString();
      await assertPublicHostname(new URL(nextUrl).hostname);
      return safeFetchText(nextUrl, { ...options, redirects: redirects + 1 });
    }

    const contentType = response.headers.get("content-type");
    const body = await readLimitedBody(response, maxBytes);

    return {
      finalUrl: response.url || safeUrl.normalizedUrl,
      status: response.status,
      contentType,
      body
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readLimitedBody(response: Response, maxBytes: number) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    received += value.byteLength;
    if (received > maxBytes) {
      reader.cancel().catch(() => undefined);
      throw new ApiError(413, "Response exceeds crawler size limit");
    }
    chunks.push(value);
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks, received));
}

function concat(chunks: Uint8Array[], length: number) {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
