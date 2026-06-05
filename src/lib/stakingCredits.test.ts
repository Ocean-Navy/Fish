import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("staking credit summaries keep per-position holder, wallet, and balance data private", async () => {
  const originalCwd = process.cwd();
  const workspace = await mkdtemp(path.join(tmpdir(), "fish-staking-privacy-"));

  try {
    process.chdir(workspace);
    const { createStakingPosition, summarizeStakingCredits } = await import(`./stakingCredits.ts?privacy=${Date.now()}`);

    await createStakingPosition({
      holderLabel: "Victim Ocean Whale",
      walletRef: "0x1234567890abcdef1234567890abcdef12345678",
      oceanAmount: 600,
      lockDays: 60,
      budgetId: "pilot-credit-budget-v1",
      issueApiKey: true
    });

    const summary = await summarizeStakingCredits();
    assert.equal(summary.positions.length, 1);
    assert.equal(summary.totals.oceanStaked, 600);
    assert.equal(summary.totals.creditsIssued, 120);

    const publicPosition = summary.positions[0] as Record<string, unknown>;
    assert.equal(publicPosition.holderLabel, undefined);
    assert.equal(publicPosition.walletHashPrefix, undefined);
    assert.equal(publicPosition.oceanAmount, undefined);
    assert.equal(publicPosition.lockDays, undefined);
    assert.equal(publicPosition.unlocksAt, undefined);
    assert.equal(publicPosition.creditsSpent, undefined);
    assert.equal(publicPosition.creditsRemaining, undefined);
  } finally {
    process.chdir(originalCwd);
    await rm(workspace, { recursive: true, force: true });
  }
});
