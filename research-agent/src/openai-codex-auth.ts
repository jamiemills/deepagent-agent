const OPENAI_CODEX_TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";
const EXPIRY_SKEW_MS = 60_000;

type TokenPayload = {
  client_id?: unknown;
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: unknown;
  };
};

type OpenAICodexSessionInput = {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  expiresAt: number | undefined;
  accountId?: string | undefined;
};

type OpenAICodexSession = {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  expiresAt: number | undefined;
  accountId: string | undefined;
};

type ResolveSessionDeps = {
  now?: () => number;
  fetch?: typeof fetch;
};

type OpenAICodexRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

function decodeTokenPayload(token: string): TokenPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }

    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function deriveOpenAICodexClientId(token: string): string | undefined {
  const payload = decodeTokenPayload(token);
  return typeof payload?.client_id === "string" ? payload.client_id : undefined;
}

export function deriveOpenAICodexAccountId(
  token: string | undefined,
): string | undefined {
  if (!token) {
    return undefined;
  }

  const payload = decodeTokenPayload(token);
  const accountId =
    payload?.["https://api.openai.com/auth"]?.chatgpt_account_id;
  return typeof accountId === "string" ? accountId : undefined;
}

function buildSession(
  _input: OpenAICodexSessionInput,
  accessToken: string | undefined,
  refreshToken: string | undefined,
  expiresAt: number | undefined,
  accountId: string | undefined,
): OpenAICodexSession {
  return {
    accessToken,
    refreshToken,
    expiresAt,
    accountId,
  };
}

function isTokenExpired(
  expiresAt: number | undefined,
  now: number,
): expiresAt is number {
  return typeof expiresAt === "number" && expiresAt <= now + EXPIRY_SKEW_MS;
}

function resolveCurrentAccountId(
  input: OpenAICodexSessionInput,
): string | undefined {
  return input.accountId ?? deriveOpenAICodexAccountId(input.accessToken);
}

function shouldRefreshSession(
  input: OpenAICodexSessionInput,
  currentNow: number,
): input is OpenAICodexSessionInput & {
  accessToken: string;
  refreshToken: string;
} {
  return Boolean(
    input.accessToken &&
      input.refreshToken &&
      isTokenExpired(input.expiresAt, currentNow),
  );
}

function buildCurrentSession(
  input: OpenAICodexSessionInput,
  accountId: string | undefined,
): OpenAICodexSession {
  return buildSession(
    input,
    input.accessToken,
    input.refreshToken,
    input.expiresAt,
    accountId,
  );
}

function buildRefreshedSession(args: {
  input: OpenAICodexSessionInput;
  refreshed: OpenAICodexRefreshResponse & { access_token: string };
  currentNow: number;
  fallbackAccountId: string | undefined;
}): OpenAICodexSession {
  return buildSession(
    args.input,
    args.refreshed.access_token,
    args.refreshed.refresh_token ?? args.input.refreshToken,
    typeof args.refreshed.expires_in === "number"
      ? args.currentNow + args.refreshed.expires_in * 1000
      : args.input.expiresAt,
    args.input.accountId ??
      deriveOpenAICodexAccountId(args.refreshed.access_token) ??
      args.fallbackAccountId,
  );
}

async function refreshOpenAICodexAccessToken(args: {
  accessToken: string;
  refreshToken: string;
  fetchFn: typeof fetch;
}): Promise<OpenAICodexRefreshResponse> {
  const clientId = deriveOpenAICodexClientId(args.accessToken);
  if (!clientId) {
    throw new Error(
      "OpenAI Codex OAuth token refresh requires a client_id claim in the access token.",
    );
  }

  const response = await args.fetchFn(OPENAI_CODEX_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: args.refreshToken,
      client_id: clientId,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to refresh OpenAI Codex OAuth token: HTTP ${response.status}${body ? ` ${body}` : ""}`,
    );
  }

  return (await response.json()) as OpenAICodexRefreshResponse;
}

export async function resolveOpenAICodexSession(
  input: OpenAICodexSessionInput,
  deps: ResolveSessionDeps = {},
): Promise<OpenAICodexSession> {
  const now = deps.now ?? Date.now;
  const fetchFn = deps.fetch ?? fetch;

  if (!input.accessToken) {
    return buildCurrentSession(input, input.accountId);
  }

  const currentAccountId = resolveCurrentAccountId(input);
  const currentNow = now();

  if (!shouldRefreshSession(input, currentNow)) {
    return buildCurrentSession(input, currentAccountId);
  }

  const refreshed = await refreshOpenAICodexAccessToken({
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    fetchFn,
  });

  if (!refreshed.access_token) {
    throw new Error(
      "OpenAI Codex OAuth refresh response did not include an access_token.",
    );
  }

  return buildRefreshedSession({
    input,
    refreshed: refreshed as OpenAICodexRefreshResponse & {
      access_token: string;
    },
    currentNow,
    fallbackAccountId: currentAccountId,
  });
}
