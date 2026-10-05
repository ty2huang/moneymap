import { randomBytes } from "node:crypto";
import { z } from "zod";
import { emptyLedger } from "@/domain/catalog";
import type { Household, Member } from "@/domain/types";
import { firstParty, type Principal } from "./auth";
import { newKey, hash } from "./crypto";
import { databaseRpc } from "./database";
import { getAppUrl } from "./app-url";

export type Session = {
  userId: string;
  member: Member | null;
  requests: { id: string; status: string; userId: string }[];
};
export async function session(principal: Principal) {
  firstParty(principal);
  return databaseRpc<Session>(principal, "session");
}

export async function createHousehold(principal: Principal, input: unknown) {
  firstParty(principal);
  const { currency } = z
    .object({ currency: z.enum(["CAD", "USD"]) })
    .parse(input);
  const id = crypto.randomUUID();
  return databaseRpc<{ id: string }>(principal, "create_household", {
    id,
    currency,
    wrapped_key: newKey(id),
    display_name: principal.displayName ?? "Member",
    categories: emptyLedger().categories,
  });
}

export async function requestJoin(principal: Principal, input: unknown) {
  firstParty(principal);
  const { token } = z
    .object({ token: z.string().min(20).max(200) })
    .parse(input);
  return databaseRpc<{ id: string }>(principal, "join", {
    invitation_hash: hash(token),
    display_name: principal.displayName ?? "Member",
  });
}

export type HouseholdInfo = {
  household: Household;
  member: Member;
  members: (Member & { displayName: string })[];
  requests: {
    id: string;
    userId: string;
    status: string;
    displayName: string;
  }[];
  invitations: { id: string; expiresAt: string; revoked: boolean }[];
};
export async function householdInfo(principal: Principal) {
  firstParty(principal);
  return databaseRpc<HouseholdInfo>(principal, "household");
}

export async function householdAction(principal: Principal, input: unknown) {
  firstParty(principal);
  const action = z
    .object({
      action: z.enum([
        "invite",
        "revoke-invite",
        "approve",
        "reject",
        "remove",
        "promote",
        "leave",
      ]),
      id: z.string().uuid().optional(),
    })
    .parse(input);
  if (action.action === "invite") {
    const token = randomBytes(32).toString("base64url");
    await databaseRpc(principal, "household_action", {
      ...action,
      invitation_id: crypto.randomUUID(),
      invitation_hash: hash(token),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    return { url: `${getAppUrl()}/?invite=${token}` };
  }
  return databaseRpc<{ ok: true }>(principal, "household_action", action);
}
