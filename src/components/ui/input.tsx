import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
