import { createHmac } from "node:crypto";
import { WebhookEndpoint } from "./types";
import { validateWebhookUrl } from "./url.guard";

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;


export interface DispatchOptions {
  body: Record<string, unknown>;
  endpoint: WebhookEndpoint;
  event: string;
}

export interface DispatchResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  attemptCount: number;
}

export async function dispatch(options: DispatchOptions): Promise<DispatchResult> {
  const { body, endpoint } = options;

  try {
    validateWebhookUrl(endpoint.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message, attemptCount: 0 };
  }

  const bodyJson = JSON.stringify(body);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "ouroboros-webhook/1.0",
    ...endpoint.headers,
  };

  if (endpoint.secret) {
    const sig = createHmac("sha256", endpoint.secret).update(bodyJson).digest("hex");
    headers["X-Ouroboros-Signature"] = `sha256=${sig}`;
  }

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      // Exponential back-off: 1 s, 2 s
      await sleep(1000 * Math.pow(2, attempt - 2));
    }

    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: bodyJson,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok) {
        return { success: true, statusCode: res.status, attemptCount: attempt };
      }

      lastError = `HTTP ${res.status} ${res.statusText}`;

      // 4xx = client error; retrying won't help
      if (res.status >= 400 && res.status < 500) {
        return {
          success: false,
          statusCode: res.status,
          error: lastError,
          attemptCount: attempt,
        };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { success: false, error: lastError, attemptCount: MAX_ATTEMPTS };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
