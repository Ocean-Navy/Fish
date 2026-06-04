import { Anchor, ShieldAlert } from "lucide-react";
import { ContractAddressList, EvmContractActionPanel } from "@/components/EvmContractActionPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import type { FishContractStatus } from "@/lib/fishContracts";

export function FishContractsPanel({ status }: { status: FishContractStatus }) {
  return (
    <section className="px-4 pb-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Onchain prototype</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">OCEAN in. FISH capacity out.</h2>
            <p className="mt-3 max-w-3xl text-base font-bold leading-7 text-fish-secondary">
              The contract lane links OCEAN staking, FISH minting, and a FISH Capacity Pool. It stays read-only until testnet addresses and the wallet write gate are enabled.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge state={status.dataState} />
            <span className="rounded-full border border-fish-accent/25 bg-fish-navy950/65 px-4 py-2 text-sm font-black text-fish-secondary">
              {modeLabel(status.mode)}
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Mini label="Chain" value={`${status.chain.chainName} (${status.chain.chainId})`} />
          <Mini label="Required config" value={`${status.deployment.configuredRequiredCount}/${status.deployment.requiredCount}`} />
          <Mini label="Wallet writes" value={status.walletActionGate.writesAllowed ? "Enabled" : "Disabled"} />
          <Mini label="Onchain read" value={status.onchain.readVerified ? "Verified" : "Not verified"} />
          <Mini label="Updated" value={formatDateTime(status.lastUpdated)} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Mini label="OCEAN staked" value={status.onchain.oceanStaking.totalStakedOcean ?? "-"} />
          <Mini label="sOCEAN locked" value={status.onchain.oceanStaking.totalLockedStakedOcean ?? "-"} />
          <Mini label="FISH supply" value={status.onchain.fish.totalSupply ?? "-"} />
          <Mini label="FISH in capacity" value={status.onchain.capacityPool.totalStakedFish ?? "-"} />
          <Mini label="Capacity stakers" value={status.onchain.capacityPool.stakerCount === null ? "-" : String(status.onchain.capacityPool.stakerCount)} />
          <Mini label="USDC distributed" value={status.onchain.capacityPool.totalUsdcDistributedEver ?? "-"} />
          <Mini label="USDC reserved" value={status.onchain.capacityPool.totalUsdcReservedForStakers ?? "-"} />
          <Mini label="Operator fee" value={status.onchain.capacityPool.operatorFeeBps === null ? "-" : `${status.onchain.capacityPool.operatorFeeBps / 100}%`} />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-fish-accent/20 bg-fish-navy950/45 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Anchor className="h-5 w-5 text-fish-accent" aria-hidden="true" />
              <h3 className="text-2xl font-black text-white">Contract docks</h3>
            </div>
            <ContractAddressList status={status} />
          </div>
          <EvmContractActionPanel status={status} />
        </div>

        <div className="mt-5 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-fish-gold" aria-hidden="true" />
            <div>
              <p className="text-sm font-black text-white">Safety rule</p>
              <p className="mt-1 text-sm font-bold leading-6 text-fish-primary">{status.warnings[0]}</p>
              {status.warnings[1] ? <p className="mt-1 text-sm font-bold leading-6 text-fish-secondary">{status.warnings[1]}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function modeLabel(mode: FishContractStatus["mode"]) {
  if (mode === "local_prototype") return "local prototype";
  if (mode === "configured_read_only") return "read-only";
  if (mode === "testnet_actions") return "testnet actions";
  return "mainnet read-only";
}
