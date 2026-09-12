"use client";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const dismissPicker = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        content.current?.querySelector("select:open")
      ) {
        // Keep Escape out of Radix's document listener without cancelling the
        // browser's default action, which closes the native picker.
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", dismissPicker, true);
    return () => window.removeEventListener("keydown", dismissPicker, true);
  }, [open]);
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <D.Content
          ref={content}
          className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl"
        >
          <D.Title className="text-xl font-semibold">{title}</D.Title>
          <D.Description className="mb-6 mt-1 text-sm text-muted-foreground">
            {description ?? "Changes are shared with your household."}
          </D.Description>
          <D.Close
            className="absolute right-4 top-4 rounded p-1 hover:bg-muted"
            aria-label="Close"
          >
            <X size={18} />
          </D.Close>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
