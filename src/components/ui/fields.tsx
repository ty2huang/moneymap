import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./select.module.css";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block min-w-0">
      <select
        className={cn(
          "peer h-11 w-full min-w-0 cursor-pointer appearance-none rounded-xl border border-input/80 bg-card py-2 pl-3.5 pr-10 text-sm font-medium text-foreground shadow-sm outline-none transition-[border-color,background-color,box-shadow] hover:border-muted-foreground/60 hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-45",
          styles.select,
          className,
        )}
        {...props}
      />
      <span className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-[color,transform] peer-open:rotate-180 peer-open:text-primary peer-disabled:opacity-40">
        <ChevronDown className="size-4" strokeWidth={1.8} aria-hidden="true" />
      </span>
    </span>
  );
}
export function ErrorMessage({ message }: { message?: string }) {
  return message ? (
    <p
      role="alert"
      className="my-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-300"
    >
      {message}
    </p>
  ) : null;
}
