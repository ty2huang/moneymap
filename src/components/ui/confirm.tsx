"use client";
import { AlertDialog as A } from "radix-ui";
import { Button } from "./button";
export function Confirm({
  title,
  description = "This changes the shared household records. Linked records may need to be updated first.",
  onConfirm,
  children,
}: {
  title: string;
  description?: string;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <A.Root>
      <A.Trigger asChild>{children}</A.Trigger>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <A.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6">
          <A.Title className="text-lg font-semibold">{title}</A.Title>
          <A.Description className="my-4 text-sm text-muted-foreground">
            {description}
          </A.Description>
          <div className="flex justify-end gap-2">
            <A.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </A.Cancel>
            <A.Action asChild>
              <Button variant="destructive" onClick={onConfirm}>
                Confirm
              </Button>
            </A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
