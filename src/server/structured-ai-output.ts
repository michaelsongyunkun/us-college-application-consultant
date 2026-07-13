import { z } from "zod";
import type { ZodType } from "zod";

export type StructuredOutputResult<T> =
  | { ok: true; value: T; mode: "json" }
  | { ok: false; error: string };

export function parseStructuredAiOutput<T>(content: string, schema: ZodType<T>): StructuredOutputResult<T> {
  try {
    const parsed = JSON.parse(stripJsonFence(content));
    const validation = schema.safeParse(parsed);
    if (validation.success) return { ok: true, value: validation.data, mode: "json" };
    return { ok: false, error: z.prettifyError(validation.error) };
  } catch (error: any) {
    return { ok: false, error: error?.message || "Model output is not valid JSON." };
  }
}

export function buildStructuredOutputRepairMessage(error: string, jsonSchema: unknown): string {
  return [
    "上一次输出未通过解析校验（JSON Schema）。只返回修复后的 JSON，不要 Markdown 或代码块。",
    `校验错误：${String(error || "unknown").slice(0, 2_000)}`,
    `JSON Schema：${JSON.stringify(jsonSchema)}`,
  ].join("\n");
}

function stripJsonFence(value: string): string {
  const text = String(value || "").trim();
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text;
}
