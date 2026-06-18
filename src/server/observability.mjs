import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

export const REQUEST_ID_HEADER = "x-request-id";
export const RESPONSE_REQUEST_ID_HEADER = "X-Request-Id";

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/u;
const DEFAULT_AI_FAILURE_RATE_ALERT = 0.2;
const DEFAULT_API_AVERAGE_LATENCY_ALERT_MS = 1500;
const DEFAULT_RAG_AVERAGE_LATENCY_ALERT_MS = 2500;
const DEFAULT_BACKUP_MAX_AGE_HOURS = 24;

export function monotonicNowMs() {
  return performance.now();
}

export function getOrCreateRequestId(request) {
  const raw = request?.headers?.[REQUEST_ID_HEADER];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return normalizeRequestId(candidate) || randomUUID();
}

export function normalizeRequestId(value) {
  const text = String(value || "").trim();
  return REQUEST_ID_PATTERN.test(text) ? text : "";
}

export function createConsoleStructuredLogger(consoleLike = console) {
  return {
    info(event) {
      consoleLike.info(JSON.stringify(event));
    },
    warn(event) {
      consoleLike.warn(JSON.stringify(event));
    },
    error(event) {
      consoleLike.error(JSON.stringify(event));
    },
  };
}

export function createMetricsStore({
  now = () => new Date(),
  alertConfig = {},
} = {}) {
  const startedAt = now().toISOString();
  const http = createHttpMetrics();
  const ai = createAiMetrics();
  const rag = createRagMetrics();
  const alerts = {
    aiFailureRate: Number(alertConfig.aiFailureRate ?? DEFAULT_AI_FAILURE_RATE_ALERT),
    apiAverageLatencyMs: Number(alertConfig.apiAverageLatencyMs ?? DEFAULT_API_AVERAGE_LATENCY_ALERT_MS),
    ragAverageLatencyMs: Number(alertConfig.ragAverageLatencyMs ?? DEFAULT_RAG_AVERAGE_LATENCY_ALERT_MS),
    backupMaxAgeHours: Number(alertConfig.backupMaxAgeHours ?? DEFAULT_BACKUP_MAX_AGE_HOURS),
  };

  function recordHttpRequest({ method = "", route = "", statusCode = 0, durationMs = 0 } = {}) {
    const roundedDurationMs = roundDuration(durationMs);
    const statusClass = statusCode ? `${Math.floor(statusCode / 100)}xx` : "unknown";
    http.total += 1;
    http.totalDurationMs += roundedDurationMs;
    http.maxDurationMs = Math.max(http.maxDurationMs, roundedDurationMs);
    increment(http.byMethod, method || "UNKNOWN");
    increment(http.byStatusClass, statusClass);
    increment(http.byRoute, route || "unknown");
  }

  function recordAiCall({
    feature = "unknown",
    ok = true,
    statusCode = 0,
    durationMs = 0,
  } = {}) {
    const roundedDurationMs = roundDuration(durationMs);
    ai.total += 1;
    ai.totalDurationMs += roundedDurationMs;
    ai.maxDurationMs = Math.max(ai.maxDurationMs, roundedDurationMs);
    if (!ok) ai.failures += 1;
    const bucket = ai.byFeature[feature] || createAiFeatureMetrics();
    bucket.total += 1;
    bucket.totalDurationMs += roundedDurationMs;
    bucket.maxDurationMs = Math.max(bucket.maxDurationMs, roundedDurationMs);
    if (!ok) bucket.failures += 1;
    if (statusCode) increment(bucket.byStatusCode, String(statusCode));
    ai.byFeature[feature] = bucket;
  }

  function recordRagRetrieval({
    intent = "unknown",
    durationMs = 0,
    selectedDocuments = 0,
    totalDocuments = 0,
  } = {}) {
    const roundedDurationMs = roundDuration(durationMs);
    rag.total += 1;
    rag.totalDurationMs += roundedDurationMs;
    rag.maxDurationMs = Math.max(rag.maxDurationMs, roundedDurationMs);
    rag.totalSelectedDocuments += Number(selectedDocuments) || 0;
    rag.totalDocuments += Number(totalDocuments) || 0;
    increment(rag.byIntent, intent || "unknown");
  }

  function snapshot({ backupStatus = null } = {}) {
    const httpAverageLatencyMs = average(http.totalDurationMs, http.total);
    const aiAverageLatencyMs = average(ai.totalDurationMs, ai.total);
    const aiFailureRate = average(ai.failures, ai.total);
    const ragAverageRetrievalMs = average(rag.totalDurationMs, rag.total);
    return {
      startedAt,
      generatedAt: now().toISOString(),
      http: {
        totalRequests: http.total,
        averageLatencyMs: httpAverageLatencyMs,
        maxLatencyMs: http.maxDurationMs,
        byMethod: { ...http.byMethod },
        byStatusClass: { ...http.byStatusClass },
        byRoute: { ...http.byRoute },
      },
      ai: {
        totalCalls: ai.total,
        failedCalls: ai.failures,
        failureRate: aiFailureRate,
        averageLatencyMs: aiAverageLatencyMs,
        maxLatencyMs: ai.maxDurationMs,
        byFeature: Object.fromEntries(
          Object.entries(ai.byFeature).map(([feature, value]) => [
            feature,
            {
              totalCalls: value.total,
              failedCalls: value.failures,
              failureRate: average(value.failures, value.total),
              averageLatencyMs: average(value.totalDurationMs, value.total),
              maxLatencyMs: value.maxDurationMs,
              byStatusCode: { ...value.byStatusCode },
            },
          ]),
        ),
      },
      rag: {
        retrievalCount: rag.total,
        averageRetrievalMs: ragAverageRetrievalMs,
        maxRetrievalMs: rag.maxDurationMs,
        averageSelectedDocuments: average(rag.totalSelectedDocuments, rag.total),
        averageTotalDocuments: average(rag.totalDocuments, rag.total),
        byIntent: { ...rag.byIntent },
      },
      backup: backupStatus,
      alerts: buildAlerts({
        aiFailureRate,
        httpAverageLatencyMs,
        ragAverageRetrievalMs,
        backupStatus,
        thresholds: alerts,
      }),
    };
  }

  return {
    recordHttpRequest,
    recordAiCall,
    recordRagRetrieval,
    snapshot,
  };
}

export function getLatestBackupStatus({
  root = process.cwd(),
  env = process.env,
  now = () => new Date(),
} = {}) {
  const backupDir = env.DATABASE_BACKUP_DIR || join(root, "backups", "sqlite");
  if (!existsSync(backupDir)) {
    return {
      directory: backupDir,
      exists: false,
      latestBackupFile: "",
      latestBackupAt: "",
      ageHours: null,
    };
  }

  const candidates = readdirSync(backupDir)
    .filter((file) => file.endsWith(".sqlite"))
    .map((file) => {
      const fullPath = join(backupDir, file);
      const stats = statSync(fullPath);
      return { file, fullPath, modifiedAt: stats.mtime };
    })
    .sort((left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime());

  const latest = candidates[0];
  if (!latest) {
    return {
      directory: backupDir,
      exists: true,
      latestBackupFile: "",
      latestBackupAt: "",
      ageHours: null,
    };
  }

  const ageHours = Math.max(0, (now().getTime() - latest.modifiedAt.getTime()) / 3_600_000);
  return {
    directory: backupDir,
    exists: true,
    latestBackupFile: latest.file,
    latestBackupAt: latest.modifiedAt.toISOString(),
    ageHours: roundMetric(ageHours),
  };
}

export function buildStructuredEvent({
  level = "info",
  event,
  requestId = "",
  details = {},
} = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    requestId,
    ...sanitizeLogDetails(details),
  };
}

export function sanitizeLogDetails(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeLogDetails);
  if (!value || typeof value !== "object") return sanitizeScalar(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? "[redacted]" : sanitizeLogDetails(entry),
    ]),
  );
}

function createHttpMetrics() {
  return {
    total: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    byMethod: {},
    byStatusClass: {},
    byRoute: {},
  };
}

function createAiMetrics() {
  return {
    total: 0,
    failures: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    byFeature: {},
  };
}

function createAiFeatureMetrics() {
  return {
    total: 0,
    failures: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    byStatusCode: {},
  };
}

function createRagMetrics() {
  return {
    total: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    totalSelectedDocuments: 0,
    totalDocuments: 0,
    byIntent: {},
  };
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function average(total, count) {
  return count ? roundMetric(total / count) : 0;
}

function roundDuration(value) {
  return Math.round(Number(value) || 0);
}

function roundMetric(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function buildAlerts({
  aiFailureRate,
  httpAverageLatencyMs,
  ragAverageRetrievalMs,
  backupStatus,
  thresholds,
}) {
  const alerts = [];
  if (aiFailureRate > thresholds.aiFailureRate) {
    alerts.push({
      code: "ai_failure_rate_high",
      severity: "warning",
      value: aiFailureRate,
      threshold: thresholds.aiFailureRate,
    });
  }
  if (httpAverageLatencyMs > thresholds.apiAverageLatencyMs) {
    alerts.push({
      code: "api_latency_high",
      severity: "warning",
      value: httpAverageLatencyMs,
      threshold: thresholds.apiAverageLatencyMs,
    });
  }
  if (ragAverageRetrievalMs > thresholds.ragAverageLatencyMs) {
    alerts.push({
      code: "rag_retrieval_latency_high",
      severity: "warning",
      value: ragAverageRetrievalMs,
      threshold: thresholds.ragAverageLatencyMs,
    });
  }
  if (backupStatus && backupStatus.ageHours !== null && backupStatus.ageHours > thresholds.backupMaxAgeHours) {
    alerts.push({
      code: "backup_stale",
      severity: "warning",
      value: backupStatus.ageHours,
      threshold: thresholds.backupMaxAgeHours,
    });
  }
  if (backupStatus && !backupStatus.latestBackupAt) {
    alerts.push({
      code: "backup_missing",
      severity: "info",
      value: null,
      threshold: thresholds.backupMaxAgeHours,
    });
  }
  return alerts;
}

function sanitizeScalar(value) {
  if (typeof value !== "string") return value;
  if (value.length > 500) return `${value.slice(0, 500)}...`;
  return value;
}

function isSensitiveKey(key) {
  return /password|token|secret|api[-_]?key|authorization|cookie|csrf/i.test(key);
}
