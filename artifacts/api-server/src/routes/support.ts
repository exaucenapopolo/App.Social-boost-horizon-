import { Router } from "express";
import type { Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { firestoreGet, asString } from "../lib/firebase-admin.js";
import { sendServiceRequestConfirmEmail } from "../lib/email.js";

const router: ReturnType<typeof Router> = Router();

const ADMIN_WHATSAPP = process.env.MY_PHONE_NUMBER ?? "+237699853665";

async function sendTwilioWhatsApp(body: string): Promise<void> {
  const SID   = process.env.TWILIO_ACCOUNT_SID  ?? "";
  const TOKEN = process.env.TWILIO_AUTH_TOKEN    ?? "";
  const FROM  = process.env.TWILIO_PHONE_NUMBER  ?? "";
  if (!SID || !TOKEN || !FROM) {
    console.warn("[twilio/support] Variables manquantes — WhatsApp non envoyé");
    return;
  }
  try {
    const params = new URLSearchParams({
      From: `whatsapp:${FROM}`,
      To:   `whatsapp:${ADMIN_WHATSAPP}`,
      Body: body,
    });
    const res = await fetch(
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
    if (!res.ok) {
      const txt = await res.text();
      console.error("[twilio/support] Erreur WhatsApp:", res.status, txt);
    } else {
      console.log("[twilio/support] Message WhatsApp envoyé à l'admin");
    }
  } catch (e) {
    console.error("[twilio/support] Exception:", e);
  }
}

router.post("/support/contact", requireAuth, async (req: AuthRequest, res: Response) => {
  const {
    category,
    message,
    details,
    whatsappCountryCode,
    whatsappPhone,
  } = req.body ?? {};

  try {
    const user      = await firestoreGet(`users/${req.uid}`, req.idToken!);
    const userName  = asString(user?.name, "Inconnu");
    const userEmail = asString(user?.email, "Non renseigné");
    const userPhone = asString(user?.phone, "Non renseigné");

    const detailsStr = details && typeof details === "object"
      ? Object.entries(details as Record<string, string>)
          .filter(([, v]) => v && v.trim())
          .map(([k, v]) => `  • ${k}: ${v}`)
          .join("\n")
      : "";

    const waNumber = `${whatsappCountryCode ?? ""} ${whatsappPhone ?? ""}`.trim() || "Non fourni";

    const adminMsg =
      `🆘 *DEMANDE DE SUPPORT — Social Boost Horizon*\n\n` +
      `👤 *Utilisateur:* ${userName}\n` +
      `📧 *Email:* ${userEmail}\n` +
      `📱 *Tél compte:* ${userPhone}\n` +
      `📞 *WhatsApp client:* ${waNumber}\n\n` +
      `📂 *Catégorie:* ${category ?? "Non précisée"}\n\n` +
      `💬 *Message:*\n${message ?? "(Vide)"}\n` +
      (detailsStr ? `\n📋 *Détails:*\n${detailsStr}\n` : "") +
      `\n🕒 *Date:* ${new Date().toLocaleString("fr-FR")}`;

    await sendTwilioWhatsApp(adminMsg);

    if (userEmail) {
      const detailsMap: Record<string, string> = { "Catégorie": category ?? "", "Message": (message ?? "").substring(0, 200) };
      sendServiceRequestConfirmEmail(userEmail, userName, "🆘", "Support Client", waNumber, detailsMap).catch(() => {});
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("[support/contact] error:", e);
    res.status(500).json({ success: false, error: e?.message ?? "Erreur interne" });
  }
});

router.post("/support/site-request", requireAuth, async (req: AuthRequest, res: Response) => {
  const {
    hasWebsite,
    siteUrl,
    requestType,
    description,
    whatsappCountryCode,
    whatsappPhone,
  } = req.body ?? {};

  try {
    const user      = await firestoreGet(`users/${req.uid}`, req.idToken!);
    const userName  = asString(user?.name, "Inconnu");
    const userEmail = asString(user?.email, "Non renseigné");

    const typeLabel = hasWebsite
      ? "✅ A déjà un site — veut intégrer l'API"
      : "🆕 Pas encore de site — veut un site SMM complet";

    const waNumber = `${whatsappCountryCode ?? ""} ${whatsappPhone ?? ""}`.trim() || "Non fourni";

    const adminMsg =
      `🌐 *DEMANDE DE SITE SMM — Social Boost Horizon*\n\n` +
      `👤 *Utilisateur:* ${userName}\n` +
      `📧 *Email:* ${userEmail}\n` +
      `📞 *WhatsApp client:* ${waNumber}\n\n` +
      `🔧 *Type de demande:* ${typeLabel}\n` +
      (siteUrl ? `🔗 *Site existant:* ${siteUrl}\n` : "") +
      `\n📦 *Services / fonctionnalités souhaitées:*\n${requestType ?? "Non précisé"}\n` +
      `\n📝 *Description du projet:*\n${description ?? "(Vide)"}\n` +
      `\n🕒 *Date:* ${new Date().toLocaleString("fr-FR")}`;

    await sendTwilioWhatsApp(adminMsg);

    if (userEmail) {
      const detailsMap: Record<string, string> = {
        "Type": hasWebsite ? "Intégration API sur site existant" : "Création de site SMM complet",
        ...(siteUrl ? { "Site actuel": siteUrl } : {}),
        "Services souhaités": (requestType ?? "").substring(0, 150),
        "Description": (description ?? "").substring(0, 200),
      };
      sendServiceRequestConfirmEmail(userEmail, userName, "🌐", "Site SMM / Intégration API", waNumber, detailsMap).catch(() => {});
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("[support/site-request] error:", e);
    res.status(500).json({ success: false, error: e?.message ?? "Erreur interne" });
  }
});

router.post("/support/service-request", requireAuth, async (req: AuthRequest, res: Response) => {
  const {
    serviceType,
    fields,
    whatsappCountryCode,
    whatsappPhone,
  } = req.body ?? {};

  const SERVICE_EMOJIS: Record<string, string> = {
    website: "🌐",
    app: "📱",
    ads: "📣",
    accounts: "💰",
  };
  const SERVICE_LABELS: Record<string, string> = {
    website: "CRÉATION DE SITE WEB",
    app: "CRÉATION D'APPLICATION MOBILE",
    ads: "CAMPAGNE PUBLICITAIRE CIBLÉE",
    accounts: "COMPTES & MONÉTISATION",
  };

  try {
    const user      = await firestoreGet(`users/${req.uid}`, req.idToken!);
    const userName  = asString(user?.name, "Inconnu");
    const userEmail = asString(user?.email, "Non renseigné");
    const userPhone = asString(user?.phone, "Non renseigné");

    const emoji = SERVICE_EMOJIS[serviceType] ?? "📋";
    const label = SERVICE_LABELS[serviceType] ?? (serviceType ?? "AUTRE SERVICE");
    const waNumber = `${whatsappCountryCode ?? ""} ${whatsappPhone ?? ""}`.trim() || "Non fourni";

    const fieldsStr = fields && typeof fields === "object"
      ? Object.entries(fields as Record<string, string>)
          .filter(([, v]) => v && String(v).trim())
          .map(([k, v]) => `  • ${k}: ${v}`)
          .join("\n")
      : "";

    const adminMsg =
      `${emoji} *DEMANDE DE SERVICE — Social Boost Horizon*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🗂️ *Service:* ${label}\n\n` +
      `👤 *Client:* ${userName}\n` +
      `📧 *Email:* ${userEmail}\n` +
      `📱 *Tél compte:* ${userPhone}\n` +
      `📞 *WhatsApp client:* ${waNumber}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Détails de la demande:*\n${fieldsStr || "(Aucun détail)"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🕒 *Date:* ${new Date().toLocaleString("fr-FR")}`;

    await sendTwilioWhatsApp(adminMsg);

    if (userEmail) {
      const detailsMap: Record<string, string> = {};
      if (fields && typeof fields === "object") {
        for (const [k, v] of Object.entries(fields as Record<string, string>)) {
          if (v && String(v).trim()) detailsMap[k] = String(v).substring(0, 150);
        }
      }
      sendServiceRequestConfirmEmail(userEmail, userName, emoji, label, waNumber, detailsMap).catch(() => {});
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("[support/service-request] error:", e);
    res.status(500).json({ success: false, error: e?.message ?? "Erreur interne" });
  }
});

router.post("/support/login-help", async (req: any, res: Response) => {
  const {
    email,
    category,
    message,
    whatsappCountryCode,
    whatsappPhone,
  } = req.body ?? {};

  if (!category || !message?.trim()) {
    res.status(400).json({ success: false, error: "Catégorie et message requis." });
    return;
  }

  res.json({ success: true });

  try {
    const waNumber = `${whatsappCountryCode ?? ""} ${whatsappPhone ?? ""}`.trim() || "Non fourni";

    const adminMsg =
      `🔐 *SUPPORT CONNEXION — Social Boost Horizon*\n\n` +
      `📧 *Email utilisateur:* ${email ?? "Non fourni"}\n` +
      `📞 *WhatsApp:* ${waNumber}\n\n` +
      `📂 *Catégorie:* ${category}\n\n` +
      `💬 *Message:*\n${message}\n\n` +
      `🕒 *Date:* ${new Date().toLocaleString("fr-FR")}\n` +
      `⚠️ _Envoi depuis la page de connexion (utilisateur non authentifié)_`;

    sendTwilioWhatsApp(adminMsg).catch((e) =>
      console.error("[support/login-help] Twilio async error:", e)
    );
  } catch (e: any) {
    console.error("[support/login-help] error:", e);
  }
});

export default router;
