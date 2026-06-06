import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { addFishCredits, FISH_CREDIT_USD, type Account } from "@/lib/fishLedger";

const ROOT = process.cwd();
const PAYMENT_DIR = path.join(ROOT, "data", "fish");
const PAYMENT_REQUESTS_PATH = path.join(PAYMENT_DIR, "payment_requests.json");
const STRIPE_API_VERSION = "2024-06-20";
const BASE_CHAIN_ID = 8453;
const BASE_USDC_ADDRESS = "0x833589fcD6EDb6E08f4c7C32D4f71b54bdA02913";
const USDC_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const checkoutSchema = z
  .object({
    amountUsd: z.number().positive().max(100000).optional(),
    credits: z.number().int().positive().max(100000000).optional(),
    idempotencyKey: z.string().trim().min(1).max(120).optional(),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional()
  })
  .superRefine((input, context) => {
    if (input.amountUsd === undefined && input.credits === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "amountUsd or credits is required"
      });
    }
    if (input.amountUsd !== undefined && input.credits !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["credits"],
        message: "amountUsd and credits cannot both be supplied"
      });
    }
    for (const field of ["successUrl", "cancelUrl"] as const) {
      const value = input[field];
      if (value && !isSameAppOriginRedirect(value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} must stay on the Fish app origin`
        });
      }
    }
  });

const usdcCheckoutSchema = checkoutSchema.and(
  z.object({
    payerAddress: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/)
  })
);

const usdcConfirmSchema = z.object({
  paymentId: z.string().trim().min(1).max(120),
  transactionHash: z.string().trim().regex(/^0x[a-fA-F0-9]{64}$/)
});

type CheckoutInput = z.infer<typeof checkoutSchema>;
type UsdcCheckoutInput = z.infer<typeof usdcCheckoutSchema>;
type UsdcConfirmInput = z.infer<typeof usdcConfirmSchema>;

type FishPaymentProvider = "stripe_checkout" | "usdc_base";
type FishPaymentStatus = "pending" | "paid" | "failed" | "expired";

type FishPaymentRequest = {
  paymentId: string;
  accountId: string;
  provider: FishPaymentProvider;
  status: FishPaymentStatus;
  credits: number;
  amountUsd: number;
  amountCents: number;
  currency: "USD" | "USDC";
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  paidAt: string | null;
  idempotencyKey: string | null;
  providerSessionId: string | null;
  providerPaymentIntentId: string | null;
  providerEventIds: string[];
  checkoutUrl: string | null;
  chainId: number | null;
  tokenAddress: string | null;
  receiveAddress: string | null;
  payerAddress: string | null;
  amountAtomic: string | null;
  transactionHash: string | null;
  creditEntryId: string | null;
  failureReason: string | null;
};

type FishPaymentLedger = {
  payments: FishPaymentRequest[];
};

type PublicPaymentRequest = Omit<FishPaymentRequest, "accountId" | "providerEventIds" | "failureReason"> & {
  amountUsdc?: string;
};

export function parseStripeCheckoutRequest(body: unknown) {
  return checkoutSchema.safeParse(body);
}

export function parseUsdcCheckoutRequest(body: unknown) {
  return usdcCheckoutSchema.safeParse(body);
}

export function parseUsdcConfirmRequest(body: unknown) {
  return usdcConfirmSchema.safeParse(body);
}

export async function createStripeCheckoutPayment(account: Account, input: CheckoutInput) {
  const secretKey = cleanEnv(process.env.FISH_STRIPE_SECRET_KEY);
  if (!secretKey) {
    return { ok: false as const, status: 503, error: "stripe_checkout_not_configured" };
  }

  const amount = normalizePaymentAmount(input);
  if (!amount.ok) {
    return amount;
  }

  const existing = input.idempotencyKey ? await findReusablePayment(account.id, "stripe_checkout", input.idempotencyKey) : null;
  if (existing) {
    return {
      ok: true as const,
      idempotent: true,
      payment: publicPayment(existing)
    };
  }

  const now = new Date().toISOString();
  const paymentId = `pay_${randomUUID()}`;
  const publicUrl = fishPublicUrl();
  const successUrl = input.successUrl ?? `${publicUrl}/account?fish_payment=success&payment_id=${paymentId}`;
  const cancelUrl = input.cancelUrl ?? `${publicUrl}/account?fish_payment=cancel&payment_id=${paymentId}`;
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("client_reference_id", paymentId);
  params.set("metadata[paymentId]", paymentId);
  params.set("metadata[fishAccountId]", account.id);
  params.set("metadata[fishCredits]", String(amount.credits));
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(amount.amountCents));
  params.set("line_items[0][price_data][product_data][name]", `${amount.credits.toLocaleString("en")} Fish Credits`);
  params.set("payment_intent_data[metadata][paymentId]", paymentId);
  params.set("payment_intent_data[metadata][fishAccountId]", account.id);
  params.set("payment_intent_data[metadata][fishCredits]", String(amount.credits));

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": STRIPE_API_VERSION,
      ...(input.idempotencyKey ? { "idempotency-key": `fish-${account.id}-${input.idempotencyKey}` } : {})
    },
    body: params
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false as const,
      status: 502,
      error: "stripe_checkout_failed",
      detail: stripeErrorMessage(payload)
    };
  }

  const payment: FishPaymentRequest = {
    paymentId,
    accountId: account.id,
    provider: "stripe_checkout",
    status: "pending",
    credits: amount.credits,
    amountUsd: amount.amountUsd,
    amountCents: amount.amountCents,
    currency: "USD",
    createdAt: now,
    updatedAt: now,
    expiresAt: typeof payload?.expires_at === "number" ? new Date(payload.expires_at * 1000).toISOString() : null,
    paidAt: null,
    idempotencyKey: input.idempotencyKey ?? null,
    providerSessionId: typeof payload?.id === "string" ? payload.id : null,
    providerPaymentIntentId: typeof payload?.payment_intent === "string" ? payload.payment_intent : null,
    providerEventIds: [],
    checkoutUrl: typeof payload?.url === "string" ? payload.url : null,
    chainId: null,
    tokenAddress: null,
    receiveAddress: null,
    payerAddress: null,
    amountAtomic: null,
    transactionHash: null,
    creditEntryId: null,
    failureReason: null
  };
  await appendPayment(payment);

  return {
    ok: true as const,
    idempotent: false,
    payment: publicPayment(payment)
  };
}

export async function handleStripeWebhook(rawBody: string, signatureHeader: string | null) {
  const secret = cleanEnv(process.env.FISH_STRIPE_WEBHOOK_SECRET);
  if (!secret) {
    return { ok: false as const, status: 503, error: "stripe_webhook_not_configured" };
  }
  if (!verifyStripeSignature(rawBody, signatureHeader, secret)) {
    return { ok: false as const, status: 400, error: "invalid_stripe_signature" };
  }

  const event = JSON.parse(rawBody) as {
    id?: string;
    type?: string;
    data?: { object?: Record<string, unknown> };
  };

  if (event.type !== "checkout.session.completed") {
    return {
      ok: true as const,
      ignored: true,
      eventType: event.type ?? "unknown"
    };
  }

  const session = event.data?.object;
  const sessionId = stringValue(session?.id);
  const paymentStatus = stringValue(session?.payment_status);
  const metadata = isRecord(session?.metadata) ? session.metadata : {};
  const paymentId = stringValue(metadata.paymentId) ?? stringValue(session?.client_reference_id);
  const accountId = stringValue(metadata.fishAccountId);
  const credits = numberFromString(metadata.fishCredits);

  if (!paymentId || !accountId || !sessionId || !credits) {
    return { ok: false as const, status: 400, error: "stripe_session_missing_fish_metadata" };
  }
  if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
    return { ok: false as const, status: 400, error: "stripe_session_not_paid" };
  }

  const ledger = await readPaymentLedger();
  const payment = ledger.payments.find((candidate) => candidate.paymentId === paymentId || candidate.providerSessionId === sessionId);
  if (!payment) {
    return { ok: false as const, status: 404, error: "fish_payment_not_found" };
  }
  if (payment.accountId !== accountId) {
    return { ok: false as const, status: 400, error: "stripe_session_account_mismatch" };
  }
  const amountTotal = numberFromString(session?.amount_total);
  if (amountTotal !== null && amountTotal < payment.amountCents) {
    return { ok: false as const, status: 400, error: "stripe_session_underpaid" };
  }

  payment.providerSessionId = sessionId;
  payment.providerPaymentIntentId = stringValue(session?.payment_intent) ?? payment.providerPaymentIntentId;
  if (event.id && !payment.providerEventIds.includes(event.id)) {
    payment.providerEventIds.push(event.id);
  }

  if (payment.status === "paid" && payment.creditEntryId) {
    payment.updatedAt = new Date().toISOString();
    await writePaymentLedger(ledger);
    return { ok: true as const, idempotent: true, payment: publicPayment(payment) };
  }

  const creditResult = await addFishCredits({
    accountId,
    amount: payment.credits,
    lane: "prepaid",
    reason: "stripe_checkout_paid",
    expiresAt: null,
    idempotencyKey: `stripe:${sessionId}`,
    paymentProviderEventId: event.id ?? sessionId
  });
  if (!creditResult.ok) {
    return creditResult;
  }

  payment.status = "paid";
  payment.paidAt = new Date().toISOString();
  payment.updatedAt = payment.paidAt;
  payment.creditEntryId = creditResult.entry.entryId;
  await writePaymentLedger(ledger);

  return {
    ok: true as const,
    idempotent: creditResult.idempotent,
    payment: publicPayment(payment)
  };
}

export async function createUsdcPayment(account: Account, input: UsdcCheckoutInput) {
  const receiveAddress = cleanEnv(process.env.FISH_USDC_RECEIVE_ADDRESS);
  if (!receiveAddress || !isAddress(receiveAddress)) {
    return { ok: false as const, status: 503, error: "usdc_checkout_not_configured" };
  }

  const amount = normalizePaymentAmount(input);
  if (!amount.ok) {
    return amount;
  }

  const existing = input.idempotencyKey ? await findReusablePayment(account.id, "usdc_base", input.idempotencyKey) : null;
  if (existing) {
    return {
      ok: true as const,
      idempotent: true,
      payment: publicPayment(existing)
    };
  }

  const now = new Date().toISOString();
  const decimals = readInteger(process.env.FISH_USDC_DECIMALS, 6);
  const amountAtomic = amountCentsToAtomic(amount.amountCents, decimals);
  const payment: FishPaymentRequest = {
    paymentId: `pay_${randomUUID()}`,
    accountId: account.id,
    provider: "usdc_base",
    status: "pending",
    credits: amount.credits,
    amountUsd: amount.amountUsd,
    amountCents: amount.amountCents,
    currency: "USDC",
    createdAt: now,
    updatedAt: now,
    expiresAt: addMinutes(now, readInteger(process.env.FISH_USDC_PAYMENT_TTL_MINUTES, 60)),
    paidAt: null,
    idempotencyKey: input.idempotencyKey ?? null,
    providerSessionId: null,
    providerPaymentIntentId: null,
    providerEventIds: [],
    checkoutUrl: null,
    chainId: readInteger(process.env.FISH_USDC_CHAIN_ID, BASE_CHAIN_ID),
    tokenAddress: cleanEnv(process.env.FISH_USDC_TOKEN_ADDRESS) ?? BASE_USDC_ADDRESS,
    receiveAddress,
    payerAddress: normalizeAddress(input.payerAddress),
    amountAtomic: amountAtomic.toString(),
    transactionHash: null,
    creditEntryId: null,
    failureReason: null
  };
  await appendPayment(payment);

  return {
    ok: true as const,
    idempotent: false,
    payment: publicPayment(payment)
  };
}

export async function confirmUsdcPayment(account: Account, input: UsdcConfirmInput) {
  const rpcUrl = cleanEnv(process.env.FISH_USDC_RPC_URL);
  if (!rpcUrl) {
    return { ok: false as const, status: 503, error: "usdc_rpc_not_configured" };
  }

  const ledger = await readPaymentLedger();
  const payment = ledger.payments.find((candidate) => candidate.paymentId === input.paymentId);
  if (!payment || payment.provider !== "usdc_base") {
    return { ok: false as const, status: 404, error: "fish_payment_not_found" };
  }
  if (payment.accountId !== account.id) {
    return { ok: false as const, status: 403, error: "fish_payment_account_mismatch" };
  }
  if (payment.status === "paid" && payment.creditEntryId) {
    return { ok: true as const, idempotent: true, payment: publicPayment(payment) };
  }
  if (!payment.payerAddress || !isAddress(payment.payerAddress)) {
    return { ok: false as const, status: 400, error: "usdc_payer_address_required" };
  }
  const reusedTransaction = ledger.payments.find(
    (candidate) => candidate.paymentId !== payment.paymentId && candidate.provider === "usdc_base" && candidate.transactionHash?.toLowerCase() === input.transactionHash.toLowerCase()
  );
  if (reusedTransaction) {
    return { ok: false as const, status: 409, error: "usdc_transaction_already_used" };
  }
  if (payment.expiresAt && Date.parse(payment.expiresAt) < Date.now()) {
    payment.status = "expired";
    payment.updatedAt = new Date().toISOString();
    await writePaymentLedger(ledger);
    return { ok: false as const, status: 410, error: "fish_payment_expired" };
  }

  const verification = await verifyUsdcReceipt(rpcUrl, payment, input.transactionHash);
  if (!verification.ok) {
    return verification;
  }

  const creditResult = await addFishCredits({
    accountId: account.id,
    amount: payment.credits,
    lane: "prepaid",
    reason: "usdc_payment_confirmed",
    expiresAt: null,
    idempotencyKey: `usdc:${payment.paymentId}`,
    paymentProviderEventId: input.transactionHash
  });
  if (!creditResult.ok) {
    return creditResult;
  }

  payment.status = "paid";
  payment.paidAt = new Date().toISOString();
  payment.updatedAt = payment.paidAt;
  payment.transactionHash = input.transactionHash;
  payment.creditEntryId = creditResult.entry.entryId;
  await writePaymentLedger(ledger);

  return {
    ok: true as const,
    idempotent: creditResult.idempotent,
    payment: publicPayment(payment)
  };
}

function normalizePaymentAmount(input: CheckoutInput) {
  if (input.amountUsd !== undefined && input.credits !== undefined) {
    return { ok: false as const, status: 400, error: "ambiguous_checkout_amount" };
  }

  const minUsd = readNumber(process.env.FISH_MIN_CHECKOUT_USD, 1);
  const maxUsd = readNumber(process.env.FISH_MAX_CHECKOUT_USD, 500);
  const amountCents = input.amountUsd !== undefined ? Math.round(input.amountUsd * 100) : Math.ceil((input.credits ?? 0) * FISH_CREDIT_USD * 100);
  const amountUsd = amountCents / 100;
  const credits = input.credits ?? Math.floor(amountUsd / FISH_CREDIT_USD);

  if (!Number.isFinite(amountCents) || amountCents <= 0 || credits <= 0) {
    return { ok: false as const, status: 400, error: "invalid_checkout_amount" };
  }
  if (amountUsd < minUsd) {
    return { ok: false as const, status: 400, error: "checkout_amount_below_minimum", minimumUsd: minUsd };
  }
  if (amountUsd > maxUsd) {
    return { ok: false as const, status: 400, error: "checkout_amount_above_maximum", maximumUsd: maxUsd };
  }

  return {
    ok: true as const,
    amountCents,
    amountUsd,
    credits
  };
}

async function verifyUsdcReceipt(rpcUrl: string, payment: FishPaymentRequest, transactionHash: string) {
  const expectedChainId = payment.chainId ?? BASE_CHAIN_ID;
  const chainIdHex = await rpc(rpcUrl, "eth_chainId", []);
  const chainId = Number.parseInt(String(chainIdHex), 16);
  if (chainId !== expectedChainId) {
    return { ok: false as const, status: 400, error: "usdc_rpc_chain_mismatch", expectedChainId, chainId };
  }

  const receipt = await rpc(rpcUrl, "eth_getTransactionReceipt", [transactionHash]);
  if (!isRecord(receipt)) {
    return { ok: false as const, status: 404, error: "usdc_transaction_not_found" };
  }
  if (receipt.status !== "0x1") {
    return { ok: false as const, status: 400, error: "usdc_transaction_failed" };
  }

  const latestBlock = await rpc(rpcUrl, "eth_blockNumber", []);
  const latest = Number.parseInt(String(latestBlock), 16);
  const blockNumber = Number.parseInt(String(receipt.blockNumber ?? "0x0"), 16);
  const confirmations = Math.max(0, latest - blockNumber + 1);
  const requiredConfirmations = readInteger(process.env.FISH_USDC_MIN_CONFIRMATIONS, 1);
  if (confirmations < requiredConfirmations) {
    return { ok: false as const, status: 409, error: "usdc_transaction_needs_confirmations", confirmations, requiredConfirmations };
  }

  const expectedToken = normalizeAddress(payment.tokenAddress ?? BASE_USDC_ADDRESS);
  const expectedTo = normalizeAddress(payment.receiveAddress ?? "");
  const expectedAmount = BigInt(payment.amountAtomic ?? "0");
  if (!payment.payerAddress || !isAddress(payment.payerAddress)) {
    return { ok: false as const, status: 400, error: "usdc_payer_address_required" };
  }
  const expectedFrom = normalizeAddress(payment.payerAddress);
  const logs = Array.isArray(receipt.logs) ? receipt.logs.filter(isRecord) : [];
  const transfer = logs.find((log) => {
    const topics = Array.isArray(log.topics) ? log.topics.map(String) : [];
    if (normalizeAddress(stringValue(log.address) ?? "") !== expectedToken) {
      return false;
    }
    if ((topics[0] ?? "").toLowerCase() !== USDC_TRANSFER_TOPIC) {
      return false;
    }
    const from = topicAddress(topics[1]);
    const to = topicAddress(topics[2]);
    if (to !== expectedTo) {
      return false;
    }
    if (from !== expectedFrom) {
      return false;
    }
    const amount = BigInt(String(log.data ?? "0x0"));
    return amount >= expectedAmount;
  });

  if (!transfer) {
    return { ok: false as const, status: 400, error: "matching_usdc_transfer_not_found" };
  }

  return { ok: true as const };
}

async function rpc(rpcUrl: string, method: string, params: unknown[]) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method,
      params
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message ?? `rpc_${method}_failed`);
  }
  return payload.result;
}

function verifyStripeSignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) {
    return false;
  }
  const values = new Map<string, string[]>();
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2);
    if (!key || !value) {
      continue;
    }
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const timestamp = values.get("t")?.[0];
  const signatures = values.get("v1") ?? [];
  if (!timestamp || signatures.length === 0) {
    return false;
  }
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > readInteger(process.env.FISH_STRIPE_WEBHOOK_TOLERANCE_SECONDS, 300)) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return signatures.some((signature) => safeEqualHex(signature, expected));
}

function safeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function findReusablePayment(accountId: string, provider: FishPaymentProvider, idempotencyKey: string) {
  const ledger = await readPaymentLedger();
  return (
    ledger.payments.find(
      (payment) =>
        payment.accountId === accountId &&
        payment.provider === provider &&
        payment.idempotencyKey === idempotencyKey &&
        payment.status !== "failed" &&
        payment.status !== "expired"
    ) ?? null
  );
}

async function appendPayment(payment: FishPaymentRequest) {
  const ledger = await readPaymentLedger();
  ledger.payments.push(payment);
  await writePaymentLedger(ledger);
}

async function readPaymentLedger(): Promise<FishPaymentLedger> {
  try {
    const raw = await readFile(PAYMENT_REQUESTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.payments)) {
      return parsed as FishPaymentLedger;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return { payments: [] };
}

async function writePaymentLedger(ledger: FishPaymentLedger) {
  await mkdir(PAYMENT_DIR, { recursive: true });
  await writeFile(PAYMENT_REQUESTS_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
}

function publicPayment(payment: FishPaymentRequest): PublicPaymentRequest {
  const { accountId: _accountId, providerEventIds: _providerEventIds, failureReason: _failureReason, ...safePayment } = payment;
  return {
    ...safePayment,
    amountUsdc: payment.amountAtomic ? atomicToDecimal(payment.amountAtomic, readInteger(process.env.FISH_USDC_DECIMALS, 6)) : undefined
  };
}

function fishPublicUrl() {
  return cleanEnv(process.env.FISH_PUBLIC_APP_URL) ?? cleanEnv(process.env.NEXT_PUBLIC_FISH_APP_URL) ?? "http://127.0.0.1:3000";
}

function isSameAppOriginRedirect(value: string) {
  try {
    const url = new URL(value);
    const appUrl = new URL(fishPublicUrl());
    return !url.username && !url.password && url.origin === appUrl.origin;
  } catch {
    return false;
  }
}

function addMinutes(value: string, minutes: number) {
  return new Date(Date.parse(value) + minutes * 60_000).toISOString();
}

function amountCentsToAtomic(amountCents: number, decimals: number) {
  if (decimals < 2) {
    return BigInt(Math.ceil(amountCents / 100));
  }
  return BigInt(amountCents) * 10n ** BigInt(decimals - 2);
}

function atomicToDecimal(value: string, decimals: number) {
  const atomic = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = atomic / base;
  const fraction = (atomic % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function topicAddress(topic: string | undefined) {
  if (!topic || topic.length < 42) {
    return "";
  }
  return normalizeAddress(`0x${topic.slice(-40)}`);
}

function normalizeAddress(value: string) {
  return value.toLowerCase();
}

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function stripeErrorMessage(payload: unknown) {
  if (isRecord(payload) && isRecord(payload.error)) {
    return stringValue(payload.error.message) ?? stringValue(payload.error.type) ?? "stripe_error";
  }
  return "stripe_error";
}

function cleanEnv(value: string | undefined) {
  const clean = value?.trim();
  return clean || undefined;
}

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberFromString(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
