"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Field, Select, ErrorMessage } from "./ui/fields";
import { Confirm } from "./ui/confirm";
import type { householdInfo } from "@/server/household-service";
import type { connections } from "@/server/connections";
function applicationHostname(uri?: string) {
  if (!uri) {
    return "";
  }
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function HouseholdSettings({ onChanged }: { onChanged: () => void }) {
  const query = useQuery({
      queryKey: ["household"],
      queryFn: () =>
        api<Awaited<ReturnType<typeof householdInfo>>>("/api/household"),
    }),
    [error, setError] = useState(""),
    [invite, setInvite] = useState("");
  async function action(action: string, id?: string) {
    try {
      const result = await api<{ url?: string }>("/api/household", {
        action,
        id,
      });
      if (result.url) {
        setInvite(result.url);
      }
      if (action !== "leave") {
        await query.refetch();
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const data = query.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-2">
        <h1 className="m-0 text-3xl font-semibold">Household</h1>
        <p className="m-0 text-sm leading-6 text-muted-foreground">
          Everyone can manage finances. Owners manage membership.
        </p>
      </div>
      <ErrorMessage message={error || query.error?.message} />
      {query.isPending && (
        <Card
          role="status"
          className="animate-pulse text-sm text-muted-foreground"
        >
          Loading your household…
        </Card>
      )}
      {data && (
        <>
          <Card className="grid gap-5 p-5 sm:p-6">
            <h2 className="m-0 text-lg font-semibold leading-7">Members</h2>
            <div className="divide-y divide-border">
              {data.members.map((m) => (
                <div
                  key={m.userId}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="break-words text-sm font-medium leading-6 [overflow-wrap:anywhere]">
                      {m.userId === data.member.userId ? "You" : m.displayName}
                    </span>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
                      {m.role}
                    </span>
                  </div>
                  {data.member.role === "owner" && (
                    <div className="flex flex-wrap gap-2">
                      {m.role !== "owner" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void action("promote", m.userId)}
                        >
                          Make owner
                        </Button>
                      )}
                      <Confirm
                        title="Remove household member?"
                        onConfirm={() => void action("remove", m.userId)}
                      >
                        <Button size="sm" variant="ghost">
                          Remove
                        </Button>
                      </Confirm>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-5">
              <Confirm
                title="Leave this household?"
                description={
                  data.members.length === 1
                    ? "You are the last member. Leaving permanently deletes this household and all its data. This cannot be undone."
                    : "You will lose access to this household. If you are the last member when you leave, the household and all its data will be permanently deleted."
                }
                onConfirm={() => void action("leave")}
              >
                <Button variant="outline">Leave household</Button>
              </Confirm>
            </div>
          </Card>
          {data.member.role === "owner" && (
            <>
              <Card className="grid gap-5 p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid gap-2">
                    <h2 className="m-0 text-lg font-semibold leading-7">
                      Invite someone
                    </h2>
                    <p className="m-0 text-sm leading-6 text-muted-foreground">
                      Links expire in 7 days. You approve every request.
                    </p>
                  </div>
                  <Button
                    className="shrink-0 self-start sm:self-center"
                    onClick={() => void action("invite")}
                  >
                    Create invitation
                  </Button>
                </div>
                {invite && (
                  <Field label="Copy and share this invitation">
                    <Input
                      readOnly
                      value={invite}
                      onFocus={(e) => e.target.select()}
                    />
                  </Field>
                )}
                {data.invitations
                  .filter((i) => !i.revoked)
                  .map((i) => (
                    <div
                      key={i.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-sm leading-6 text-muted-foreground"
                    >
                      <span>Expires {i.expiresAt.slice(0, 10)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void action("revoke-invite", i.id)}
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
              </Card>
              <Card className="grid gap-5 p-5 sm:p-6">
                <h2 className="m-0 text-lg font-semibold leading-7">
                  Join requests
                </h2>
                <div className="divide-y divide-border">
                  {data.requests
                    .filter((r) => r.status === "pending")
                    .map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0 break-words text-sm font-medium leading-6 [overflow-wrap:anywhere]">
                          {r.displayName}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => void action("approve", r.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void action("reject", r.id)}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  {!data.requests.some((r) => r.status === "pending") && (
                    <p className="m-0 text-sm leading-6 text-muted-foreground">
                      No pending requests.
                    </p>
                  )}
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
export function ConnectionsSettings() {
  const query = useQuery({
      queryKey: ["connections"],
      queryFn: () =>
        api<Awaited<ReturnType<typeof connections>>>("/api/connections"),
    }),
    [error, setError] = useState(""),
    [token, setToken] = useState(""),
    [name, setName] = useState(""),
    [permission, setPermission] = useState("read"),
    [days, setDays] = useState(30);
  async function action(action: string, id?: string) {
    try {
      const result = await api<{ token?: string }>("/api/connections", {
        action,
        id,
        name: name || undefined,
        permission,
        days,
      });
      if (result.token) {
        setToken(result.token);
      }
      await query.refetch();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Connections</h1>
      <ErrorMessage message={error || query.error?.message} />
      <Card>
        <h2 className="mb-0 text-lg">Personal access tokens</h2>
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
          Connect a script to your household. Tokens may access decrypted
          financial text.
        </p>
        <form
          className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void action("create-token");
          }}
        >
          <Field label="Name">
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My script"
            />
          </Field>
          <Field label="Permission">
            <Select
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
            >
              <option value="read">Read only</option>
              <option value="write">Read and write</option>
            </Select>
          </Field>
          <Field label="Expires in days">
            <Input
              type="number"
              min={1}
              max={365}
              required
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </Field>
          <Button type="submit">Create token</Button>
        </form>
        {token && (
          <div className="mt-4">
            <Field label="Copy now — this token is shown only once">
              <Input
                readOnly
                value={token}
                onFocus={(e) => e.target.select()}
              />
            </Field>
            <Button variant="ghost" size="sm" onClick={() => setToken("")}>
              Dismiss token
            </Button>
          </div>
        )}
        {query.data?.tokens
          .filter((t) => !t.revoked)
          .map((t) => (
            <div
              key={t.id}
              className="mt-4 flex items-center justify-between border-t border-border pt-4"
            >
              <div className="text-sm">
                {t.name}
                <span className="ml-3 text-xs text-muted-foreground">
                  {t.permission} · expires {t.expiresAt.slice(0, 10)}
                </span>
              </div>
              <Confirm
                title="Revoke this token?"
                onConfirm={() => void action("revoke-token", t.id)}
              >
                <Button size="sm" variant="outline">
                  Revoke
                </Button>
              </Confirm>
            </div>
          ))}
      </Card>
      <Card>
        <h2 className="mb-5 text-lg">Authorized applications</h2>
        {query.data?.grants
          .filter((g) => !g.revoked)
          .map((g) => {
            const name =
                g.application?.client.name.trim() || "Unknown application",
              hostname = applicationHostname(g.application?.client.uri);
            return (
              <div
                key={g.id}
                className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-sm font-semibold text-muted-foreground"
                    aria-hidden="true"
                  >
                    {name.charAt(0).toUpperCase() || "A"}
                  </div>
                  <div className="min-w-0">
                    <p className="mb-0 truncate text-sm font-medium">{name}</p>
                    <p className="mb-0 text-xs text-muted-foreground">
                      {hostname && <>{hostname} · </>}
                      {g.permission === "write" ? "Read & write" : "Read only"}
                    </p>
                  </div>
                </div>
                <Confirm
                  title={`Revoke ${name}'s access?`}
                  onConfirm={() => void action("revoke-grant", g.id)}
                >
                  <Button size="sm" variant="outline">
                    Revoke
                  </Button>
                </Confirm>
              </div>
            );
          })}
        {!query.data?.grants.some((g) => !g.revoked) && (
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            No applications connected. MCP clients can request access through
            OAuth.
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-primary">
          <a href="/api/openapi" target="_blank" rel="noreferrer">
            API specification ↗
          </a>
          <span>MCP endpoint: /mcp</span>
        </div>
      </Card>
    </div>
  );
}
