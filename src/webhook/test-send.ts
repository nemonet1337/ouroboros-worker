import { validateWebhookUrl } from "./url.guard";

export interface WebhookTestResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Webhook テスト送信。api / fragments の共通実装。 */
export async function sendWebhookTest(url: string): Promise<WebhookTestResult> {
  try {
    validateWebhookUrl(url);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "ouroboros-webhook-test" },
      body: JSON.stringify({
        event: "test",
        message: "Ouroboros webhook test",
        at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
