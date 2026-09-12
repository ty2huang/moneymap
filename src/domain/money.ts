import { ensure } from "./types";
export function digits(currency: string) {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
export function minor(value: string, currency = "USD"): number {
  const d = digits(currency);
  ensure(/^-?\d+(\.\d+)?$/.test(value), "Enter a valid decimal amount.");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  ensure(fraction.length <= d, `Use at most ${d} decimal places.`);
  const amount =
    Number(
      BigInt(whole) * 10n ** BigInt(d) + BigInt(fraction.padEnd(d, "0") || "0"),
    ) * (value.startsWith("-") ? -1 : 1);
  ensure(
    Number.isSafeInteger(amount) && Math.abs(amount) <= 1_000_000_000_000,
    "Amount is too large.",
  );
  return amount;
}
export function decimal(value: number, currency = "USD") {
  const d = digits(currency),
    n = BigInt(Math.abs(value)),
    scale = 10n ** BigInt(d);
  return `${value < 0 ? "-" : ""}${n / scale}${d ? "." + String(n % scale).padStart(d, "0") : ""}`;
}
export function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(
    value / 10 ** digits(currency),
  );
}
export function netCost(
  amount: number,
  reimbursable: number,
  kind: "income" | "expense",
) {
  return kind === "income" ? amount - reimbursable : -amount + reimbursable;
}
