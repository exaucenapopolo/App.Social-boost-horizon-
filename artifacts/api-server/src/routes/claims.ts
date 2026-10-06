import { Router } from "express";
import type { Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import {
  firestoreQuery,
  firestoreCreate,
  firestoreGet,
  asString,
  asNumber,
} from "../lib/firebase-admin.js";

const router: ReturnType<typeof Router> = Router();

const ADMIN_WHATSAPP = process.env.MY_PHONE_NUMBER ?? "+237699853665";

async function sendTwilioWhatsApp(body: string): Promise<void> {
  const SID   = process.env.TWILIO_ACCOUNT_SID  ?? "";
  const TOKEN = process.env.TWILIO_AUTH_TOKEN    ?? "";
  const FROM  = process.env.TWILIO_PHONE_NUMBER  ?? "";
  if (!SID || !TOKEN || !FROM) {
    console.warn("[twilio/claims] Variables manquantes — WhatsApp non envoyé");
    return;
  }
  try {
    const params = new URLSearchParams({
      From: `whatsapp:${FROM}`,
      To:   `whatsapp:${ADMIN_WHATSAPP}`,
      Body: body,
    });
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: AbortSignal.timeout(12000),
      }
    );
    if (!r.ok) {
      const txt = await r.text();
      console.error("[twilio/claims] Erreur WhatsApp:", r.status, txt);
    } else {
      console.log("[twilio/claims] Notification réclamation envoyée à l'admin");
    }
  } catch (e) {
    console.error("[twilio/claims] Exception:", e);
  }
}

function isHighQuality(serviceName: string): boolean {
  const n = (serviceName ?? "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (
    n.includes("elite") ||
    n.includes("hq") ||
    n.includes("high quality") ||
    n.includes("haute qualite") ||
    n.includes("haute qualit") ||
    n.includes("premium") ||
    n.includes("non-drop") ||
    n.includes("nondrop") ||
    n.includes("non drop") ||
    n.includes("organic") ||
    n.includes("real followers") ||
    n.includes("abonnes reels") ||
    n.includes("abonnés réels")
  );
}

router.post("/claims/verify", requireAuth, async (req: AuthRequest, res: Response) => {
  const rawId = String(req.body?.orderId ?? "")
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .trim()
    .toUpperCase();

  if (!rawId) {
    res.status(400).json({ success: false, eligible: false, reason: "Numéro de commande requis." });
    return;
  }

  const uid     = req.uid!;
  const idToken = req.idToken!;

  try {
    const rawWithSpaces = rawId.replace(/([A-Z]+)-([A-Z]+)-(\d+)/, "$1-$2-$3");
    const queries = [
      firestoreQuery("commandes", [{ field: "orderId", value: rawId }], idToken),
      firestoreQuery("commandes", [{ field: "orderId", value: rawWithSpaces }], idToken),
    ];
    const results = await Promise.all(queries);
    const allOrders = results.flat();

    const seen = new Set<string>();
    const unique = allOrders.filter((o) => {
      const id = asString(o.orderId ?? o.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const orderExists = unique.find((o) =>
      asString(o.orderId, "").toUpperCase() === rawId ||
      asString(o.orderId, "").toUpperCase().trim() === rawId
    );

    const found = orderExists
      ? (asString(orderExists.userId) === uid ? orderExists : null)
      : null;

    if (!orderExists) {
      res.json({ success: true, eligible: false, reason: "Commande introuvable. Vérifiez le numéro et réessayez." });
      return;
    }

    if (!found) {
      res.json({ success: true, eligible: false, reason: "Cette commande ne vous appartient pas. Vous ne pouvez réclamer que vos propres commandes." });
      return;
    }

    const serviceName   = asString(found.serviceName ?? found.service, "");
    const createdAt     = new Date(asString(found.createdAt, new Date().toISOString()));
    const daysSinceOrder = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    const orderSummary = {
      orderId:        asString(found.orderId),
      platform:       asString(found.platform, "Non précisé"),
      service:        serviceName,
      quantity:       asNumber(found.quantity),
      link:           asString(found.link, "Non précisé"),
      daysSinceOrder,
    };

    if (daysSinceOrder > 30) {
      res.json({
        success: true, eligible: false,
        reason: `Cette commande date de ${daysSinceOrder} jours. La réclamation doit être effectuée dans les 30 jours suivant la livraison.`,
        order: orderSummary,
      });
      return;
    }

    if (!isHighQuality(serviceName)) {
      res.json({
        success: true, eligible: false,
        reason: "La réclamation gratuite est réservée aux commandes en qualité HQ, Élite, Premium ou Non-drop.",
        order: orderSummary,
      });
      return;
    }

    const existing = await firestoreQuery(
      "reclamations",
      [{ field: "orderId", value: asString(found.orderId) }],
      idToken
    );
    if (existing.length > 0) {
      res.json({
        success: true, eligible: false,
        reason: "Une réclamation a déjà été soumise pour cette commande.",
        order: orderSummary,
      });
      return;
    }

    res.json({
      success: true,
      eligible: true,
      order: { ...orderSummary, quality: "Haute qualité" },
    });
  } catch (e: any) {
    console.error("[claims/verify] error:", e);
    res.status(500).json({ success: false, eligible: false, reason: "Erreur serveur: " + (e?.message ?? "inconnue") });
  }
});

router.post("/claims/submit", requireAuth, async (req: AuthRequest, res: Response) => {
  const { orderId, quantityLost, description } = req.body ?? {};

  if (!orderId || !quantityLost || Number(quantityLost) < 1) {
    res.status(400).json({ success: false, error: "orderId et quantityLost requis." });
    return;
  }

  const uid     = req.uid!;
  const idToken = req.idToken!;

  try {
    const user = await firestoreGet(`users/${uid}`, idToken);
    const userName  = asString(user?.name ?? user?.username, "Inconnu");
    const userEmail = asString(user?.email, "Non renseigné");
    const userPhone = asString(user?.phone, "Non renseigné");

    const rawId = String(orderId)
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
      .trim()
      .toUpperCase();

    const [byUpper, byRaw] = await Promise.all([
      firestoreQuery("commandes", [{ field: "orderId", value: rawId }], idToken),
      firestoreQuery("commandes", [{ field: "orderId", value: String(orderId).trim() }], idToken),
    ]);

    const order = [...byUpper, ...byRaw].find((o) => asString(o.userId) === uid);
    if (!order) {
      res.status(403).json({ success: false, error: "Cette commande ne vous appartient pas ou est introuvable." });
      return;
    }

    const existingClaim = await firestoreQuery("reclamations", [{ field: "orderId", value: rawId }], idToken);
    if (existingClaim.length > 0) {
      res.status(409).json({ success: false, error: "Une réclamation a déjà été soumise pour cette commande." });
      return;
    }

    const reclamationId = `REC-${Date.now()}`;
    const claimData = {
      reclamationId,
      orderId:        rawId,
      userId:         uid,
      userName,
      userEmail,
      quantityLost:   Number(quantityLost),
      description:    String(description ?? "").trim(),
      platform:       asString(order?.platform, "Non précisé"),
      service:        asString(order?.serviceName ?? order?.service, "Non précisé"),
      quantity:       asNumber(order?.quantity),
      link:           asString(order?.link, "Non précisé"),
      status:         "pending",
      createdAt:      new Date().toISOString(),
    };

    await firestoreCreate("reclamations", claimData, idToken);

    res.json({ success: true, reclamationId });

    const adminMsg =
      `🔄 *RÉCLAMATION — Social Boost Horizon*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *ID Réclamation:* ${reclamationId}\n` +
      `👤 *Client:* ${userName}\n` +
      `📧 *Email:* ${userEmail}\n` +
      `📱 *Tél:* ${userPhone}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Commande:* ${rawId}\n` +
      `📱 *Plateforme:* ${claimData.platform}\n` +
      `🔧 *Service:* ${claimData.service}\n` +
      `📊 *Qté commandée:* ${claimData.quantity}\n` +
      `📉 *Qté perdue:* ${quantityLost}\n` +
      `🔗 *Lien:* ${claimData.link}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💬 *Message:* ${claimData.description || "(Aucun)"}\n` +
      `🕒 *Date:* ${new Date().toLocaleString("fr-FR")}`;

    sendTwilioWhatsApp(adminMsg).catch((e) =>
      console.error("[claims/submit] Twilio async error:", e)
    );
  } catch (e: any) {
    console.error("[claims/submit] error:", e);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: "Erreur serveur: " + (e?.message ?? "inconnue") });
    }
  }
});

export default router;
