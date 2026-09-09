"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Popover as P } from "radix-ui";
import { cn } from "@/lib/utils";

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parseMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

export function MonthPicker({
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const selected = parseMonth(value);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(selected.year);

  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(selected.year, selected.month - 1, 1)));

  return (
    <P.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setYear(selected.year);
        setOpen(nextOpen);
      }}
    >
      <P.Trigger asChild>
        <button
          type="button"
          aria-label={`${ariaLabel ?? "Choose month"}: ${label}`}
          className={cn(
            "group flex h-11 w-full min-w-0 items-center rounded-xl border border-border bg-card/70 text-left text-sm font-medium text-foreground shadow-sm outline-none transition-[border-color,background-color,box-shadow] hover:border-input hover:bg-muted/45 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20",
            className,
          )}
        >
          <CalendarDays
            className="mx-3.5 size-4 shrink-0 text-primary"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronDown className="mx-3 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-3 shadow-2xl shadow-black/35 outline-none"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <button
              type="button"
              className="grid size-9 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setYear((current) => current - 1)}
              aria-label={`Show ${year - 1}`}
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="text-sm font-semibold tabular-nums">{year}</div>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setYear((current) => current + 1)}
              aria-label={`Show ${year + 1}`}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div
            className="grid grid-cols-3 gap-1"
            role="group"
            aria-label={`Months in ${year}`}
          >
            {months.map((month, index) => {
              const monthNumber = index + 1;
              const isSelected =
                selected.year === year && selected.month === monthNumber;
              return (
                <button
                  key={month}
                  type="button"
                  aria-pressed={isSelected}
                  className={cn(
                    "h-10 rounded-lg text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected &&
                      "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                  )}
                  onClick={() => {
                    onChange(`${year}-${String(monthNumber).padStart(2, "0")}`);
                    setOpen(false);
                  }}
                >
                  {month}
                </button>
              );
            })}
          </div>
          <P.Arrow className="fill-border" />
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
