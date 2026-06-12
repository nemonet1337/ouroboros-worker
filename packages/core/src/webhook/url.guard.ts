// SSRF protection for outbound webhook delivery. Runtime-agnostic (no Node
// built-ins) so it can be shared by the Node dispatcher and the edge webhook
// test endpoint. Blocks loopback, private, and link-local targets.

export function validateWebhookUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid webhook URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Webhook URL must use http or https: ${rawUrl}`);
  }

  // Normalise: lowercase and strip IPv6 brackets so [fe80::1] → fe80::1.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Reject loopback and unspecified
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "::") {
    throw new Error(`Webhook URL targets a reserved address: ${rawUrl}`);
  }

  // Reject private/link-local IPv4
  const privateIPv4 = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/;
  if (privateIPv4.test(host)) {
    throw new Error(`Webhook URL targets a private IP address: ${rawUrl}`);
  }

  // Reject IPv6 loopback, link-local, and ULA
  const privateIPv6 = /^(::1$|fe80:|fd[0-9a-f]{2}:)/;
  if (privateIPv6.test(host)) {
    throw new Error(`Webhook URL targets a private IPv6 address: ${rawUrl}`);
  }
}
