import type { DataState } from "@/lib/types";

const labels: Record<DataState, string> = {
  live: "Live data",
  snapshot: "Snapshot",
  sample: "Sample data",
  unavailable: "Unavailable"
};

const styles: Record<DataState, string> = {
  live: "border-fish-success/40 bg-fish-success/15 text-fish-success",
  snapshot: "border-fish-accent/40 bg-fish-accent/15 text-fish-accent",
  sample: "border-fish-gold/40 bg-fish-gold/15 text-fish-gold",
  unavailable: "border-fish-coral/40 bg-fish-coral/15 text-fish-coral"
};

export function StatusBadge({ state }: { state: DataState }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.08em] ${styles[state]}`}>
      {labels[state]}
    </span>
  );
}
