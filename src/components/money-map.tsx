"use client";
import { useEffect, useRef, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Map,
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  Tags,
  Users,
  Plug,
  LogOut,
  ShieldCheck,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";
import { api, supabaseBrowser } from "@/lib/client";
import type { Snapshot, Member } from "@/domain/types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Field, Select, ErrorMessage } from "./ui/fields";
import { Dashboard, type Drill } from "./dashboard";
import { Transactions } from "./transactions";
import { CatalogSettings } from "./catalog-settings";
import { HouseholdSettings, ConnectionsSettings } from "./household-settings";
const nav = [
  { id: "dashboard", name: "Overview", icon: LayoutDashboard },
  { id: "transactions", name: "Transactions", icon: ArrowLeftRight },
  { id: "accounts", name: "Accounts", icon: Landmark },
  { id: "categories", name: "Categories", icon: Tags },
  { id: "household", name: "Household", icon: Users },
  { id: "connections", name: "Connections", icon: Plug },
];
type Session = {
  configured: boolean;
  userId?: string;
  member?: Member | null;
  requests?: { id: string; status: string }[];
};
export function MoneyMap() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: true },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}
function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const client = useQueryClient(),
    session = useQuery({
      queryKey: ["session"],
      queryFn: () => api<Session>("/api/session"),
    }),
    state = useQuery({
      queryKey: ["state"],
      queryFn: () => api<Snapshot>("/api/state"),
      enabled: !!session.data?.member,
    }),
    [page, setPage] = useState("dashboard"),
    [events, setEvents] = useState(0),
    [drill, setDrill] = useState<Drill>();
  const userId = session.data?.userId;
  const householdId = session.data?.member?.householdId;
  const hasNoMembership = !!session.data && !session.data.member;
  function changed() {
    setEvents((n) => n + 1);
    void client.invalidateQueries({ queryKey: ["state"] });
    void client.invalidateQueries({ queryKey: ["household"] });
    void client.invalidateQueries({ queryKey: ["session"] });
  }
  useEffect(() => {
    if (!userId) {
      return;
    }
    const checkForChanges = () => {
      void client.invalidateQueries();
    };
    const update = () => {
      setEvents((n) => n + 1);
      checkForChanges();
    };
    window.addEventListener("online", checkForChanges);
    window.addEventListener("focus", checkForChanges);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return () => {
        window.removeEventListener("online", checkForChanges);
        window.removeEventListener("focus", checkForChanges);
      };
    }
    const supabase = supabaseBrowser();
    const channels = [
      supabase
        .channel("user:" + userId, { config: { private: true } })
        .on("broadcast", { event: "changed" }, update)
        .subscribe(),
    ];
    if (householdId) {
      channels.push(
        supabase
          .channel("household:" + householdId, {
            config: { private: true },
          })
          .on("broadcast", { event: "changed" }, update)
          .subscribe((status: string) => {
            if (status === "SUBSCRIBED") {
              checkForChanges();
            }
          }),
      );
    }
    const listener = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_OUT") {
        client.clear();
      }
    });
    return () => {
      channels.forEach((c) => void supabase.removeChannel(c));
      listener.data.subscription.unsubscribe();
      window.removeEventListener("online", checkForChanges);
      window.removeEventListener("focus", checkForChanges);
    };
  }, [userId, householdId, client]);
  useEffect(() => {
    if (hasNoMembership) {
      client.removeQueries({ queryKey: ["state"] });
    }
  }, [hasNoMembership, client]);
  if (session.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading MoneyMap…
      </div>
    );
  }
  if (!session.data?.userId) {
    return <Welcome configured={session.data?.configured !== false} />;
  }
  if (!session.data.member) {
    return (
      <Onboarding requests={session.data.requests ?? []} onChanged={changed} />
    );
  }
  if (!state.data || state.error) {
    return (
      <div className="mx-auto max-w-lg p-12">
        <ErrorMessage message={state.error?.message} />
        <p>
          {state.isPending
            ? "Opening your household…"
            : "Your household could not be loaded."}
        </p>
        <Button
          variant="outline"
          onClick={() => void client.invalidateQueries()}
        >
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside
        className="border-b border-border bg-card p-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:p-5"
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) {
            setMenuOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        <div className="flex items-center gap-3 lg:mb-8 lg:px-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Map size={23} />
          </div>
          <span className="text-xl font-semibold tracking-tight">MoneyMap</span>
          <Button
            ref={menuButton}
            variant="outline"
            size="sm"
            className="ml-auto lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="workspace-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={17} /> : <Menu size={17} />}
            {menuOpen ? "Close" : "Menu"}
          </Button>
        </div>
        <div
          id="workspace-navigation"
          className={`${menuOpen ? "block" : "hidden"} pt-5 lg:block lg:pt-0`}
        >
          <p className="mb-3 px-3 text-[10px] uppercase tracking-[.2em] text-muted-foreground">
            Your workspace
          </p>
          <nav
            aria-label="Workspace"
            className="grid grid-cols-2 gap-1 lg:flex lg:flex-col"
          >
            {nav.map(({ id, name, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setPage(id);
                  setMenuOpen(false);
                  menuButton.current?.focus();
                  if (id === "transactions") {
                    setDrill(undefined);
                  }
                }}
                aria-current={page === id ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ${page === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Icon size={17} />
                {name}
              </button>
            ))}
          </nav>
          <div className="mt-8 rounded-lg border border-border p-3 lg:absolute lg:bottom-6 lg:left-5 lg:right-5">
            <div className="mb-1 flex items-center gap-2 text-sm">
              <span className="size-2 rounded-full bg-primary" />
              Shared household
            </div>
            <div className="ml-4 text-xs text-muted-foreground">
              {state.data.household.currency}
            </div>
            <Button
              className="mt-4 w-full"
              variant="ghost"
              size="sm"
              onClick={async () => {
                await api("/api/session", undefined, "DELETE");
                client.clear();
                window.location.assign("/");
              }}
            >
              <LogOut size={14} />
              Sign out
            </Button>
          </div>
        </div>
      </aside>
      <main className="min-w-0">
        <header className="flex h-12 items-center justify-between border-b border-border px-4 lg:h-16 lg:px-10">
          <span className="text-xs text-muted-foreground">
            <span className="hidden sm:inline">
              Workspace <span className="px-2">/</span>{" "}
            </span>
            {nav.find((n) => n.id === page)?.name}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck size={14} />
            <span className="hidden sm:inline">Private to your household</span>
            <span className="sm:hidden">Private workspace</span>
          </span>
        </header>
        <div className="mx-auto max-w-[1500px] p-4 sm:p-5 lg:p-10">
          {page === "dashboard" && (
            <Dashboard
              snapshot={state.data}
              eventCount={events}
              onDrill={(d) => {
                setDrill(d);
                setPage("transactions");
              }}
            />
          )}
          {page === "transactions" && (
            <Transactions
              key={JSON.stringify(drill)}
              snapshot={state.data}
              onChanged={changed}
              initialFilters={drill}
            />
          )}
          {(page === "accounts" || page === "categories") && (
            <CatalogSettings
              key={page}
              snapshot={state.data}
              kind={page === "accounts" ? "account" : "category"}
              onChanged={changed}
            />
          )}
          {page === "household" && <HouseholdSettings onChanged={changed} />}
          {page === "connections" && <ConnectionsSettings />}
        </div>
      </main>
    </div>
  );
}
function Welcome({ configured }: { configured: boolean }) {
  const [signInError, setSignInError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const next =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16">
      <div className="grid w-full gap-12 md:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="mb-12 flex items-center gap-3 text-xl font-semibold">
            <Map className="text-primary" />
            MoneyMap
          </div>
          <p className="text-xs uppercase tracking-[.24em] text-primary">
            Understand your spending
          </p>
          <h1 className="my-6 text-5xl font-semibold leading-[1.12] tracking-tight">
            Your money
            <br />
            <span className="text-primary">Made clear</span>
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            Set up a household and see where your money goes.
          </p>
        </div>
        <Card className="self-center p-8">
          <h2 className="mb-3 text-2xl font-medium">Welcome to MoneyMap</h2>
          <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
            A simple way to manage household finances.
          </p>
          {configured ? (
            <>
              <Button className="w-full" asChild>
                <a href={"/auth/login?next=" + encodeURIComponent(next)}>
                  Sign in with Google <ArrowRight size={16} />
                </a>
              </Button>
              {typeof window !== "undefined" &&
                new URLSearchParams(window.location.search).has(
                  "authError",
                ) && (
                  <ErrorMessage message="Sign-in could not be completed. Please try again." />
                )}
              {process.env.NODE_ENV === "development" && (
                <form
                  className="mt-6 space-y-4"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const values = new FormData(form);
                    setSigningIn(true);
                    setSignInError("");
                    try {
                      await api("/auth/password", {
                        email: values.get("email"),
                        password: values.get("password"),
                      });
                      form.reset();
                      // Reload this URL to retain invitation parameters and read the new cookies.
                      window.location.reload();
                    } catch (error) {
                      setSignInError(
                        error instanceof Error
                          ? error.message
                          : "Sign-in failed.",
                      );
                      setSigningIn(false);
                    }
                  }}
                >
                  <div className="mb-6 flex items-center gap-4">
                    <hr className="flex-1 border-border" />
                    <span className="text-xs text-muted-foreground">
                      or continue with email
                    </span>
                    <hr className="flex-1 border-border" />
                  </div>
                  <Field label="Email">
                    <Input
                      name="email"
                      type="email"
                      autoComplete="username"
                      placeholder="you@example.com"
                      required
                      disabled={signingIn}
                    />
                  </Field>
                  <Field label="Password">
                    <Input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      disabled={signingIn}
                    />
                  </Field>
                  <ErrorMessage message={signInError} />
                  <Button className="w-full" type="submit" disabled={signingIn}>
                    {signingIn ? "Signing in…" : "Sign in with email"}
                  </Button>
                </form>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-medium">Ready for your household</h3>
              <p className="mb-0 text-sm leading-relaxed text-muted-foreground">
                MoneyMap needs its Supabase and encryption configuration before
                sign-in is available. Follow the setup guide in README.md to
                connect this installation.
              </p>
            </div>
          )}
          <div className="mt-8 flex items-center gap-2 border-t border-border pt-5 text-xs text-muted-foreground">
            <ShieldCheck size={16} />
            No bank passwords. No automatic bank access.
          </div>
        </Card>
      </div>
    </div>
  );
}
function Onboarding({
  requests,
  onChanged,
}: {
  requests: { id: string; status: string }[];
  onChanged: () => void;
}) {
  const [currency, setCurrency] = useState<"CAD" | "USD">("USD"),
    [token, setToken] = useState(
      new URLSearchParams(window.location.search).get("invite") ?? "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(action: string, data: unknown) {
    setBusy(true);
    try {
      await api("/api/household", { action, data });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-4xl p-6 py-16">
      <div className="mb-10 flex items-center gap-3 text-xl font-semibold">
        <Map className="text-primary" />
        MoneyMap
      </div>
      <h1 className="text-3xl font-semibold">Make yourself at home.</h1>
      <p className="mb-8 text-muted-foreground">
        Create a shared space, or join the people you share expenses with.
      </p>
      <ErrorMessage message={error} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-5 text-lg">Create a household</h2>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit("create", { currency });
            }}
          >
            <Field label="Currency">
              <Select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "CAD" | "USD")}
              >
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </Select>
            </Field>
            <Button type="submit" disabled={busy}>
              Create household
            </Button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-5 text-lg">Join a household</h2>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              let value = token;
              try {
                value = new URL(token).searchParams.get("invite") ?? token;
              } catch {}
              void submit("join", { token: value });
            }}
          >
            <Field label="Invitation link or code">
              <Input
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your invitation"
              />
            </Field>
            <Button type="submit" variant="outline" disabled={busy}>
              Request to join
            </Button>
          </form>
          {requests.map((r) => (
            <p key={r.id} className="mt-4 text-sm text-muted-foreground">
              Join request: {r.status}
            </p>
          ))}
        </Card>
      </div>
    </main>
  );
}
