"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Popover } from "radix-ui";
import { browserToday } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Input } from "./input";

// Calendar dates stay in UTC so daylight-saving changes cannot shift a day.
function date(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function iso(value: Date) {
  return value.toISOString().split("T")[0];
}

const dateLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const monthLabel = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const actionClass =
  "grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35";

export function DatePicker({
  value,
  onChange,
  label,
  placeholder = "Choose date",
  min = "0001-01-01",
  max = "9999-12-31",
  clearable = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  min?: string;
  max?: string;
  clearable?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(value || browserToday());
  const [draft, setDraft] = useState(value);
  const dayButton = useRef<HTMLButtonElement>(null);
  const keyboardFocus = useRef(false);
  const currentDay = browserToday();
  const visible = date(focused);
  const first = new Date(visible);
  first.setUTCDate(1);
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const clamp = (day: string) => (day < min ? min : day > max ? max : day);
  const allowed = (day: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= min && day <= max;

  function focusDate(next: Date) {
    const bounded = next < date(min) ? min : next > date(max) ? max : iso(next);
    setFocused(bounded);
  }

  function select(day: string) {
    onChange(day);
    setOpen(false);
  }

  function moveMonth(offset: number) {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + offset);
    focusDate(next);
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -visible.getUTCDay(),
      End: 6 - visible.getUTCDay(),
    };
    if (event.key in offsets) {
      event.preventDefault();
      const next = new Date(visible);
      next.setUTCDate(next.getUTCDate() + offsets[event.key]);
      keyboardFocus.current = true;
      focusDate(next);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      keyboardFocus.current = true;
      moveMonth(event.key === "PageUp" ? -1 : 1);
    }
  }

  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setFocused(clamp(value || currentDay));
            setDraft(value);
            keyboardFocus.current = false;
          }
          setOpen(nextOpen);
        }}
      >
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            className="group flex h-11 w-full min-w-0 items-center rounded-xl border border-input/80 bg-card text-left text-sm font-medium text-foreground shadow-sm outline-none transition-[border-color,background-color,box-shadow] hover:border-muted-foreground/60 hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 data-[state=open]:border-primary data-[state=open]:ring-3 data-[state=open]:ring-primary/15"
          >
            <CalendarDays
              aria-hidden="true"
              className="mx-3.5 size-4 shrink-0 text-primary"
              strokeWidth={1.8}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                !value && "text-muted-foreground",
              )}
            >
              {value ? dateLabel.format(date(value)) : placeholder}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="mx-3 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
            />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            aria-label={`${label}: choose a date`}
            align="start"
            sideOffset={8}
            collisionPadding={16}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              dayButton.current?.focus();
            }}
            className="z-50 w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-input bg-card p-3 text-foreground shadow-[0_16px_40px_-8px_rgb(0_0_0/50%)] outline-none"
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                className={actionClass}
                disabled={min.slice(0, 7) >= focused.slice(0, 7)}
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft className="size-4" />
              </button>
              <span aria-live="polite" className="text-sm font-semibold">
                {monthLabel.format(first)}
              </span>
              <button
                type="button"
                aria-label="Next month"
                className={actionClass}
                disabled={max.slice(0, 7) <= focused.slice(0, 7)}
                onClick={() => moveMonth(1)}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div
              className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground"
              aria-hidden="true"
            >
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                <span key={day} className="py-2">
                  {day}
                </span>
              ))}
            </div>
            <div
              role="group"
              aria-label={monthLabel.format(first)}
              className="grid grid-cols-7 gap-1"
            >
              {Array.from({ length: 42 }, (_, index) => {
                const day = new Date(start);
                day.setUTCDate(start.getUTCDate() + index);
                const key = iso(day);
                const selected = key === value;
                return (
                  <button
                    key={key}
                    ref={
                      key === focused
                        ? (node) => {
                            dayButton.current = node;
                            if (node && keyboardFocus.current) {
                              node.focus();
                              keyboardFocus.current = false;
                            }
                          }
                        : undefined
                    }
                    type="button"
                    tabIndex={key === focused ? 0 : -1}
                    aria-label={dateLabel.format(day)}
                    aria-pressed={selected}
                    aria-current={key === currentDay ? "date" : undefined}
                    disabled={
                      !allowed(key) ||
                      day.getUTCFullYear() < 1 ||
                      day.getUTCFullYear() > 9999
                    }
                    onKeyDown={navigate}
                    onClick={() => select(key)}
                    className={cn(
                      "aspect-square rounded-lg text-sm tabular-nums outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-25",
                      day.getUTCMonth() !== visible.getUTCMonth() &&
                        "text-muted-foreground",
                      key === currentDay &&
                        "border border-primary/50 font-semibold",
                      selected &&
                        "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    {day.getUTCDate()}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <label
                htmlFor={`${id}-entry`}
                className="mb-2 block text-xs text-muted-foreground"
              >
                Enter a date
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id={`${id}-entry`}
                  type="date"
                  min={min}
                  max={max}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (draft && allowed(draft)) select(draft);
                    }
                  }}
                />
                <button
                  type="button"
                  className={actionClass}
                  disabled={!draft || !allowed(draft)}
                  onClick={() => select(draft)}
                >
                  Apply
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  className={cn(actionClass, "text-primary")}
                  disabled={!allowed(currentDay)}
                  onClick={() => select(currentDay)}
                >
                  Today
                </button>
                {clearable && (
                  <button
                    type="button"
                    className={actionClass}
                    disabled={!value}
                    onClick={() => select("")}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
