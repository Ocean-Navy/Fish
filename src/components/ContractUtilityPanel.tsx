import { Landmark, ReceiptText, ShieldCheck, Vault } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { CapacitySettlementSummary } from "@/lib/capacitySettlements";
import type { FishContractStatus } from "@/lib/fishContracts";

export function ContractUtilityPanel({ capacitySettlements, contractStatus }: { capacitySettlements: CapacitySettlementSummary; contractStatus: FishContractStatus }) {
  const cards = [
    { label: "OCEAN staked", value: contractStatus.onchain.oceanStaking.totalStakedOcean ?? "-", icon: Landmark },
    { label: "FISH supply", value: contractStatus.onchain.fish.totalSupply ?? "-", icon: Vault },
    { label: "FISH capacity", value: contractStatus.onchain.capacityPool.totalStakedFish ?? "-", icon: ShieldCheck },
    { label: "USDC to pool", value: formatUsd(capacitySettlements.totals.netUsdcAmount), icon: ReceiptText }
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">OCEAN utility proof</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Contracts and capacity</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">
              Deployed-contract reads appear here after RPC and addresses are configured. Capacity settlements stay separate from provider payout accounting.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge state={contractStatus.dataState} />
            <span className="text-sm font-bold text-fish-secondary">Updated {formatDateTime(contractStatus.lastUpdated)}</span>
            <Link className="rounded-full border border-fish-accent/35 px-4 py-2 text-xs font-black text-fish-accent" href="/api/contracts/status">
              Contract JSON
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-fish-secondary">{card.label}</p>
                  <Icon className="h-5 w-5 text-fish-accent" aria-hidden="true" />
                </div>
                <strong className="mt-3 block break-words text-3xl font-black text-white">{card.value}</strong>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Small label="Onchain read" value={contractStatus.onchain.readVerified ? "verified" : "not verified"} />
          <Small label="Settlement submit" value={contractStatus.settlementSubmitGate.submitAllowed ? "enabled" : "disabled"} />
          <Small label="Submitted records" value={formatNumber(capacitySettlements.totals.onchainSubmittedSettlements)} />
          <Small label="Operator fee" value={contractStatus.onchain.capacityPool.operatorFeeBps === null ? "-" : `${contractStatus.onchain.capacityPool.operatorFeeBps / 100}%`} />
          <Small label="USDC reserved" value={contractStatus.onchain.capacityPool.totalUsdcReservedForStakers ?? "-"} />
          <Small label="Capacity records" value={formatNumber(capacitySettlements.totals.settlements)} />
        </div>

        <div className="mt-4 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-bold leading-6 text-fish-primary">
          {contractStatus.onchain.error ?? contractStatus.settlementSubmitGate.reason}
        </div>
      </div>
    </section>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-fish-navy950/45 p-4">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}
