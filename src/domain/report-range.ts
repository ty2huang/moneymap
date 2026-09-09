export type ReportRange = "last12" | "ytd" | "custom";

export function monthEnd(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
}

export function reportRange(
  range: Exclude<ReportRange, "custom">,
  today: string,
) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return {
    from:
      range === "ytd"
        ? `${year}-01-01`
        : new Date(Date.UTC(year, month - 12, 1)).toISOString().slice(0, 10),
    to: today,
  };
}
