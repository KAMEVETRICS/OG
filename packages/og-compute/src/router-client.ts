import { hashText } from "../../core/src/canonical.ts";
import type { ExecutionReceipt } from "../../core/src/types.ts";

interface RouterTrace {
  request_id?: unknown;
  provider?: unknown;
  tee_verified?: unknown;
  billing?: {
    input_cost?: unknown;
    output_cost?: unknown;
    total_cost?: unknown;
  };
}

interface RouterResponse {
  id?: unknown;
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
  x_0g_trace?: RouterTrace;
}

export interface RouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OgComputeRouterConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  verificationMode?: "router";
}

export interface VerifiedCompletion<T> {
  output: T;
  receipt: ExecutionReceipt;
}

export const OG_COMPUTE_REQUEST_CONFIG = {
  temperature: 0,
  response_format: { type: "json_object" },
  verify_tee: true,
} as const;

const TRANSIENT_COMPUTE_ATTEMPTS = 3;
const TRANSIENT_COMPUTE_DELAY_MS = 750;

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`0G Compute response is missing ${label}`);
  }
  return value;
}

function parseJsonContent<T>(content: string): T {
  const trimmed = content.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/u, "");
  return JSON.parse(unfenced) as T;
}

function isTransientComputeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    /invalid JSON content/i.test(error.message) ||
    /request failed \(5\d\d\)/i.test(error.message) ||
    /request failed \(429\)/i.test(error.message)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OgComputeRouterClient {
  readonly #apiKey: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly baseUrl: string;
  readonly fetchMode: "global" | "custom";
  readonly model: string;
  readonly verificationMode: "router";

  constructor(config: OgComputeRouterConfig) {
    if (config.apiKey.length === 0) throw new Error("0G Compute API key is required");
    if (config.model.length === 0) throw new Error("0G Compute model is required");

    this.#apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "https://router-api.0g.ai/v1").replace(
      /\/$/,
      "",
    );
    this.#fetch = config.fetch ?? globalThis.fetch;
    this.fetchMode = config.fetch === undefined ? "global" : "custom";
    this.model = config.model;
    this.verificationMode = config.verificationMode ?? "router";
  }

  async completeJson<T>(messages: RouterMessage[]): Promise<VerifiedCompletion<T>> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= TRANSIENT_COMPUTE_ATTEMPTS; attempt += 1) {
      try {
        return await this.#completeJsonOnce<T>(messages);
      } catch (error) {
        lastError = error;
        if (
          attempt === TRANSIENT_COMPUTE_ATTEMPTS ||
          !isTransientComputeError(error)
        ) {
          throw error;
        }
        await delay(TRANSIENT_COMPUTE_DELAY_MS * attempt);
      }
    }
    throw lastError;
  }

  async #completeJsonOnce<T>(messages: RouterMessage[]): Promise<VerifiedCompletion<T>> {
    const response = await this.#fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...OG_COMPUTE_REQUEST_CONFIG,
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`0G Compute request failed (${response.status}): ${detail}`);
    }

    const body = (await response.json()) as RouterResponse;
    const trace = body.x_0g_trace;
    if (trace?.tee_verified !== true) {
      throw new Error("0G Compute response failed required TEE verification");
    }

    const content = requiredString(body.choices?.[0]?.message?.content, "content");
    let output: T;
    try {
      output = parseJsonContent<T>(content);
    } catch {
      throw new Error("0G Compute returned invalid JSON content");
    }

    const billing = trace.billing;
    const receipt: ExecutionReceipt = {
      platform: "0g-compute-router",
      requestId: requiredString(trace.request_id, "x_0g_trace.request_id"),
      chatId:
        response.headers.get("ZG-Res-Key") ?? requiredString(body.id, "response id"),
      provider: requiredString(trace.provider, "x_0g_trace.provider"),
      model: requiredString(body.model, "model"),
      teeVerified: true,
      verificationMode: "router",
      responseHash: hashText(content),
      billing:
        billing === undefined
          ? undefined
          : {
              inputCost: requiredString(billing.input_cost, "billing.input_cost"),
              outputCost: requiredString(billing.output_cost, "billing.output_cost"),
              totalCost: requiredString(billing.total_cost, "billing.total_cost"),
            },
    };

    return { output, receipt };
  }
}
