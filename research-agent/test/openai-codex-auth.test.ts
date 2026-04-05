import assert from "node:assert/strict";
import { test } from "vitest";

import {
  deriveOpenAICodexAccountId,
  resolveOpenAICodexSession,
} from "../src/openai-codex-auth.js";

function makeJwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.signature`;
}

test("deriveOpenAICodexAccountId reads the ChatGPT account id claim from the token", () => {
  const token = makeJwt({
    client_id: "client-test",
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-derived",
    },
  });

  assert.equal(deriveOpenAICodexAccountId(token), "acct-derived");
});

function createRefreshFetch(refreshedToken: string) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(input, "https://auth.openai.com/oauth/token");
    assert.equal(init?.method, "POST");
    assert.deepEqual(init?.headers, {
      "Content-Type": "application/json",
    });
    assert.deepEqual(JSON.parse(String(init?.body)), {
      grant_type: "refresh_token",
      refresh_token: "refresh-token",
      client_id: "client-before-refresh",
    });

    return new Response(
      JSON.stringify({
        access_token: refreshedToken,
        refresh_token: "refresh-token-2",
        expires_in: 300,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  };
}

test("resolveOpenAICodexSession refreshes an expired token and derives account metadata from the refreshed token", async () => {
  const expiredToken = makeJwt({
    client_id: "client-before-refresh",
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-before-refresh",
    },
  });
  const refreshedToken = makeJwt({
    client_id: "client-after-refresh",
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-after-refresh",
    },
  });

  const session = await resolveOpenAICodexSession(
    {
      accessToken: expiredToken,
      refreshToken: "refresh-token",
      expiresAt: 10,
    },
    {
      now: () => 100,
      fetch: createRefreshFetch(refreshedToken),
    },
  );

  assert.equal(session.accessToken, refreshedToken);
  assert.equal(session.accountId, "acct-after-refresh");
  assert.equal(session.refreshToken, "refresh-token-2");
  assert.equal(session.expiresAt, 300100);
});

test("resolveOpenAICodexSession keeps a non-expired token without refreshing", async () => {
  const token = makeJwt({
    client_id: "client-live",
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-live",
    },
  });

  const session = await resolveOpenAICodexSession(
    {
      accessToken: token,
      refreshToken: "refresh-token",
      expiresAt: 120_000,
    },
    {
      now: () => 100,
      fetch: async () => {
        assert.fail("refresh fetch should not be called");
      },
    },
  );

  assert.equal(session.accessToken, token);
  assert.equal(session.accountId, "acct-live");
  assert.equal(session.refreshToken, "refresh-token");
  assert.equal(session.expiresAt, 120_000);
});
