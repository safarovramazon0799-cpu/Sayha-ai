import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const TOKEN_KEY = "sayha_bearer_token";

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  plugins: [usernameClient()],
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: () => localStorage.getItem(TOKEN_KEY) ?? "",
    },
  },
});

export function captureToken(ctx: { response: Response }) {
  const token = ctx.response.headers.get("set-auth-token");
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}
