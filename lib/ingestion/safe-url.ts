import dns from "node:dns/promises";
import net from "node:net";
import { ApiError } from "@/lib/api";

const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);
const blockedSuffixes = [".local", ".internal", ".localhost"];
const metadataHosts = new Set(["169.254.169.254", "metadata.google.internal"]);

export type SafeUrlResult = {
  url: URL;
  normalizedUrl: string;
  hostname: string;
  origin: string;
};

export function normalizeUrl(value: string, base?: string) {
  const url = base ? new URL(value, base) : new URL(value);
  url.hash = "";
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, valuePart] of params) {
    url.searchParams.append(key, valuePart);
  }
  return url.toString();
}

export async function validatePublicHttpUrl(value: string): Promise<SafeUrlResult> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, "Invalid URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ApiError(400, "Only http and https URLs are allowed");
  }

  await assertPublicHostname(url.hostname);

  return {
    url,
    normalizedUrl: normalizeUrl(url.toString()),
    hostname: url.hostname.toLowerCase(),
    origin: url.origin
  };
}

export async function assertPublicHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (
    blockedHostnames.has(normalized) ||
    blockedSuffixes.some((suffix) => normalized.endsWith(suffix)) ||
    metadataHosts.has(normalized) ||
    !normalized.includes(".")
  ) {
    throw new ApiError(400, "URL host is not allowed");
  }

  if (net.isIP(normalized)) {
    if (isBlockedIp(normalized)) {
      throw new ApiError(400, "Private or internal IP addresses are not allowed");
    }
    return;
  }

  const addresses = await dns.lookup(normalized, { all: true, verbatim: true });
  if (!addresses.length) {
    throw new ApiError(400, "URL host could not be resolved");
  }

  for (const address of addresses) {
    if (isBlockedIp(address.address)) {
      throw new ApiError(400, "URL resolves to a private or internal address");
    }
  }
}

export function isBlockedIp(address: string) {
  if (address === "0.0.0.0" || address === "::" || address === "::1") return true;

  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;

    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80") ||
      normalized === "::ffff:127.0.0.1"
    );
  }

  return true;
}

export function isAllowedDomain(url: URL, allowedDomains: string[]) {
  const host = url.hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const normalized = domain.toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

export function isExcludedPath(url: URL, excludedPaths: string[]) {
  return excludedPaths.some((path) => path && url.pathname.startsWith(path));
}
