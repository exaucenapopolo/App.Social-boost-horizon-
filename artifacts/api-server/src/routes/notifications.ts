import { Router } from "express";
import type { Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getFirebaseAdmin } from "../lib/firebase-admin.js";
import { getFirestore } from "firebase-admin/firestore";
import {
  firestoreQuery,
  firestoreGet,
  firestoreUpdate,
  asIsoDate,
  asString,
  asNumber,
} from "../lib/firebase-admin.js";

const router = Router();

// ── Cache notifications par utilisateur — 2 min TTL ───────────────────────
const notifCache = new Map<string, { data: unknown[]; ts: number }>();
const NOTIF_CACHE_MS = 15 * 60_000; // 15 minutes (poller invalide en temps réel)

export function invalidateNotifCache(uid: string): void {
  notifCache.delete(uid);
}

setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of notifCache) {
    if (now - entry.ts > NOTIF_CACHE_MS) notifCache.delete(uid);
  }
}, 10 * 60_000);

router.post("/notifications/push-token", requireAuth, async (req: AuthRequest, res: Response) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== "string" || !token.startsWith("ExponentPushToken")) {
    res.status(400).json({ success: false, error: "Token invalide" });
    return;
  }
  try {
    getFirebaseAdmin();
    const db = getFirestore();
    await db.doc(`users/${req.uid}`).update({ expoPushToken: token });
    console.log(`[notifications] Push token saved (admin SDK) for uid=${req.uid}`);
    res.json({ success: true });
  } catch (e: any) {
    console.warn("[notifications] push-token error:", e?.message);
    res.status(500).json({ success: false, error: e?.message });
  }
});

router.delete("/notifications/push-token", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    getFirebaseAdmin();
    const db = getFirestore();
    await db.doc(`users/${req.uid}`).update({ expoPushToken: null });
    console.log(`[notifications] Push token removed for uid=${req.uid}`);
    res.json({ success: true });
  } catch (e: any) {
    console.warn("[notifications] delete push-token error:", e?.message);
    res.status(500).json({ success: false, error: e?.message });
  }
});

type NotifType = "order_done" | "order_partial" | "order_cancelled" | "referral" | "nouveau_filleul" | "depot" | "info";

interface NotifItem {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  amount?: number;
  platform?: string;
  orderId?: string;
  serviceName?: string;
  quantity?: number;
  remains?: number;
  refundAmount?: number;
  filleulName?: string;
  createdAt: string;
}

/**
 * GET /api/notifications
 * Returns the user's notification history from Firestore activites + completed orders.
 */
router.get("/notifications", requireAuth, async (req: AuthRequest, res: Response) => {
  const uid     = req.uid!;
  const idToken = req.idToken!;

  // Serve depuis le cache si frais (économise activites + commandes Firestore)
  const cached = notifCache.get(uid);
  if (cached && Date.now() - cached.ts < NOTIF_CACHE_MS) {
    res.set("X-Cache", "HIT");
    res.json({ success: true, data: cached.data });
    return;
  }

  const notifs: NotifItem[] = [];
  const seen = new Set<string>();

  const push = (item: NotifItem) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      notifs.push(item);
    }
  };

  // 1. All saved activites (covers: parrainage, nouveau_filleul, order_done, order_partial, order_cancelled, depot)
  // Limité aux 50 activités les plus récentes.
  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const actSnap = await db.collection("activites")
      .where("userId", "==", uid)
      .limit(50)
      .get();
    const activities = actSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));

    for (const a of activities) {
      const aType     = asString(a.type);
      const amount    = asNumber(a.amount, 0);
      const createdAt = asIsoDate(a.createdAt) ?? (asString(a.createdAt) || new Date().toISOString());
      const label     = asString(a.label, "");
      const aTitle    = asString(a.title, "");

      if (aType === "parrainage") {
        push({
          id:        `referral_${a.id ?? createdAt}`,
          type:      "referral",
          title:     "🎁 Bonus parrainage !",
          message:   label || "Vous avez reçu un bonus parrainage.",
          amount,
          createdAt,
        });
      } else if (aType === "nouveau_filleul") {
        push({
          id:          `filleul_${a.id ?? createdAt}`,
          type:        "nouveau_filleul",
          title:       "🎉 Nouveau filleul !",
          message:     label || "Un nouvel utilisateur a rejoint avec votre code.",
          filleulName: asString(a.filleulName, ""),
          createdAt,
        });
      } else if (aType === "order_done") {
        push({
          id:          `done_${a.id ?? createdAt}`,
          type:        "order_done",
          title:       aTitle || "✅ Commande livrée !",
          message:     label,
          platform:    asString(a.platform, ""),
          serviceName: asString(a.serviceName, ""),
          quantity:    asNumber(a.quantity, 0),
          orderId:     asString(a.orderId, ""),
          createdAt,
        });
      } else if (aType === "order_partial") {
        push({
          id:           `partial_${a.id ?? createdAt}`,
          type:         "order_partial",
          title:        aTitle || "⚠️ Commande partiellement livrée",
          message:      label,
          platform:     asString(a.platform, ""),
          serviceName:  asString(a.serviceName, ""),
          quantity:     asNumber(a.quantity, 0),
          remains:      asNumber(a.remains, 0),
          refundAmount: asNumber(a.refundAmount, 0),
          orderId:      asString(a.orderId, ""),
          createdAt,
        });
      } else if (aType === "order_cancelled") {
        push({
          id:           `cancelled_${a.id ?? createdAt}`,
          type:         "order_cancelled",
          title:        aTitle || "❌ Commande annulée",
          message:      label,
          platform:     asString(a.platform, ""),
          serviceName:  asString(a.serviceName, ""),
          quantity:     asNumber(a.quantity, 0),
          refundAmount: asNumber(a.refundAmount, 0),
          orderId:      asString(a.orderId, ""),
          createdAt,
        });
      }
    }
  } catch (e) {
    console.error("[notifications] activites error:", e);
  }

  // 2. Completed orders in commandes collection (for orders that completed before activites were tracked)
  // Limité aux 20 commandes les plus récentes pour réduire les lectures Firestore.
  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const snap = await db.collection("commandes")
      .where("userId", "==", uid)
      .limit(20)
      .get();
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));

    for (const o of orders) {
      const status = asString(o.status);
      const completedAt = asIsoDate(o.lastRefreshed ?? o.completedAt ?? o.createdAt) ?? new Date().toISOString();
      const orderId     = asString(o.orderId, "");
      const serviceName = asString(o.serviceName || o.service, "Service");
      const platform    = asString(o.platform, "");
      const quantity    = asNumber(o.quantity, 0);

      const platformLabel = platform ? ` sur ${platform.charAt(0).toUpperCase() + platform.slice(1)}` : "";
      const qtyLabel      = quantity > 0 ? ` (${quantity.toLocaleString("fr-FR")} unités)` : "";

      if (status === "succès" || status === "completed" || status === "success") {
        push({
          id:          `order_done_${o.id ?? orderId}`,
          type:        "order_done",
          title:       "✅ Commande livrée !",
          message:     `${serviceName}${platformLabel}${qtyLabel} a été livrée avec succès.`,
          platform,
          orderId,
          serviceName,
          quantity,
          createdAt:   completedAt,
        });
      } else if (status === "partiel") {
        const refundAmount = asNumber(o.refundAmount, 0);
        const remains      = asNumber(o.remains, 0);
        push({
          id:           `order_partial_${o.id ?? orderId}`,
          type:         "order_partial",
          title:        "⚠️ Commande partiellement livrée",
          message:      `${serviceName}${platformLabel} a été partiellement livrée. ${remains > 0 ? `${remains} unités non livrées.` : ""}${refundAmount > 0 ? ` ${refundAmount.toLocaleString("fr-FR")} FCFA remboursés.` : ""}`,
          platform,
          orderId,
          serviceName,
          quantity,
          remains,
          refundAmount,
          createdAt:    completedAt,
        });
      } else if (status === "annulée" || status === "remboursé") {
        const refundAmount = asNumber(o.refundAmount, asNumber(o.price, 0));
        push({
          id:           `order_cancelled_${o.id ?? orderId}`,
          type:         "order_cancelled",
          title:        "❌ Commande annulée",
          message:      `${serviceName}${platformLabel}${qtyLabel} a été annulée.${refundAmount > 0 ? ` ${refundAmount.toLocaleString("fr-FR")} FCFA remboursés sur votre solde.` : ""}`,
          platform,
          orderId,
          serviceName,
          quantity,
          refundAmount,
          createdAt:    completedAt,
        });
      }
    }
  } catch (e) {
    console.error("[notifications] orders error:", e);
  }

  // Sort by date descending
  notifs.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Mettre en cache pour les prochaines requêtes
  notifCache.set(uid, { data: notifs, ts: Date.now() });
  res.set("X-Cache", "MISS");
  res.json({ success: true, data: notifs });
});

export default router;
