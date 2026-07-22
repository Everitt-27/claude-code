// Number / display formatting helpers.

/** Format a quantity with thousands separators, trimming trailing zeros. */
export function fmtQty(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  const rounded = Math.round(n * 1e6) / 1e6;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 5 });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Is a tracking expiration date in the past relative to `now`? */
export function isExpired(expiration: string, now = new Date()): boolean {
  if (!expiration || expiration.trim() === "") return false;
  const d = new Date(expiration);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}
