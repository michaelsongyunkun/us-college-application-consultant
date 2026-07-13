import * as Sentry from "@sentry/node";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import pino from "pino";

const tracer = trace.getTracer("us-college-consultant", "1.0.0");
let telemetrySdk: NodeSDK | null = null;
let sentryEnabled = false;

export function createPinoLogger(env: NodeJS.ProcessEnv = process.env) {
  return pino({
    level: env.LOG_LEVEL || "info",
    base: { service: "us-college-consultant", environment: env.NODE_ENV || "development" },
    redact: {
      paths: [
        "*.apiKey", "*.authorization", "*.cookie", "*.prompt", "*.messages", "*.context",
        "*.studentProfile", "*.profile", "*.essay", "*.notes", "*.password", "*.token",
      ],
      censor: "[REDACTED]",
    },
  });
}

export async function initializeProductionObservability(env: NodeJS.ProcessEnv = process.env) {
  if (!telemetrySdk && env.OTEL_SDK_DISABLED !== "true") {
    const endpoint = String(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || "").trim();
    telemetrySdk = new NodeSDK({
      ...(endpoint ? { traceExporter: new OTLPTraceExporter({ url: endpoint }) } : {}),
      instrumentations: [getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      })],
      serviceName: env.OTEL_SERVICE_NAME || "us-college-consultant",
    });
    await telemetrySdk.start();
  }

  const dsn = String(env.SENTRY_DSN || "").trim();
  if (dsn && !sentryEnabled) {
    Sentry.init({
      dsn,
      environment: env.NODE_ENV || "development",
      release: env.APP_RELEASE || undefined,
      sendDefaultPii: false,
      defaultIntegrations: false,
      tracesSampleRate: 0,
      beforeSend(event) {
        delete event.request;
        delete event.breadcrumbs;
        delete event.contexts;
        if (event.extra) event.extra = sanitizeMetadata(event.extra);
        return event;
      },
    });
    sentryEnabled = true;
  }
}

export function startSpan(name: string, attributes: Record<string, string | number | boolean> = {}) {
  return tracer.startSpan(name, { attributes });
}

export async function withSpan<T>(name: string, attributes: Record<string, string | number | boolean>, operation: () => Promise<T>): Promise<T> {
  const span = startSpan(name, attributes);
  try {
    const result = await operation();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(safeException(error));
    span.setStatus({ code: SpanStatusCode.ERROR, message: safeErrorName(error) });
    throw error;
  } finally {
    span.end();
  }
}

export function withSpanSync<T>(name: string, attributes: Record<string, string | number | boolean>, operation: () => T): T {
  const span = startSpan(name, attributes);
  try {
    const result = operation();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(safeException(error));
    span.setStatus({ code: SpanStatusCode.ERROR, message: safeErrorName(error) });
    throw error;
  } finally {
    span.end();
  }
}

export function captureSanitizedException(error: unknown, metadata: Record<string, unknown> = {}) {
  if (!sentryEnabled) return;
  const safe = safeException(error);
  Sentry.captureException(safe, { extra: sanitizeMetadata(metadata) });
}

function safeException(error: any): Error {
  const name = safeErrorName(error);
  const safe = new Error(name);
  safe.name = name;
  return safe;
}

function safeErrorName(error: any): string {
  return String(error?.name || "Error").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80) || "Error";
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const allowed = ["requestId", "method", "path", "statusCode", "feature", "model", "attempt", "retryable"];
  return Object.fromEntries(allowed.filter((key) => metadata[key] !== undefined).map((key) => [key, metadata[key]]));
}
