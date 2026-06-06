import { isIP } from "node:net";

const TRUST_PROXY_ENV = "FISH_TRUST_PROXY_HEADERS";
const PROXY_SECRET_ENV = "FISH_PROXY_HEADER_SECRET";
const PROXY_SECRET_HEADER = "x-fish-proxy-secret";

export type FaucetClientIdentity =
  | {
      ok: true;
      ipAddress: string;
    }
  | {
      ok: false;
      status: 403 | 503;
      error: "testnet_faucet_proxy_identity_required" | "testnet_faucet_proxy_secret_required" | "testnet_faucet_proxy_secret_invalid" | "testnet_faucet_proxy_ip_required";
    };

export function resolveTestnetFaucetClientIdentity(headers: Headers, env: Record<string, string | undefined> = process.env): FaucetClientIdentity {
  if (!truthy(env[TRUST_PROXY_ENV])) {
    if (env.NODE_ENV === "production") {
      return { ok: false, status: 503, error: "testnet_faucet_proxy_identity_required" };
    }
    return { ok: true, ipAddress: "local-development" };
  }

  const expectedSecret = cleanEnv(env[PROXY_SECRET_ENV]);
  if (!safeSecret(expectedSecret)) {
    return { ok: false, status: 503, error: "testnet_faucet_proxy_secret_required" };
  }

  const providedSecret = cleanEnv(headers.get(PROXY_SECRET_HEADER) ?? undefined);
  if (providedSecret !== expectedSecret) {
    return { ok: false, status: 403, error: "testnet_faucet_proxy_secret_invalid" };
  }

  const ipAddress = firstPublicProxyIp(headers);
  if (!ipAddress) {
    return { ok: false, status: 503, error: "testnet_faucet_proxy_ip_required" };
  }

  return { ok: true, ipAddress };
}

function firstPublicProxyIp(headers: Headers) {
  const values = [headers.get("cf-connecting-ip"), headers.get("x-real-ip"), firstForwardedFor(headers.get("x-forwarded-for"))];
  return values.map((value) => cleanEnv(value ?? undefined)).find((value) => Boolean(value && isIP(stripIpv6Brackets(value)))) ?? null;
}

function firstForwardedFor(value: string | null) {
  return value?.split(",")[0]?.trim() ?? null;
}

function stripIpv6Brackets(value: string) {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function truthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function safeSecret(value: string | null) {
  if (!value || value.length < 24) {
    return false;
  }
  return !/^(change-me|changeme|replace|secret|password|test|demo)/i.test(value);
}

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
