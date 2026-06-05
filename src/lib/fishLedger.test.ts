import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  addFishCredits,
  authenticateRequest,
  createApiKey,
  recordChatUsage,
  reserveFishCredits,
} from "./fishLedger";

const testAccountIds = new Set<string>();

const ledgerDir = path.join(process.cwd(), "data", "fish");
const accountsPath = path.join(ledgerDir, "accounts.json");
const creditEntriesPath = path.join(ledgerDir, "credit_entries.json");

afterEach(async () => {
  await removeTestAccounts();
  testAccountIds.clear();
});

test("expired top-up credits are not spendable", async () => {
  const { key, account } = await createApiKey("Expired credit test", 0);
  testAccountIds.add(account.id);

  const topup = await addFishCredits({
    accountId: account.id,
    amount: 5,
    lane: "prepaid",
    reason: "expired_credit_test",
    expiresAt: "2000-01-01T00:00:00.000Z",
  });
  assert.equal(topup.ok, true);
  assert.equal(topup.creditsRemaining, 5);

  const auth = await authenticateRequest(
    new Request("http://127.0.0.1/v1/chat/completions", {
      headers: { authorization: `Bearer ${key}` },
    }),
  );
  assert.equal(auth.ok, true);
  if (!auth.ok) {
    throw new Error("test account authentication failed");
  }

  const reservation = await reserveFishCredits({
    ledger: auth.ledger,
    account: auth.account,
    credits: 1,
    reason: "expired_credit_test_reserve",
  });
  assert.equal(reservation.ok, false);
  assert.equal(reservation.status, 402);
  assert.equal(reservation.available, 0);

  const usage = await recordChatUsage({
    ledger: auth.ledger,
    account: auth.account,
    input: {
      model: "fish-demo-chat",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    },
    promptTokens: 1000,
    completionTokens: 1,
    content: "hello",
  });
  assert.equal(usage.ok, false);
  assert.equal(usage.status, 402);
  assert.equal(usage.available, 0);
});

async function removeTestAccounts() {
  if (testAccountIds.size === 0) {
    return;
  }
  await filterJsonFile(accountsPath, (ledger) => ({
    ...ledger,
    accounts: Array.isArray(ledger.accounts)
      ? ledger.accounts.filter(
          (account: { id?: string }) =>
            !account.id || !testAccountIds.has(account.id),
        )
      : [],
  }));
  await filterJsonFile(creditEntriesPath, (ledger) => ({
    ...ledger,
    entries: Array.isArray(ledger.entries)
      ? ledger.entries.filter(
          (entry: { accountId?: string }) =>
            !entry.accountId || !testAccountIds.has(entry.accountId),
        )
      : [],
  }));
}

async function filterJsonFile(
  pathname: string,
  filter: (value: Record<string, unknown>) => Record<string, unknown>,
) {
  try {
    const parsed = JSON.parse(await readFile(pathname, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(pathname, `${JSON.stringify(filter(parsed), null, 2)}\n`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
