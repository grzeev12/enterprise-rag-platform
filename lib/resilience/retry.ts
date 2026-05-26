export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = "operation") {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function retry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; delayMs?: number; factor?: number } = {}
) {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 250;
  const factor = options.factor ?? 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * factor ** (attempt - 1)));
      }
    }
  }

  throw lastError;
}
