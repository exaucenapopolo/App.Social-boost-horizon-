import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { auth } from "@/lib/firebase";

const TOKEN_KEY = "sbh_firebase_id_token";
const UID_KEY   = "sbh_firebase_uid";

// ── In-memory cache (works on ALL platforms, including web) ──────────────────
// SecureStore is not supported on web and throws UnavailabilityError.
// The in-memory cache ensures the token is always accessible during the session,
// regardless of whether SecureStore works. It survives navigation but not a full
// page reload — that's fine because Firebase Auth handles session persistence on
// its own (via localStorage on web, AsyncStorage on native).
let _tokenCache: string | null = null;
let _uidCache:   string | null = null;

function isSecureStoreAvailable(): boolean {
  return Platform.OS !== "web";
}

// ── saveToken ─────────────────────────────────────────────────────────────────
export async function saveToken(token: string, uid: string): Promise<void> {
  _tokenCache = token;
  _uidCache   = uid;
  if (!isSecureStoreAvailable()) return;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(UID_KEY, uid);
  } catch (e) {
    console.warn("[tokenStore] SecureStore write error:", e);
  }
}

// ── getStoredToken ────────────────────────────────────────────────────────────
export async function getStoredToken(): Promise<string | null> {
  if (_tokenCache) return _tokenCache;
  if (!isSecureStoreAvailable()) return null;
  try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; }
}

// ── getStoredUid ──────────────────────────────────────────────────────────────
export async function getStoredUid(): Promise<string | null> {
  if (_uidCache) return _uidCache;
  if (!isSecureStoreAvailable()) return null;
  try { return await SecureStore.getItemAsync(UID_KEY); } catch { return null; }
}

// ── clearToken ────────────────────────────────────────────────────────────────
export async function clearToken(): Promise<void> {
  _tokenCache = null;
  _uidCache   = null;
  if (!isSecureStoreAvailable()) return;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(UID_KEY);
  } catch {
    // ignore
  }
}

// ── getFreshToken ─────────────────────────────────────────────────────────────
// Priority order:
//   1. Firebase auth.currentUser.getIdToken()  — always fresh, works on web+native
//   2. In-memory cache (_tokenCache)           — works on web+native, session only
//   3. SecureStore                             — native only, persists across restarts
export async function getFreshToken(): Promise<string | null> {
  // 1 — Try Firebase directly (most reliable; always works if user is logged in)
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken(false);
      // Update caches — don't let storage errors propagate
      _tokenCache = token;
      if (isSecureStoreAvailable()) {
        try { await SecureStore.setItemAsync(TOKEN_KEY, token); } catch {}
      }
      return token;
    }
  } catch (e) {
    console.warn("[tokenStore] getIdToken error:", e);
  }

  // 2 — In-memory cache (covers web & the gap between app start and Firebase init)
  if (_tokenCache) return _tokenCache;

  // 3 — SecureStore (native only, survives app restarts)
  if (isSecureStoreAvailable()) {
    try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch {}
  }

  return null;
}
