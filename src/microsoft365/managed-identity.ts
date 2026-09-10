import type { AccessTokenProvider } from "./graph-client.ts";

type ManagedIdentityResponse = { access_token?: string; expires_on?: string };

/** Gets a token from the Function App system-assigned identity. */
export class ManagedIdentityTokenProvider implements AccessTokenProvider {
  private cached?: { token: string; expiresAt: number };
  private readonly resource: string;

  constructor(resource = "https://graph.microsoft.com/") {
    this.resource = resource;
  }

  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now() + 120_000) return this.cached.token;
    const endpoint = process.env.IDENTITY_ENDPOINT;
    const header = process.env.IDENTITY_HEADER;
    if (!endpoint || !header) throw new Error("Managed identity is only available when the code runs in Azure Functions");
    const response = await fetch(`${endpoint}?api-version=2019-08-01&resource=${encodeURIComponent(this.resource)}`, {
      headers: { "X-IDENTITY-HEADER": header },
    });
    if (!response.ok) throw new Error(`Managed identity token request failed with HTTP ${response.status}`);
    const payload = await response.json() as ManagedIdentityResponse;
    if (!payload.access_token) throw new Error("Managed identity token response did not contain access_token");
    const expiresAt = Number(payload.expires_on) * 1000;
    this.cached = { token: payload.access_token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 10 * 60_000 };
    return payload.access_token;
  }
}
