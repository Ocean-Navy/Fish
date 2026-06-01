import {
  BadgeDollarSign,
  BrainCircuit,
  Code2,
  Coins,
  CreditCard,
  Fish,
  KeyRound,
  LockKeyhole,
  Server,
  ShieldCheck,
  Ticket,
  Waves
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";

const systemLabels = [
  {
    label: "Users",
    icon: BrainCircuit,
    bring: "questions",
    get: "answers",
    className: "left-[3%] top-[24%]"
  },
  {
    label: "Builders",
    icon: Code2,
    bring: "apps",
    get: "API",
    className: "right-[3%] top-[24%]"
  },
  {
    label: "Providers",
    icon: Server,
    bring: "GPUs",
    get: "paid",
    className: "bottom-[9%] left-[4%]"
  },
  {
    label: "OCEAN",
    icon: Coins,
    bring: "stake",
    get: "credits",
    className: "bottom-[4%] left-1/2 -translate-x-1/2"
  },
  {
    label: "Ocean",
    icon: Waves,
    bring: "compute",
    get: "growth",
    className: "bottom-[9%] right-[4%]"
  }
];

const moneyLabels = [
  { label: "Stake", icon: LockKeyhole, detail: "OCEAN in", className: "left-[7%] top-[16%]" },
  { label: "Credits", icon: Fish, detail: "FISH out", className: "left-[43%] top-[22%]" },
  { label: "Plans", icon: Ticket, detail: "monthly access", className: "left-[9%] top-[47%]" },
  { label: "USDC", icon: CreditCard, detail: "API spend", className: "left-[28%] bottom-[11%]" },
  { label: "Payouts", icon: BadgeDollarSign, detail: "providers paid", className: "right-[12%] top-[48%]" },
  { label: "Reserve", icon: ShieldCheck, detail: "backs credits", className: "right-[28%] bottom-[10%]" },
  { label: "Later", icon: KeyRound, detail: "token lane", className: "right-[6%] bottom-[14%]" }
];

export function VisualExplainers() {
  return (
    <section id="maps" className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Visual maps</p>
            <h2 className="mt-2 text-4xl font-black text-white sm:text-6xl">See the loop.</h2>
          </div>
          <p className="max-w-lg text-xl font-black text-fish-accent">Less reading. More market.</p>
        </div>

        <div className="grid gap-6">
          <ExplainerCard
            title="Who brings what?"
            subtitle="Users ask. Builders plug in. Providers bring GPUs. OCEAN holders support the vault."
            image="/assets/generated/fish-system-map.png"
            imageAlt="Visual map of Fish users, builders, providers, OCEAN holders, and Ocean ecosystem around a Venice fish market hub"
            labels={systemLabels}
          />

          <ExplainerCard
            title="Where does the money go?"
            subtitle="Credits open AI access. USDC and plans fund requests. Providers get paid from real funds."
            image="/assets/generated/fish-money-flow.png"
            imageAlt="Visual map of Fish credits, OCEAN staking, USDC, subscriptions, reserves, provider payouts, and future token lane"
            labels={moneyLabels}
          />
        </div>
      </div>
    </section>
  );
}

function ExplainerCard({
  image,
  imageAlt,
  labels,
  subtitle,
  title
}: {
  image: string;
  imageAlt: string;
  labels: Array<{ label: string; icon: LucideIcon; bring?: string; get?: string; detail?: string; className: string }>;
  subtitle: string;
  title: string;
}) {
  return (
    <article className="overflow-hidden rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 shadow-harbor">
      <div className="grid gap-4 p-5 sm:p-7 lg:grid-cols-[0.28fr_0.72fr] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Picture first</p>
          <h3 className="mt-2 text-3xl font-black leading-tight text-white sm:text-5xl">{title}</h3>
          <p className="mt-4 text-lg font-bold leading-8 text-fish-secondary">{subtitle}</p>
        </div>

        <div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-[1.5rem] border border-fish-accent/20 bg-fish-navy950">
            <Image src={image} alt={imageAlt} fill sizes="(min-width: 1024px) 68vw, 100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-fish-navy950/70 via-transparent to-fish-navy950/10 lg:hidden" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-0 hidden lg:block">
              {labels.map((item) => (
                <MapLabel key={item.label} {...item} />
              ))}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:hidden">
            {labels.map((item) => (
              <LegendChip key={item.label} {...item} />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function MapLabel({
  bring,
  className,
  detail,
  get,
  icon: Icon,
  label
}: {
  bring?: string;
  className: string;
  detail?: string;
  get?: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className={`absolute w-44 rounded-2xl border border-fish-accent/30 bg-fish-navy950/78 p-3 shadow-harbor backdrop-blur ${className}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fish-accent text-fish-navy950">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-base font-black text-white">{label}</p>
          <p className="text-xs font-black text-fish-accent">{detail ?? `${bring} -> ${get}`}</p>
        </div>
      </div>
    </div>
  );
}

function LegendChip({
  bring,
  detail,
  get,
  icon: Icon,
  label
}: {
  bring?: string;
  detail?: string;
  get?: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fish-accent/15 text-fish-accent">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="font-black text-white">{label}</p>
        <p className="text-sm font-bold text-fish-secondary">{detail ?? `${bring} -> ${get}`}</p>
      </div>
    </div>
  );
}
