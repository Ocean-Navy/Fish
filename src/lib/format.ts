export function formatNumber(value: number | null | undefined, fallback = "-"): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return fallback;
  }
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(Number(value));
}

export function formatUsd(value: number | null | undefined, fallback = "-"): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return fallback;
  }
  return `$${Number(value).toFixed(2)}`;
}

export function formatCompact(value: number | null | undefined, fallback = "-"): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return fallback;
  }
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "No timestamp";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}
