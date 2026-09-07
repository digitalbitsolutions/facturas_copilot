export interface AccessTokenProvider { getAccessToken(): Promise<string>; }

export class GraphError extends Error {
  readonly status: number;
  readonly responseBody: string;
  constructor(status: number, responseBody: string) {
    super(`Microsoft Graph returned HTTP ${status}`);
    this.name = "GraphError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export class GraphClient {
  private readonly tokenProvider: AccessTokenProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(tokenProvider: AccessTokenProvider, fetchImpl: typeof fetch = globalThis.fetch, baseUrl = "https://graph.microsoft.com/v1.0") {
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.tokenProvider.getAccessToken();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.fetchImpl(`${this.baseUrl}/${path.replace(/^\//, "")}`, {
        ...init,
        headers: { authorization: `Bearer ${token}`, ...init.headers },
      });
      if ((response.status === 429 || response.status >= 500) && attempt === 0) continue;
      if (!response.ok) throw new GraphError(response.status, await response.text());
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    }
    throw new Error("Unreachable Graph retry state");
  }
}
