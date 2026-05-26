import { safeFetchText } from "@/lib/ingestion/fetch";

type RobotsRule = {
  type: "allow" | "disallow";
  path: string;
};

export type RobotsPolicy = {
  origin: string;
  crawlDelayMs?: number;
  sitemaps: string[];
  isAllowed(url: string): boolean;
};

export async function fetchRobotsPolicy(origin: string, userAgent = "EnterpriseAISaaSBot") {
  const robotsUrl = new URL("/robots.txt", origin).toString();
  try {
    const response = await safeFetchText(robotsUrl, {
      timeoutMs: 5000,
      maxBytes: 250_000,
      userAgent
    });

    if (response.status >= 400) {
      return allowAllPolicy(origin);
    }

    return parseRobotsTxt(origin, response.body, userAgent);
  } catch {
    return allowAllPolicy(origin);
  }
}

export function parseRobotsTxt(origin: string, text: string, userAgent: string): RobotsPolicy {
  const lines = text.split(/\r?\n/);
  const normalizedAgent = userAgent.toLowerCase();
  const groups: { agents: string[]; rules: RobotsRule[]; crawlDelayMs?: number }[] = [];
  const sitemaps: string[] = [];
  let current: { agents: string[]; rules: RobotsRule[]; crawlDelayMs?: number } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0]?.trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "sitemap" && value) {
      sitemaps.push(value);
      continue;
    }

    if (key === "user-agent") {
      if (!current || current.rules.length || current.crawlDelayMs) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;

    if ((key === "allow" || key === "disallow") && value) {
      current.rules.push({ type: key, path: value });
    }

    if (key === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) {
        current.crawlDelayMs = Math.ceil(seconds * 1000);
      }
    }
  }

  const matchingGroups = groups.filter((group) =>
    group.agents.some((agent) => agent === "*" || normalizedAgent.includes(agent))
  );
  const selected = matchingGroups.at(-1);
  const rules = selected?.rules ?? [];

  return {
    origin,
    crawlDelayMs: selected?.crawlDelayMs,
    sitemaps,
    isAllowed(urlValue: string) {
      const url = new URL(urlValue);
      const path = `${url.pathname}${url.search}`;
      const match = rules
        .filter((rule) => pathMatches(rule.path, path))
        .sort((a, b) => b.path.length - a.path.length)[0];

      return match?.type !== "disallow";
    }
  };
}

function allowAllPolicy(origin: string): RobotsPolicy {
  return {
    origin,
    sitemaps: [],
    isAllowed: () => true
  };
}

function pathMatches(rulePath: string, path: string) {
  if (!rulePath) return false;
  if (rulePath === "/") return true;
  const escaped = rulePath
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\$$/, "$");
  return new RegExp(`^${escaped}`).test(path);
}
