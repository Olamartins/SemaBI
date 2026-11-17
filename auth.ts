import NextAuth from "next-auth";
import AzureAD from "next-auth/providers/azure-ad";

/**
 * Production OIDC SSO via Microsoft Entra ID. App-role claims (CRO, ALCO, CFO, RISK,
 * BI_ADMIN, CREDIT_COMMITTEE) on the user are mapped to entitlements in lib/auth/roles.ts.
 * In demo mode this is bypassed (see middleware.ts).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    AzureAD({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
    }),
  ],
  callbacks: {
    jwt: async ({ token, account, profile }) => {
      if (account && profile) {
        const roles = (profile as { roles?: string[] }).roles ?? [];
        token.roles = roles;
      }
      return token;
    },
    session: async ({ session, token }) => {
      (session as { roles?: string[] }).roles = (token.roles as string[]) ?? [];
      return session;
    },
  },
});
