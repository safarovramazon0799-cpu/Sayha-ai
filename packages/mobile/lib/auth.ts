import { createAuthClient } from "better-auth/react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const isWeb = Platform.OS === "web";
const TOKEN_KEY = "sayha_bearer_token";

const baseURL =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL;

export function getToken(): string {
  try {
    return SecureStore.getItem(TOKEN_KEY) ?? "";
  } catch {
    try { return localStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; }
  }
}

function setToken(token: string) {
  try {
    SecureStore.setItem(TOKEN_KEY, token);
  } catch {
    try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  }
}

async function removeToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  }
}

export const authClient = createAuthClient({
  baseURL,
  basePath: "/api/auth",
  fetchOptions: {
    ...(isWeb ? { credentials: "omit" as const } : {}),
    auth: {
      type: "Bearer",
      token: () => getToken(),
    },
    headers: isWeb ? {} : { "expo-origin": "mobile://" },
  },
});

export function captureToken(ctx: { response: Response }) {
  const token = ctx.response.headers.get("set-auth-token");
  if (token) setToken(token);
}

export async function clearToken() {
  await removeToken();
}
