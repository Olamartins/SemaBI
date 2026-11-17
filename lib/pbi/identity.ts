import type { EffectiveIdentity } from "../types.ts";
/**
 * RLS is sacred: every Power BI query must execute under an effective identity.
 * This module is the single choke point that enforces identity propagation.
 * Any query path that cannot produce an identity fails closed.
 */
export class MissingIdentityError extends Error {
  constructor(message = "Power BI query attempted without an effective identity (RLS would be bypassed)") {
    super(message);
    this.name = "MissingIdentityError";
  }
}

export function requireIdentity(identity: EffectiveIdentity | null | undefined): EffectiveIdentity {
  if (!identity || !identity.userId || identity.userId.trim() === "") {
    throw new MissingIdentityError();
  }
  return identity;
}

export function assertRlsPropagated(identity: EffectiveIdentity, queryDesc: string): void {
  const id = requireIdentity(identity);
  // The app must never claim to apply RLS itself; the tenant applies it. We only
  // verify an identity exists and record that RLS scope is delegated to the tenant.
  if (!id.mode || (id.mode !== "delegated" && id.mode !== "service-principal")) {
    throw new MissingIdentityError(`Query '${queryDesc}' has invalid identity mode '${String(id.mode)}'`);
  }
}
