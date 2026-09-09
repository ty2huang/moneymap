"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  Link2,
  LoaderCircle,
  Pencil,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/fields";
import { api } from "@/lib/client";

export function ConsentForm({
  authorizationId,
  clientName,
}: {
  authorizationId: string;
  clientName: string;
}) {
  const [permission, setPermission] = useState("read"),
    [error, setError] = useState(""),
    [pendingDecision, setPendingDecision] = useState<string | null>(null);
  const busy = pendingDecision !== null;

  async function submit(decision: string) {
    setPendingDecision(decision);
    setError("");
    try {
      const result = await api<{ redirect_url: string }>("/api/connections", {
        action: "consent",
        data: { authorizationId, decision, permission },
      });
      window.location.assign(result.redirect_url);
    } catch (e) {
      setError((e as Error).message);
      setPendingDecision(null);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
      <div className="w-full max-w-xl">
        <Card
          className="overflow-hidden rounded-2xl p-0 shadow-2xl shadow-black/15"
          aria-labelledby="consent-title"
          aria-busy={busy}
        >
          <div className="px-6 pb-7 pt-8 sm:px-9 sm:pt-9">
            <div className="mb-6 flex items-center gap-3" aria-hidden="true">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Wallet className="size-6" />
              </div>
              <Link2 className="size-4 text-muted-foreground" />
              <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-background text-lg font-semibold">
                {clientName.trim().charAt(0).toUpperCase() || "A"}
              </div>
            </div>
            <h1
              id="consent-title"
              className="mb-3 break-words text-3xl font-semibold tracking-tight"
            >
              Connect {clientName} to MoneyMap?
            </h1>
            <p className="mb-0 text-sm leading-6 text-muted-foreground">
              Choose how this application can access your shared household
              finances.
            </p>
          </div>

          <div className="space-y-7 px-6 pb-8 sm:px-9">
            <fieldset disabled={busy} className="min-w-0">
              <legend className="mb-3 text-sm font-medium">
                Financial permissions
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    value: "read",
                    title: "Read only",
                    description: "View your household’s financial data.",
                    icon: Eye,
                  },
                  {
                    value: "write",
                    title: "Read & write",
                    description:
                      "View, create, edit, and delete financial data.",
                    icon: Pencil,
                  },
                ].map(({ value, title, description, icon: Icon }) => (
                  <label
                    key={value}
                    className="relative flex cursor-pointer rounded-xl has-[:disabled]:cursor-wait"
                  >
                    <input
                      type="radio"
                      name="permission"
                      value={value}
                      checked={permission === value}
                      onChange={() => setPermission(value)}
                      className="peer sr-only"
                    />
                    <span className="flex w-full flex-col rounded-xl border border-border bg-background/40 p-4 transition-colors peer-checked:border-primary/60 peer-checked:bg-primary/[0.06] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card peer-disabled:opacity-60">
                      <span className="mb-3 flex items-center justify-between">
                        <Icon
                          className="size-5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span
                          className={`flex size-4 items-center justify-center rounded-full border ${permission === value ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                          aria-hidden="true"
                        >
                          {permission === value && (
                            <Check className="size-3" strokeWidth={3} />
                          )}
                        </span>
                      </span>
                      <span className="mb-1 text-sm font-medium">{title}</span>
                      <span className="text-xs leading-5 text-muted-foreground">
                        {description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex gap-3 rounded-xl bg-muted/50 p-4">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mb-0 text-xs leading-5 text-muted-foreground">
                Only allow access if you trust this application.
              </p>
            </div>

            <ErrorMessage message={error} />
          </div>

          <div className="border-t border-border bg-background/30 px-6 py-5 sm:px-9">
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-11"
                disabled={busy}
                onClick={() => void submit("deny")}
              >
                {pendingDecision === "deny" ? (
                  <>
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />{" "}
                    Denying…
                  </>
                ) : (
                  "Deny"
                )}
              </Button>
              <Button
                className="h-11"
                disabled={busy}
                onClick={() => void submit("approve")}
              >
                {pendingDecision === "approve" ? (
                  <>
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />{" "}
                    Connecting…
                  </>
                ) : (
                  <>
                    Allow access{" "}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>
            <p className="mb-0 pt-4 text-center text-xs leading-5 text-muted-foreground">
              You can revoke access anytime in Connections.
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}
