import crypto from "node:crypto";
import { normalizeUrl } from "@/lib/ingestion/safe-url";

export type ExtractedHtml = {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  text: string;
  links: string[];
  language: string | null;
  contentHash: string;
};

export function extractHtml(html: string, pageUrl: string): ExtractedHtml {
  const title = decodeEntities(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const metaDescription = decodeEntities(
    matchFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ??
      matchFirst(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i)
  );
  const canonicalHref = matchFirst(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i);
  const language = matchFirst(html, /<html[^>]+lang=["']([^"']+)["']/i);
  const canonicalUrl = canonicalHref ? normalizeUrl(canonicalHref, pageUrl) : null;
  const links = extractLinks(html, pageUrl);
  const text = extractReadableText(html);

  return {
    title,
    metaDescription,
    canonicalUrl,
    text,
    links,
    language,
    contentHash: crypto.createHash("sha256").update(text).digest("hex")
  };
}

export function extractReadableText(html: string) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");

  return (
    decodeEntities(
    withoutNoise
      .replace(/<(br|p|div|section|article|li|h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    ) ?? ""
  );
}

export function extractLinks(html: string, pageUrl: string) {
  const links = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html))) {
    const href = match[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }
    try {
      links.add(normalizeUrl(href, pageUrl));
    } catch {
      continue;
    }
  }

  return [...links];
}

function matchFirst(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1]?.trim() ?? null;
}

function decodeEntities(value: string | null) {
  if (!value) return null;
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}
