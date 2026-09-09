import * as React from "react";
import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "relative rounded-xl border border-border bg-card p-6",
        className,
      )}
      {...props}
    />
  );
}
