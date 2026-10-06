import { Router, type IRouter } from "express";
import type { Response } from "express";
import { randomBytes } from "crypto";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { asIsoDate, asNumber, asString, asStringOrNull, firestoreGet, firestoreUpdate, getFirebaseAdmin } from "../lib/firebase-admin.js";
import { getFirestore } from "firebase-admin/firestore";

const router: IRouter = Router();

// ── In-memory profile cache — TTL 90 s ────────────────────────────────────
// Prevents repeated Firestore reads when the mobile app fetches /me on every focus.
const profileCache = new Map<string, { data: Record<string, unknown>; expiresAt: number }>();
const PROFILE_CACHE_TTL_MS = 5 * 60_000; // 5 minutes (was 90s — réduit les reads par utilisateur actif)

function getCachedProfile(uid: string): Record<string, unknown> | null {
  const entry = profileCache.get(uid);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { profileCache.delete(uid); return null; }
  return entry.data;
}

function setCachedProfile(uid: string, data: Record<string, unknown>): void {
  profileCache.set(uid, { data, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
}

export function invalidateProfileCache(uid: string): void {
  profileCache.delete(uid);
}

// ── Prune expired entries every 5 min ─────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of profileCache) {
    if (now > entry.expiresAt) profileCache.delete(uid);
  }
}, 5 * 60_000);

function maskApiKey(key: string): string {
  return "sbh_" + "*".repeat(8) + key.slice(-6);
}

// ── GET /api/me ────────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const uid     = req.uid!;
  const noCache = req.query.refresh === "1"; // ?refresh=1 forces a fresh read

  // Serve from cache when possible to save Firestore quota
  if (!noCache) {
    const cached = getCachedProfile(uid);
    if (cached) {
      res.set("X-Cache", "HIT");
      res.json({ success: true, data: cached });
      return;
    }
  }

  const ADMIN_EMAIL = "mcexauofficiel@gmail.com";

  let user = await firestoreGet(`users/${uid}`, req.idToken!);
  if (!user) {
    // If Firestore is throttled and cache has stale data, return it anyway
    const stale = profileCache.get(uid);
    if (stale) {
      res.set("X-Cache", "STALE");
      res.json({ success: true, data: stale.data });
      return;
    }

    // Admin auto-recovery: if profile not found for admin email, search by email or create it
    if (req.email === ADMIN_EMAIL) {
      try {
        getFirebaseAdmin(); // ensure SDK is initialized
        const db = getFirestore();
        // Try to find admin profile by email in case UID changed
        const snap = await db.collection("users").where("email", "==", ADMIN_EMAIL).limit(1).get();
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          // If found under a different document, use it but also update the current UID doc
          user = { id: uid, ...docData };
          // Mirror the profile to the current UID for future lookups
          await db.doc(`users/${uid}`).set({ ...docData, email: ADMIN_EMAIL }, { merge: true });
        } else {
          // No admin profile anywhere — create one with isAdmin flag and 0 balances
          const newAdminProfile = {
            name: "Admin",
            email: ADMIN_EMAIL,
            phone: "",
            balance: 0,
            referralBalance: 0,
            withdrawalBalance: 0,
            totalOrders: 0,
            referralCode: "SBH-ADMIN",
            referredBy: "",
            referralCount: 0,
            referralOrdersUsed: 0,
            country: "cm",
            photoURL: "",
            createdAt: new Date().toISOString(),
            isAdmin: true,
          };
          await db.doc(`users/${uid}`).set(newAdminProfile);
          user = { id: uid, ...newAdminProfile };
        }
      } catch (e) {
        console.error("[me] Admin auto-recovery failed:", e);
        res.status(404).json({ success: false, error: "Profil introuvable" });
        return;
      }
    } else {
      res.status(404).json({ success: false, error: "Profil introuvable" });
      return;
    }
  }

  const isAdmin = req.email === ADMIN_EMAIL;
  const rawApiKey = asStringOrNull(user.apiKey);

  // Anciens profils utilisent "username" au lieu de "name"
  const name = asString(user.name) || asString(user.username);

  // Champs potentiellement manquants chez les anciens utilisateurs
  const missingFields: Record<string, unknown> = {};
  if (!user.name && user.username) missingFields.name = asString(user.username);
  if (user.totalOrders == null) missingFields.totalOrders = 0;
  if (user.withdrawalBalance == null) missingFields.withdrawalBalance = 0;
  if (user.referralBalance == null) missingFields.referralBalance = 0;
  if (user.referralCount == null) missingFields.referralCount = asNumber(user.referralsCount);
  if (user.referralOrdersUsed == null) missingFields.referralOrdersUsed = 0;

  // Migration silencieuse : on comble les champs manquants sans bloquer la réponse
  if (Object.keys(missingFields).length > 0) {
    firestoreUpdate(`users/${uid}`, missingFields, req.idToken!).catch(() => {});
  }

  const profileData = {
    id: uid,
    name,
    email: asString(user.email),
    phone: asStringOrNull(user.phone),
    balance: asNumber(user.balance),
    referralBalance: asNumber(user.referralBalance),
    withdrawalBalance: asNumber(user.withdrawalBalance),
    totalOrders: asNumber(user.totalOrders),
    referralCode: asString(user.referralCode),
    referredBy: asStringOrNull(user.referredBy),
    photoURL: asStringOrNull(user.photoURL),
    joinedAt: asIsoDate(user.createdAt),
    isAdmin,
    country: asStringOrNull(user.country),
    referralCount: asNumber(user.referralCount ?? user.referralsCount),
    referralOrdersUsed: asNumber(user.referralOrdersUsed),
    apiKeyMasked: rawApiKey ? maskApiKey(rawApiKey) : null,
    hasApiKey: !!rawApiKey,
    hasPushToken: !!asStringOrNull(user.expoPushToken),
  };

  setCachedProfile(uid, profileData);
  res.set("X-Cache", "MISS");
  res.json({ success: true, data: profileData });
});

// ── PATCH /api/me ──────────────────────────────────────────────────────────
router.patch("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const allowed = ["name", "phone", "photoURL", "country"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ success: false, error: "Aucun champ à mettre à jour" });
    return;
  }
  const ok = await firestoreUpdate(`users/${req.uid!}`, updates, req.idToken!);
  if (!ok) {
    res.status(500).json({ success: false, error: "Erreur de mise à jour" });
    return;
  }
  invalidateProfileCache(req.uid!); // Invalidate after update
  res.json({ success: true });
});

// ── POST /api/generate-api-key ─────────────────────────────────────────────
router.post("/generate-api-key", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const userDoc = await db.doc(`users/${req.uid}`).get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: "Utilisateur introuvable" });
      return;
    }
    const existing = asStringOrNull(userDoc.data()?.apiKey);
    if (existing) {
      res.json({ success: true, apiKey: existing, isNew: false });
      return;
    }
    const rawKey = "sbh_" + randomBytes(24).toString("hex");
    await db.doc(`users/${req.uid}`).update({ apiKey: rawKey, apiKeyCreatedAt: new Date().toISOString() });
    invalidateProfileCache(req.uid!);
    res.json({ success: true, apiKey: rawKey, isNew: true });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error)?.message ?? "Erreur serveur" });
  }
});

// ── POST /api/revoke-api-key ───────────────────────────────────────────────
router.post("/revoke-api-key", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const { FieldValue } = await import("firebase-admin/firestore");
    await db.doc(`users/${req.uid}`).update({ apiKey: FieldValue.delete(), apiKeyCreatedAt: FieldValue.delete() });
    invalidateProfileCache(req.uid!);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error)?.message ?? "Erreur serveur" });
  }
});

export default router;