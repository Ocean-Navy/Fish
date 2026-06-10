import {
  BrainCircuit,
  Code2,
  Coins,
  Server
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";

const systemLabels = [
  {
    label: "Users",
    icon: BrainCircuit,
    detail: "Ask AI"
  },
  {
    label: "Builders",
    icon: Code2,
    detail: "Use the API"
  },
  {
    label: "Providers",
    icon: Server,
    detail: "Bring GPUs"
  },
  {
    label: "Holders",
    icon: Coins,
    detail: "Stake $OCEAN"
  }
];

const moneyLabels = [
  {
    label: "Users",
    icon: BrainCircuit,
    detail: "Subscription"
  },
  {
    label: "Builders",
    icon: Code2,
    detail: "API spend"
  },
  {
    label: "Providers",
    icon: Server,
    detail: "GPUs"
  },
  {
    label: "Holders",
    icon: Coins,
    detail: "Staking"
  }
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
            subtitle="Users, builders, providers, and holders meet around the Fish vault."
            image="/assets/generated/fish-system-map-labeled-v3.webp"
            imageAlt="Visual map of Fish users, builders, providers, and holders around a Venice fish market hub"
            labels={systemLabels}
          />

          <ExplainerCard
            title="How money moves"
            subtitle="Money enters Fish Credits. The market feeds GPUs, staking, and ecosystem growth."
            image="/assets/generated/fish-money-flow-labeled-v5.webp"
            imageAlt="Visual map of Fish Credits receiving subscription and API money, rewarding GPU providers, staking holders, and ecosystem growth"
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
  labels: Array<{ label: string; icon: LucideIcon; detail: string }>;
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

function LegendChip({
  detail,
  icon: Icon,
  label
}: {
  detail: string;
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
        <p className="text-sm font-bold text-fish-secondary">{detail}</p>
      </div>
    </div>
  );
}
