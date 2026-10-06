import { Router } from "express";
import type { Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getFirebaseAdmin } from "../lib/firebase-admin.js";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { sendExpoPush, getUserPushToken } from "../lib/push.js";
import { enqueuePendingCredit, getPendingCount } from "../lib/pendingCredits.js";

const router = Router();

const ADMIN_EMAIL = "mcexauofficiel@gmail.com";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Expo accepts up to 100 messages per batch request
const EXPO_BATCH_SIZE = 100;
// Firestore batch writes: max 500 ops per commit
const FIRESTORE_BATCH_SIZE = 400;

function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (req.email !== ADMIN_EMAIL) {
    res.status(403).json({ success: false, error: "Accès administrateur refusé" });
    return false;
  }
  return true;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asIsoDate(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "object" && typeof (v as any).toDate === "function") {
    return (v as any).toDate().toISOString();
  }
  if (typeof v === "object") {
    const s = (v as any)._seconds ?? (v as any).seconds;
    if (typeof s === "number") return new Date(s * 1000).toISOString();
  }
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

/**
 * Send push notifications in batch using Expo's bulk endpoint.
 * Each call sends up to EXPO_BATCH_SIZE messages in one HTTP request,
 * which avoids rate-limiting issues from hundreds of individual requests.
 */
async function sendExpoBatch(
  messages: Array<{ to: string; title: string; body: string; data?: Record<string, unknown>; sound: string; channelId: string; imageUrl?: string }>
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const chunk = messages.slice(i, i + EXPO_BATCH_SIZE);
    try {
      const r = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        const json = await r.json() as { data?: Array<{ status: string }> };
        if (json.data) {
          for (const item of json.data) {
            if (item.status === "ok") sent++;
            else failed++;
          }
        } else {
          sent += chunk.length;
        }
      } else {
        failed += chunk.length;
        console.warn("[admin] Expo batch error:", r.status, await r.text().catch(() => ""));
      }
    } catch (e) {
      failed += chunk.length;
      console.warn("[admin] Expo batch fetch error:", e);
    }
  }

  return { sent, failed };
}

// Cache 30 min pour /admin/users — partagé avec /admin/stats pour zéro lecture double
let usersListCache: { data: UserRow[]; ts: number } | null = null;
const USERS_CACHE_MS = 30 * 60 * 1000; // 30 min

interface UserRow {
  id: string; name: string; email: string; balance: number;
  totalOrders: number; isReseller: boolean; country: string;
  referralCode: string; hasPushToken: boolean; createdAt: string;
}

// GET /api/admin/users?search=&sort=balance|name|recent&limit=50
router.get("/admin/users", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const search = asString(req.query.search).toLowerCase().trim();
  const sort   = asString(req.query.sort) || "balance";
  // Limite élevée par défaut pour le centre de notifications — toute la base est déjà en cache mémoire
  const limit  = Math.min(Number(req.query.limit) || 5000, 10000);

  try {
    // Reuse cached list to avoid re-reading Firestore
    if (!usersListCache || Date.now() - usersListCache.ts >= USERS_CACHE_MS) {
      getFirebaseAdmin();
      const db = getFirestore();
      const snap = await db.collection("users").get(); // Sans limite — cache 30 min
      const rows: UserRow[] = snap.docs.map((d) => {
        const data = d.data();
        const name = asString(data.name) || asString((data as any).username) || asString(data.displayName) || asString(data.email)?.split("@")[0] || "Utilisateur";
        return {
          id: d.id, name, email: asString(data.email),
          balance: Number(data.balance ?? 0),
          totalOrders: Number(data.totalOrders ?? 0),
          isReseller: !!data.isReseller,
          country: asString(data.country ?? data.pays ?? ""),
          referralCode: asString(data.referralCode ?? ""),
          hasPushToken: !!(data.expoPushToken),
          createdAt: asIsoDate(data.createdAt) ?? "",
        };
      });
      usersListCache = { data: rows, ts: Date.now() };
    }

    let list = [...usersListCache.data];

    // In-memory search (0 extra Firestore reads)
    if (search) {
      list = list.filter(u =>
        u.name.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        u.id.toLowerCase().includes(search) ||
        u.country.toLowerCase().includes(search)
      );
    }

    // Sort
    if (sort === "name")    list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "recent") list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    else                        list.sort((a, b) => b.balance - a.balance); // default: balance

    const total = list.length;
    const totalWithToken = list.filter(u => u.hasPushToken).length;
    list = list.slice(0, limit);

    res.json({ success: true, data: list, users: list, total, totalWithToken, cached: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

// GET /api/admin/user/:id — détail d'un utilisateur (1 lecture Firestore)
router.get("/admin/user/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const doc = await db.doc(`users/${req.params.id}`).get();
    if (!doc.exists) { res.status(404).json({ success: false, error: "Utilisateur introuvable" }); return; }
    const data = doc.data()!;
    res.json({ success: true, user: {
      id: doc.id,
      name: asString(data.name) || asString(data.email)?.split("@")[0] || "—",
      email: asString(data.email),
      balance: Number(data.balance ?? 0),
      totalOrders: Number(data.totalOrders ?? 0),
      isReseller: !!data.isReseller,
      country: asString(data.country ?? data.pays ?? ""),
      referralCode: asString(data.referralCode ?? ""),
      createdAt: asIsoDate(data.createdAt) ?? "",
      phone: asString(data.phone ?? ""),
    }});
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

// PATCH /api/admin/user/:id/balance — modifier le solde (add / subtract / set)
// Body: { operation: "add"|"subtract"|"set", amount, reason? }
router.patch("/admin/user/:id/balance", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { operation, amount: rawAmount, reason } = req.body ?? {};
  const amount = Number(rawAmount ?? 0);
  if (!["add", "subtract", "set"].includes(operation) || amount < 0) {
    res.status(400).json({ success: false, error: "operation (add|subtract|set) et amount >= 0 requis" });
    return;
  }

  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const userRef = db.doc(`users/${req.params.id}`);

    let newBalance = 0;
    await db.runTransaction(async (t) => {
      const snap = await t.get(userRef);
      if (!snap.exists) throw new Error("Utilisateur introuvable");
      const current = Number(snap.data()?.balance ?? 0);
      newBalance = operation === "add" ? current + amount
                 : operation === "subtract" ? Math.max(0, current - amount)
                 : amount;
      t.update(userRef, { balance: newBalance });
      t.set(db.collection("activites").doc(), {
        userId: req.params.id, type: operation === "subtract" ? "retrait" : "depot",
        label: reason ?? `Modification admin (${operation}) — ${amount.toLocaleString("fr-FR")} FCFA`,
        amount: operation === "subtract" ? -amount : amount,
        status: "confirmed", createdAt: new Date().toISOString(),
      });
    });

    // Invalide cache users
    usersListCache = null;
    console.log(`[admin] ✅ Balance update: ${req.params.id} → op=${operation} amount=${amount} newBal=${newBalance}`);
    res.json({ success: true, newBalance, operation, amount });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

// Cache 30 min pour /admin/withdrawals-list
let wdListCache: { data: unknown[]; ts: number } | null = null;
const WD_CACHE_MS = 30 * 60 * 1000; // 30 min

// GET /api/admin/withdrawals-list
router.get("/admin/withdrawals-list", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  if (wdListCache && Date.now() - wdListCache.ts < WD_CACHE_MS) {
    res.json({ success: true, data: wdListCache.data, cached: true }); return;
  }

  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const snap = await db.collection("withdrawals").limit(100).get();
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    wdListCache = { data, ts: Date.now() };
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

// PATCH /api/admin/withdrawal/:id — confirmer ou rejeter un retrait
// Body: { action: "confirm"|"reject" }
router.patch("/admin/withdrawal/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { action } = req.body ?? {};
  if (!["confirm", "reject"].includes(action)) {
    res.status(400).json({ success: false, error: "action (confirm|reject) requis" }); return;
  }

  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const wdRef = db.doc(`withdrawals/${req.params.id}`);
    const wdDoc = await wdRef.get();
    if (!wdDoc.exists) { res.status(404).json({ success: false, error: "Retrait introuvable" }); return; }

    const status = action === "confirm" ? "confirmed" : "rejected";
    await wdRef.update({ status, processedAt: new Date().toISOString(), processedBy: "admin" });

    // Invalide cache
    wdListCache = null;
    statsCache = null;
    console.log(`[admin] Retrait ${req.params.id} → ${status}`);
    res.json({ success: true, status });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

// POST /api/admin/notifications/broadcast
router.post("/admin/notifications/broadcast", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { title, message, target, userId, screen, externalUrl, imageUrl, saveToInbox } = req.body ?? {};

  if (!title || !message) {
    res.status(400).json({ success: false, error: "Titre et message requis" });
    return;
  }
  if (!["all", "user"].includes(target)) {
    res.status(400).json({ success: false, error: "Cible invalide (all | user)" });
    return;
  }
  if (target === "user" && !userId) {
    res.status(400).json({ success: false, error: "userId requis pour cible = user" });
    return;
  }

  // Build push data: externalUrl takes priority over screen (opens browser)
  const pushData: Record<string, unknown> = {};
  if (externalUrl) {
    pushData.externalUrl = String(externalUrl);
  } else if (screen) {
    pushData.screen = screen;
  }
  const cleanImageUrl = imageUrl ? String(imageUrl) : undefined;

  try {
    getFirebaseAdmin();
    const db = getFirestore();

    // ── Single user ────────────────────────────────────────────────────────────
    if (target === "user") {
      const userDoc = await db.doc(`users/${userId}`).get();
      const token = userDoc.data()?.expoPushToken as string | undefined;

      if (saveToInbox) {
        // Write activity to inbox
        await db.collection("activites").add({
          userId,
          type:      "info",
          title,
          label:     message,
          amount:    0,
          status:    "confirmed",
          createdAt: new Date().toISOString(),
          ...(screen ? { screen } : {}),
        });
      }

      // Send push (fire and forget if no token)
      await sendExpoPush(token, title, message, pushData, "default", cleanImageUrl);

      console.log(`[admin] Notification → uid=${userId} (saveToInbox=${saveToInbox})`);
      res.json({ success: true, sent: 1, failed: 0 });
      return;
    }

    // ── Broadcast to all users ─────────────────────────────────────────────────
    // Lecture de TOUS les utilisateurs — pas de limite pour couvrir tous les tokens push
    const snap = await db.collection("users").get();
    const docs = snap.docs;

    // Collect valid push tokens
    const messages: Array<{ to: string; title: string; body: string; data: Record<string, unknown>; sound: string; channelId: string; imageUrl?: string; uid: string }> = [];
    for (const d of docs) {
      const token = d.data()?.expoPushToken as string | undefined;
      if (token && token.startsWith("ExponentPushToken")) {
        const msg: (typeof messages)[number] = { to: token, title, body: message, data: pushData, sound: "default", channelId: "default", uid: d.id };
        if (cleanImageUrl) msg.imageUrl = cleanImageUrl;
        messages.push(msg);
      }
    }

    const withoutToken = docs.length - messages.length;

    // Inbox activity extra fields
    const inboxExtra: Record<string, unknown> = {};
    if (externalUrl) inboxExtra.externalUrl = String(externalUrl);
    else if (screen) inboxExtra.screen = screen;
    if (cleanImageUrl) inboxExtra.imageUrl = cleanImageUrl;

    // If saveToInbox: write all activites using Firestore batched writes (400 per commit)
    if (saveToInbox) {
      const now = new Date().toISOString();
      for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_SIZE) {
        const chunk = docs.slice(i, i + FIRESTORE_BATCH_SIZE);
        const batch = db.batch();
        for (const d of chunk) {
          batch.set(db.collection("activites").doc(), {
            userId:    d.id,
            type:      "info",
            title,
            label:     message,
            amount:    0,
            status:    "confirmed",
            createdAt: now,
            ...inboxExtra,
          });
        }
        await batch.commit();
      }
      console.log(`[admin] ${docs.length} activités écrites en batch Firestore`);
    }

    // Send push notifications in batch via Expo bulk endpoint
    const { sent, failed: pushFailed } = await sendExpoBatch(
      messages.map(({ uid: _uid, ...m }) => m)
    );

    const failed = withoutToken + pushFailed;
    console.log(`[admin] Broadcast par admin=${req.uid}: ${sent} push envoyés, ${failed} sans token/erreur`);
    res.json({ success: true, sent, failed });

  } catch (e: any) {
    console.error("[admin] broadcast error:", e?.message);
    res.status(500).json({ success: false, error: e?.message });
  }
});

// ── GET /api/admin/stats ───────────────────────────────────────────────────
// Tableau de bord admin — quota-aware : lit uniquement les compteurs pré-calculés.
// ⚠️ Cache 30 min — réduit drastiquement les lectures Firestore.
//    /admin/stats partage le cache users avec /admin/users (zéro lecture double).
let statsCache: { data: Record<string, unknown>; ts: number } | null = null;
const STATS_CACHE_MS = 30 * 60 * 1000; // 30 min

router.get("/admin/stats", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  if (statsCache && Date.now() - statsCache.ts < STATS_CACHE_MS) {
    res.json({ success: true, data: statsCache.data, cached: true });
    return;
  }

  try {
    getFirebaseAdmin();
    const db = getFirestore();

    // ── Quota guard: users lus UNIQUEMENT si cache expiré (évite 200 lectures double) ──
    const usersAlreadyCached = usersListCache && Date.now() - usersListCache.ts < USERS_CACHE_MS;
    const usersPromise = usersAlreadyCached
      ? Promise.resolve(null)
      : db.collection("users").get(); // Sans limite — cache 30 min

    // Lire en parallèle (commandes limitées à 100, total vient de meta/counters)
    const [
      usersResult, ordersSnap, rechargSnap,
      withdrawSnap, countersSnap,
    ] = await Promise.allSettled([
      usersPromise,
      db.collection("commandes").limit(100).get(),
      db.collection("rechargements").where("status", "==", "confirmed").limit(100).get(),
      db.collection("withdrawals").limit(100).get(),
      db.doc("meta/counters").get(),
    ]);

    if (ordersSnap.status === "rejected")   console.error("[admin/stats] commandes query failed:", (ordersSnap as PromiseRejectedResult).reason?.message);
    if (rechargSnap.status === "rejected")  console.error("[admin/stats] rechargements query failed:", (rechargSnap as PromiseRejectedResult).reason?.message);
    if (withdrawSnap.status === "rejected") console.error("[admin/stats] withdrawals query failed:", (withdrawSnap as PromiseRejectedResult).reason?.message);
    if (usersResult.status === "rejected")  console.error("[admin/stats] users query failed:", (usersResult as PromiseRejectedResult).reason?.message);

    // ── Compteurs pré-calculés (si doc meta/counters existe) ──
    const counters = (countersSnap.status === "fulfilled" && countersSnap.value.exists)
      ? (countersSnap.value.data() ?? {})
      : {};

    const now   = Date.now();
    const msDay = 86_400_000;

    // ── Utilisateurs — met à jour usersListCache si on vient de lire Firestore ──
    if (usersResult.status === "fulfilled" && usersResult.value !== null) {
      const freshDocs = (usersResult.value as import("firebase-admin/firestore").QuerySnapshot).docs;
      const rows: UserRow[] = freshDocs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: asString(data.name) || asString((data as Record<string,unknown>).username as string) || asString(data.displayName) || asString(data.email)?.split("@")[0] || "Utilisateur",
          email: asString(data.email),
          balance: Number(data.balance ?? 0),
          totalOrders: Number(data.totalOrders ?? 0),
          isReseller: !!data.isReseller,
          country: asString(data.country ?? data.pays ?? ""),
          referralCode: asString(data.referralCode ?? ""),
          hasPushToken: !!(data.expoPushToken),
          createdAt: asIsoDate(data.createdAt) ?? "",
        };
      });
      usersListCache = { data: rows, ts: Date.now() };
    }

    const cachedRows = usersListCache?.data ?? [];
    const totalUsers = Number(counters.totalUsers ?? cachedRows.length);
    let totalBalances   = 0;
    let usersWithBalance = 0;
    let newUsersToday   = 0, newUsersYesterday = 0, newUsersWeek = 0;
    const recentUsers: Array<Record<string, unknown>> = [];
    for (const row of cachedRows) {
      const bal = row.balance;
      totalBalances += bal;
      if (bal > 0) usersWithBalance++;
      const created = new Date(row.createdAt).getTime();
      if (!isNaN(created)) {
        const age = now - created;
        if (age < msDay)                    newUsersToday++;
        if (age >= msDay && age < 2*msDay) newUsersYesterday++;
        if (age < 7 * msDay)               newUsersWeek++;
      }
      recentUsers.push({
        id: row.id, name: row.name, email: row.email, balance: bal,
        totalOrders: row.totalOrders, isReseller: row.isReseller,
        country: row.country, createdAt: row.createdAt,
      });
    }
    recentUsers.sort((a, b) => Number(b.balance) - Number(a.balance));

    // ── Commandes ──
    const orders = ordersSnap.status === "fulfilled" ? ordersSnap.value.docs : [];
    const totalOrders    = Number(counters.totalOrders ?? orders.length);
    const ordersByType: Record<string, number> = { standard: 0, automatique: 0, avancée: 0, autre: 0 };
    const ordersByStatus: Record<string, number> = {};
    let todayOrders     = 0;
    let yesterdayOrders = 0;
    let weekOrders      = 0;

    for (const d of orders) {
      const data   = d.data();
      const type   = (asString(data.type) || "standard").toLowerCase();
      const status = asString(data.status) || "pending";
      const key    = ["standard","automatique","avancée"].includes(type) ? type : "autre";
      ordersByType[key]   = (ordersByType[key] ?? 0) + 1;
      ordersByStatus[status] = (ordersByStatus[status] ?? 0) + 1;
      const created = new Date(asIsoDate(data.createdAt) ?? "").getTime();
      if (!isNaN(created)) {
        const age = now - created;
        if (age < msDay)       todayOrders++;
        if (age >= msDay && age < 2 * msDay) yesterdayOrders++;
        if (age < 7 * msDay)   weekOrders++;
      }
    }

    // ── Rechargements ──
    const rechs      = rechargSnap.status === "fulfilled" ? rechargSnap.value.docs : [];
    let totalRecharged = 0, rechargesToday = 0, rechargesYesterday = 0, rechargesWeek = 0;
    let rechargesTodayAmount = 0, rechargesYesterdayAmount = 0, rechargesWeekAmount = 0;
    for (const d of rechs) {
      const data = d.data();
      const amt = Number(data.amount ?? 0);
      totalRecharged += amt;
      const created = new Date(asIsoDate(data.createdAt) ?? "").getTime();
      if (!isNaN(created)) {
        const age = now - created;
        if (age < msDay)       { rechargesToday++;     rechargesTodayAmount += amt; }
        if (age >= msDay && age < 2 * msDay) { rechargesYesterday++; rechargesYesterdayAmount += amt; }
        if (age < 7 * msDay)   { rechargesWeek++;      rechargesWeekAmount += amt; }
      }
    }
    const rechCount  = Number(counters.totalRechargements ?? rechs.length);

    // ── Revendeurs — calculés depuis le cache users (0 read supplémentaire) ──
    const resellersFromUsers = cachedRows.filter(r => r.isReseller).length;
    const totalResellers = Number(counters.totalResellers ?? resellersFromUsers);

    // ── Parrainage — depuis meta/counters uniquement (0 read supplémentaire) ──
    const totalReferrals = Number(counters.totalReferrals ?? 0);

    // ── Retraits ──
    const wdDocs = withdrawSnap.status === "fulfilled" ? withdrawSnap.value.docs : [];
    const pendingWithdrawals = wdDocs.filter(d => d.data().status === "pending");
    const totalWithdrawn = wdDocs
      .filter(d => d.data().status === "confirmed")
      .reduce((s, d) => s + Number(d.data().amount ?? 0), 0);
    const recentWithdrawals = pendingWithdrawals.map(d => ({
      id: d.id, ...d.data(),
    }));

    const data: Record<string, unknown> = {
      users: {
        total: totalUsers, recentCount: cachedRows.length, usersWithBalance, totalBalances,
        newToday: newUsersToday, newYesterday: newUsersYesterday, newWeek: newUsersWeek,
      },
      orders: {
        total: totalOrders, today: todayOrders, yesterday: yesterdayOrders, week: weekOrders,
        byType: ordersByType, byStatus: ordersByStatus,
      },
      revenue: {
        totalRecharged, rechCount,
        todayCount: rechargesToday, todayAmount: rechargesTodayAmount,
        yesterdayCount: rechargesYesterday, yesterdayAmount: rechargesYesterdayAmount,
        weekCount: rechargesWeek, weekAmount: rechargesWeekAmount,
      },
      resellers:   { total: totalResellers },
      referrals:   { total: totalReferrals },
      withdrawals: { pendingCount: pendingWithdrawals.length, totalWithdrawn, recentPending: recentWithdrawals.slice(0, 10) },
      topUsers:    recentUsers.slice(0, 5),   // top 5 by balance
      recentUsers: recentUsers.slice(0, 30),  // for users section
      pendingCredits: getPendingCount(),
      updatedAt: new Date().toISOString(),
    };

    statsCache = { data, ts: Date.now() };
    res.json({ success: true, data });

  } catch (e: any) {
    console.error("[admin/stats] error:", e?.message);
    res.status(500).json({ success: false, error: e?.message });
  }
});

// ── POST /api/admin/stats/invalidate ──────────────────────────────────────
router.post("/admin/stats/invalidate", requireAuth, (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  statsCache = null;
  usersListCache = null;
  res.json({ success: true, message: "Cache stats + users invalidé" });
});

// ── GET /api/admin/pending-credits ────────────────────────────────────────
// Voir les crédits en file d'attente (bloqués par quota Firestore)
router.get("/admin/pending-credits", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  res.json({ success: true, pendingCount: getPendingCount() });
});

// ── POST /api/admin/credit-user ───────────────────────────────────────────
// Créditer manuellement un utilisateur (cas d'urgence quota / paiement bloqué)
// Body: { userId, amount, reason?, transId? }
router.post("/admin/credit-user", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { userId, amount: rawAmount, reason, transId } = req.body ?? {};
  const amount = Number(rawAmount ?? 0);

  if (!userId || amount <= 0) {
    res.status(400).json({ success: false, error: "userId et amount requis" });
    return;
  }

  // Générer un transId unique si non fourni
  const creditId = transId ? `admin_${transId}` : `admin_${Date.now()}_${userId.slice(0, 6)}`;
  const label    = reason ?? `Crédit manuel admin — ${amount.toLocaleString("fr-FR")} FCFA`;

  try {
    getFirebaseAdmin();
    const db = getFirestore();

    const userRef = db.doc(`users/${userId}`);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: "Utilisateur introuvable" });
      return;
    }

    const userName = String(userDoc.data()?.name ?? "").split(" ")[0] || "";

    // Idempotency: check if already credited
    const creditRef = db.collection("rechargements").doc(creditId);
    const existing  = await creditRef.get();
    if (existing.exists) {
      res.json({ success: false, message: "Déjà crédité (idempotent)" });
      return;
    }

    // Atomic credit
    await db.runTransaction(async (t) => {
      const freshUser   = await t.get(userRef);
      const currentBal  = Number(freshUser.data()?.balance ?? 0);
      t.update(userRef, { balance: currentBal + amount });
      t.set(creditRef, {
        amount, method: "Crédit admin",
        transId: creditId, status: "confirmed",
        userId, createdAt: new Date().toISOString(),
        creditedBy: "admin", label,
      });
      t.set(db.collection("activites").doc(), {
        userId, type: "depot",
        label, amount, status: "confirmed",
        createdAt: new Date().toISOString(),
      });
    });

    console.log(`[admin] ✅ Crédit manuel: ${amount} FCFA → ${userId} (${creditId})`);

    // Push notification to user
    const greeting = userName ? `, ${userName}` : "";
    getUserPushToken(userId).then((token) =>
      sendExpoPush(
        token,
        "💰 Solde crédité !",
        `${amount.toLocaleString("fr-FR")} FCFA ont été ajoutés à votre solde${greeting}. Désolé pour le délai.`,
        { screen: "wallet" },
        "wallet"
      )
    ).catch(() => {});

    res.json({ success: true, credited: amount, userId, creditId });

  } catch (e: unknown) {
    const errMsg  = e instanceof Error ? e.message : String(e);
    const isQuota = errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("Quota exceeded");

    if (isQuota) {
      // Mettre en file d'attente — sera traité dès que le quota est reset
      enqueuePendingCredit({
        id: creditId, userId, amount,
        method: "Crédit admin (quota)", transId: creditId,
      });
      console.warn(`[admin] ⚠️ Quota Firestore — crédit ${amount} FCFA mis en file pour ${userId}`);
      res.json({
        success: true,
        queued: true,
        message: "Quota Firestore dépassé — crédit mis en file, sera traité dans les 30s après reset du quota (minuit UTC)",
      });
    } else {
      console.error("[admin] credit-user error:", errMsg);
      res.status(500).json({ success: false, error: errMsg });
    }
  }
});

// ── POST /api/admin/credit-by-email ───────────────────────────────────────
// Cherche l'UID d'un utilisateur par email (Firebase Auth) et enqueue un crédit.
// Utilise Firebase Auth, PAS Firestore → fonctionne même si quota Firestore est épuisé.
router.post("/admin/credit-by-email", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { email, amount, transId, reason } = req.body as {
    email?: string; amount?: number; transId?: string; reason?: string;
  };

  if (!email || !amount || amount <= 0) {
    res.status(400).json({ success: false, error: "email et amount requis" });
    return;
  }

  try {
    const { getAuth } = await import("firebase-admin/auth");
    getFirebaseAdmin();

    // Chercher l'UID via Firebase Auth (ne consomme pas de quota Firestore)
    let userRecord: import("firebase-admin/auth").UserRecord;
    try {
      userRecord = await getAuth().getUserByEmail(email.trim());
    } catch {
      res.status(404).json({ success: false, error: `Aucun utilisateur trouvé pour l'email: ${email}` });
      return;
    }

    const userId = userRecord.uid;
    const creditId = transId
      ? `fapshi_${transId}`
      : `manual_email_${userId}_${Date.now()}`;

    enqueuePendingCredit({
      id:     creditId,
      userId,
      amount,
      method: reason ?? "Fapshi Mobile Money (crédit manuel par email)",
      transId: transId ?? creditId,
      phone:  "",
    });

    console.log(`[admin] credit-by-email: ${email} (${userId}) → ${amount} FCFA enqueued (id: ${creditId})`);

    res.json({
      success: true,
      userId,
      email: userRecord.email,
      displayName: userRecord.displayName ?? "(sans nom)",
      amount,
      creditId,
      message: `${amount} FCFA enqueued pour ${email}. Sera crédité dès que Firestore est disponible.`,
    });

  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[admin] credit-by-email error:", errMsg);
    res.status(500).json({ success: false, error: errMsg });
  }
});

// ── POST /api/admin/audit-payments ────────────────────────────────────────
// Scanne tous les paiements des 24 dernières heures non crédités.
// Vérifie le statut réel chez Fapshi pour chaque paiement en attente.
// Enqueue automatiquement ceux qui sont SUCCESSFUL mais non crédités.
// ⚠️ Fonctionne même si Firestore quota est dépassé (les crédits sont mis en file)
router.post("/admin/audit-payments", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const FAPSHI_BASE   = process.env.FAPSHI_BASE_URL ?? "https://live.fapshi.com";
  const FAPSHI_USER   = process.env.FAPSHI_API_USER   ?? "";
  const FAPSHI_SECRET = process.env.FAPSHI_SECRET_KEY ?? "";

  const report: {
    found: number;
    alreadyCredited: number;
    queued: number;
    failed: number;
    details: Array<{ transId: string; userId: string; amount: number; fapshiStatus: string; action: string }>;
  } = { found: 0, alreadyCredited: 0, queued: 0, failed: 0, details: [] };

  try {
    getFirebaseAdmin();
    const db  = getFirestore();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // ── 1. Requête tous les rechargements pending des 24 dernières heures ──
    let pendingDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    try {
      const snap = await db.collection("rechargements")
        .where("status", "==", "pending")
        .limit(100)
        .get();
      pendingDocs = snap.docs;
    } catch (e: unknown) {
      console.warn("[audit] Impossible de lire rechargements (quota?):", (e as Error).message);
    }

    // ── 2. Requête activites pending (depot) des 24 dernières heures ──
    let actPendingDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    try {
      const snap = await db.collection("activites")
        .where("status", "==", "pending")
        .where("type", "==", "depot")
        .limit(100)
        .get();
      actPendingDocs = snap.docs.filter(d => {
        const created = asIsoDate(d.data().createdAt) ?? "";
        return created >= since24h;
      });
    } catch (e: unknown) {
      console.warn("[audit] Impossible de lire activites (quota?):", (e as Error).message);
    }

    // ── 3. Regrouper par transId pour éviter les doublons ──
    interface PendingEntry {
      transId: string; userId: string; amount: number;
      phone: string; docId: string; source: string;
    }
    const pendingMap = new Map<string, PendingEntry>();

    for (const doc of pendingDocs) {
      const d = doc.data();
      const transId = asString(d.transId ?? d.transactionId);
      if (!transId) continue;
      if (pendingMap.has(transId)) continue;
      pendingMap.set(transId, {
        transId, userId: asString(d.userId),
        amount: Number(d.amount ?? 0),
        phone: asString(d.phone ?? ""),
        docId: doc.id, source: "rechargements",
      });
    }
    for (const doc of actPendingDocs) {
      const d = doc.data();
      const transId = asString(d.transId);
      if (!transId || pendingMap.has(transId)) continue;
      pendingMap.set(transId, {
        transId, userId: asString(d.userId),
        amount: Number(d.amount ?? 0),
        phone: "", docId: doc.id, source: "activites",
      });
    }

    report.found = pendingMap.size;

    if (pendingMap.size === 0) {
      res.json({ success: true, report, message: "Aucun paiement en attente trouvé" });
      return;
    }

    // ── 4. Pour chaque paiement en attente → vérifier chez Fapshi ──
    for (const entry of pendingMap.values()) {
      const { transId, userId, amount, phone } = entry;

      // Vérifier si déjà crédité dans rechargements (via fapshi_ prefix)
      let alreadyCredited = false;
      try {
        const confirmedRef = db.collection("rechargements").doc(`fapshi_${transId}`);
        const confirmedDoc = await confirmedRef.get();
        if (confirmedDoc.exists) {
          alreadyCredited = true;
        }
      } catch { /* quota — ignorer, on vérifie Fapshi quand même */ }

      if (alreadyCredited) {
        report.alreadyCredited++;
        report.details.push({ transId, userId, amount, fapshiStatus: "N/A", action: "déjà_crédité" });
        continue;
      }

      // Vérifier le statut chez Fapshi
      let fapshiStatus = "UNKNOWN";
      try {
        const r = await fetch(`${FAPSHI_BASE}/payment-status/${transId}`, {
          headers: { apiuser: FAPSHI_USER, apikey: FAPSHI_SECRET },
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) {
          const raw = await r.json() as Record<string, unknown>;
          const statusObj = (raw?.data ?? raw) as Record<string, unknown>;
          fapshiStatus = String(statusObj?.status ?? raw?.status ?? "UNKNOWN").toUpperCase();
        }
      } catch { fapshiStatus = "API_ERROR"; }

      if (fapshiStatus === "SUCCESSFUL") {
        // Paiement confirmé mais non crédité → mettre en file
        enqueuePendingCredit({
          id:      `fapshi_${transId}`,
          userId,  amount,
          method:  "Fapshi Mobile Money",
          transId, phone,
        });
        report.queued++;
        report.details.push({ transId, userId, amount, fapshiStatus, action: "enqueued" });
        console.log(`[audit] ✅ ${transId} SUCCESSFUL → enqueued ${amount} FCFA → ${userId}`);
      } else {
        report.failed++;
        report.details.push({ transId, userId, amount, fapshiStatus, action: "en_attente_ou_echoue" });
      }
    }

    console.log(`[audit] Résultat: ${report.found} trouvés, ${report.queued} enqueued, ${report.alreadyCredited} déjà crédités`);
    res.json({ success: true, report });

  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[audit] Erreur:", errMsg);
    res.status(500).json({ success: false, error: errMsg, partialReport: report });
  }
});

// ──────────────────────────────────────────────────────────────────────
// POST /api/admin/set-version  — Admin: configure la version de l'app
// Body: { latestVersion, minVersion, downloadUrl?, changelog?, forceUpdate? }
// ──────────────────────────────────────────────────────────────────────
router.post("/api/admin/set-version", requireAuth, async (req: AuthRequest, res) => {
  if (!requireAdmin(req, res)) return;

  const { latestVersion, minVersion, downloadUrl, changelog, forceUpdate } = req.body as {
    latestVersion?: string;
    minVersion?: string;
    downloadUrl?: string;
    changelog?: string;
    forceUpdate?: boolean;
  };

  if (!latestVersion || !minVersion) {
    res.status(400).json({ success: false, error: "latestVersion et minVersion sont requis" });
    return;
  }

  const db = getFirestore(getFirebaseAdmin());
  await db.collection("config").doc("appVersion").set({
    latestVersion,
    minVersion,
    downloadUrl: downloadUrl ?? "",
    changelog: changelog ?? "",
    forceUpdate: forceUpdate ?? false,
    updatedAt: new Date().toISOString(),
  });

  console.log(`[admin] Version app mise à jour → latest=${latestVersion} min=${minVersion} force=${forceUpdate ?? false}`);
  res.json({ success: true });
});

export default router;
