import type { EffectiveIdentity, PbiClient } from "../types.ts";
import { MockPowerBiClient } from "./mock.ts";
import type { MockAuditSink } from "./mock.ts";
import { PowerBiRestClient, ServicePrincipalTokenProvider, OnBehalfOfTokenProvider } from "./client.ts";

export function isDemoMode(): boolean {
  return (process.env.SEMABI_MODE ?? "demo") !== "prod";
}

export interface PbiFactoryOptions {
  audit?: MockAuditSink;
  endPeriod?: string;
  userAssertion?: string;
}

/** Returns the mock connector in demo mode, or a real MSAL-backed REST client in prod. */
export function createPbiClient(opts: PbiFactoryOptions = {}): PbiClient {
  if (isDemoMode()) {
    return new MockPowerBiClient(opts.endPeriod, opts.audit);
  }
  const tenantId = process.env.PBI_SP_TENANT_ID ?? process.env.AZURE_AD_TENANT_ID ?? "";
  const clientId = process.env.PBI_SP_CLIENT_ID ?? process.env.AZURE_AD_CLIENT_ID ?? "";
  const clientSecret = process.env.PBI_SP_CLIENT_SECRET ?? process.env.AZURE_AD_CLIENT_SECRET ?? "";
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Prod mode requires PBI_SP_CLIENT_ID/PBI_SP_CLIENT_SECRET/PBI_SP_TENANT_ID (or delegated assertion)");
  }
  const provider = opts.userAssertion
    ? new OnBehalfOfTokenProvider(clientId, clientSecret, tenantId, opts.userAssertion)
    : new ServicePrincipalTokenProvider(clientId, clientSecret, tenantId);
  return new PowerBiRestClient(provider, opts.audit);
}

export type { EffectiveIdentity, PbiClient };
