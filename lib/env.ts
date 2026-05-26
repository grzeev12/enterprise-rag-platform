export function readEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length ? value : undefined;
}

export function requireEnv(name: string, feature: string) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`${name} is required to use ${feature}`);
  }
  return value;
}

export function readIntEnv(name: string, fallback: number) {
  const value = readEnv(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readNumberEnv(name: string, fallback: number) {
  const value = readEnv(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
