export type RetryClassification = "retryable" | "non_retryable" | "timeout" | "rate_limited";

export class AiCircuitOpenError extends Error {
  statusCode = 503;
  retryable = true;
  constructor(public readonly feature: string) {
    super(`AI circuit is open for ${feature}.`);
    this.name = "AiCircuitOpenError";
  }
}

export interface AiCallPolicyOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export function createAiCallPolicy(options: AiCallPolicyOptions = {}) {
  const timeoutMs = positive(options.timeoutMs, 30_000);
  const maxAttempts = positive(options.maxAttempts, 3);
  const baseDelayMs = positive(options.baseDelayMs, 250);
  const maxDelayMs = positive(options.maxDelayMs, 4_000);
  const failureThreshold = positive(options.failureThreshold, 5);
  const resetTimeoutMs = positive(options.resetTimeoutMs, 30_000);
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now || Date.now;
  const random = options.random || Math.random;
  const circuits = new Map<string, { failures: number; openedAt: number }>();

  async function execute<T>({
    feature,
    primaryModel,
    fallbackModels = [],
    timeoutMs: requestTimeoutMs,
    signal,
    operation,
  }: {
    feature: string;
    primaryModel: string;
    fallbackModels?: string[];
    timeoutMs?: number;
    signal?: AbortSignal;
    operation: (context: { model: string; attempt: number; signal: AbortSignal }) => Promise<T>;
  }): Promise<T & { selectedModel?: string }> {
    assertCircuit(feature);
    const activeTimeoutMs = positive(requestTimeoutMs, timeoutMs);
    const models = [...new Set([primaryModel, ...fallbackModels].map((item) => String(item || "").trim()).filter(Boolean))];
    let lastError: unknown;
    let attempt = 0;

    for (const model of models) {
      for (let modelAttempt = 1; modelAttempt <= maxAttempts; modelAttempt += 1) {
        attempt += 1;
        try {
          const result = await withTimeout((timeoutSignal) => operation({ model, attempt, signal: timeoutSignal }), {
            timeoutMs: activeTimeoutMs,
            signal,
          });
          circuits.delete(feature);
          if (result && typeof result === "object") return Object.assign(result, { selectedModel: model });
          return result as T & { selectedModel?: string };
        } catch (error) {
          lastError = error;
          const classification = classifyAiCallError(error);
          if (classification === "non_retryable") throw error;
          const mayRetry = modelAttempt < maxAttempts;
          if (!mayRetry) break;
          const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** (modelAttempt - 1)));
          await sleep(Math.round(exponential * (0.75 + random() * 0.5)));
        }
      }
    }

    const state = circuits.get(feature) || { failures: 0, openedAt: 0 };
    state.failures += 1;
    if (state.failures >= failureThreshold) state.openedAt = now();
    circuits.set(feature, state);
    throw lastError;
  }

  function assertCircuit(feature: string) {
    const state = circuits.get(feature);
    if (!state?.openedAt) return;
    if (now() - state.openedAt >= resetTimeoutMs) {
      circuits.set(feature, { failures: 0, openedAt: 0 });
      return;
    }
    throw new AiCircuitOpenError(feature);
  }

  return { execute, getCircuitState: (feature: string) => ({ ...(circuits.get(feature) || { failures: 0, openedAt: 0 }) }) };
}

export function classifyAiCallError(error: any): RetryClassification {
  if (error?.name === "AbortError" || error?.code === "ETIMEDOUT" || error?.code === "ECONNABORTED") return "timeout";
  const status = Number(error?.statusCode || error?.status || error?.response?.status || 0);
  if (status === 429) return "rate_limited";
  if ([408, 409, 425].includes(status) || status >= 500) return "retryable";
  if (["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND"].includes(error?.code)) return "retryable";
  return "non_retryable";
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, { timeoutMs, signal }: { timeoutMs: number; signal?: AbortSignal }): Promise<T> {
  const controller = new AbortController();
  let rejectAbort: ((reason: unknown) => void) | null = null;
  const abort = () => {
    const reason = signal?.reason || Object.assign(new Error("AI call aborted"), { name: "AbortError" });
    controller.abort(reason);
    rejectAbort?.(reason);
  };
  signal?.addEventListener("abort", abort, { once: true });
  const timeoutError = Object.assign(new Error(`AI call timed out after ${timeoutMs}ms`), {
    name: "TimeoutError",
    code: "ETIMEDOUT",
    statusCode: 504,
    retryable: true,
  });
  let timer: NodeJS.Timeout;
  const deadline = new Promise<never>((_, reject) => {
    rejectAbort = reject;
    timer = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });
  try {
    if (signal?.aborted) abort();
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    clearTimeout(timer!);
    signal?.removeEventListener("abort", abort);
  }
}

function positive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}
