import { Router } from "express";
import type { Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getFirestore } from "firebase-admin/firestore";
import {
  firestoreQuery,
  firestoreList,
  firestoreGet,
  firestoreUpdate,
  asIsoDate,
  asNumber,
  asString,
  asStringOrNull,
  getFirebaseAdmin,
} from "../lib/firebase-admin.js";

const router: ReturnType<typeof Router> = Router();

let leaderboardCache: { data: unknown[]; ts: number } | null = null;
const LEADERBOARD_CACHE_MS = 30 * 60 * 1000;

router.get("/referrals", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await firestoreGet(`users/${req.uid}`, req.idToken!);
  if (!user) {
    res.status(404).json({ success: false, error: "Profil introuvable" });
    return;
  }
  const myCode = asString(user.referralCode);
  if (!myCode) {
    res.json({ success: true, data: { referrals: [], totalEarned: asNumber(user.referralBalance) } });
    return;
  }

  const referred = await firestoreQuery(
    "users",
    [{ field: "referredBy", value: myCode }],
    req.idToken!
  ).catch(() => []);

  const parentActivities = await firestoreQuery(
    "activites",
    [{ field: "userId", value: req.uid! }],
    req.idToken!
  ).catch(() => []);

  const commissionByFilleul: Record<string, number> = {};
  for (const act of parentActivities as any[]) {
    if (asString(act.type) === "parrainage" && act.fromUserId) {
      const fid = asString(act.fromUserId);
      commissionByFilleul[fid] = (commissionByFilleul[fid] ?? 0) + asNumber(act.amount);
    }
  }

  const list = (referred as any[]).map((u: any) => ({
    id: u.id,
    name: asString(u.name) || asString(u.username) || "Utilisateur",
    photoURL: asStringOrNull(u.photoURL),
    totalOrders: asNumber(u.totalOrders),
    joinedAt: asIsoDate(u.createdAt),
    country: asStringOrNull(u.country),
    commissionEarned: commissionByFilleul[u.id] ?? 0,
  }));

  if (asNumber(user.referralCount) !== list.length) {
    firestoreUpdate(`users/${req.uid}`, { referralCount: list.length }, req.idToken!).catch(() => {});
  }

  res.json({
    success: true,
    data: {
      referrals: list,
      count: list.length,
      totalEarned: asNumber(user.referralBalance),
    },
  });
});

router.get("/leaderboard", requireAuth, async (req: AuthRequest, res: Response) => {
  if (leaderboardCache && Date.now() - leaderboardCache.ts < LEADERBOARD_CACHE_MS) {
    res.json({ success: true, data: leaderboardCache.data });
    return;
  }
  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const snap = await db.collection("users").get();
    const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const codeToCount: Record<string, number> = {};
    for (const u of allUsers as any[]) {
      const code = asString(u.referredBy);
      if (code) codeToCount[code] = (codeToCount[code] ?? 0) + 1;
    }

    const ranked = (allUsers as any[])
      .map((u: any) => {
        const realCount = codeToCount[asString(u.referralCode)] ?? asNumber(u.referralCount);
        const rawName = asString(u.name) || asString(u.username) || asString(u.displayName) || asString(u.email)?.split("@")[0] || "Utilisateur";
        return {
          id: u.id,
          name: rawName,
          photoURL: asStringOrNull(u.photoURL),
          referralCount: realCount,
          country: asStringOrNull(u.country),
        };
      })
      .filter((u: any) => u.referralCount >= 1)
      .sort((a: any, b: any) => b.referralCount - a.referralCount)
      .slice(0, 20);

    leaderboardCache = { data: ranked, ts: Date.now() };
    res.json({ success: true, data: ranked });
  } catch (err: any) {
    console.error("[leaderboard]", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

export default router;
