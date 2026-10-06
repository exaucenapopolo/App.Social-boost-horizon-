import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY ?? "");
const FROM   = process.env.RESEND_FROM_EMAIL ?? "Social Boost Horizon <Support@socialboosthorizon.com>";
const APP_URL = "https://socialboosthorizon-app.replit.app";

// ── Base layout ────────────────────────────────────────────────────────────────
function layout(body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0A162B;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A162B;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

  <!-- LOGO HEADER -->
  <tr><td align="center" style="padding:0 0 24px;">
    <table cellpadding="0" cellspacing="0">
      <tr><td style="background:linear-gradient(135deg,#6C3AF5 0%,#EC4899 100%);border-radius:14px;padding:12px 28px;">
        <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.4px;">🚀 Social Boost Horizon</span>
      </td></tr>
    </table>
  </td></tr>

  <!-- CARD -->
  <tr><td style="background:#111C35;border-radius:16px;border:1px solid rgba(108,58,245,.25);overflow:hidden;">
    ${body}
  </td></tr>

  <!-- FOOTER -->
  <tr><td align="center" style="padding:24px 0 0;">

    <!-- WhatsApp support button -->
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
      <tr><td style="background:#25D366;border-radius:10px;padding:12px 28px;">
        <a href="https://wa.me/56927785730" style="color:#fff;font-size:14px;font-weight:700;text-decoration:none;">💬 Support WhatsApp</a>
      </td></tr>
    </table>

    <!-- Support email -->
    <p style="color:rgba(255,255,255,.35);font-size:12px;margin:0 0 4px;">
      📧 <a href="mailto:support@socialboosthorizon.com" style="color:rgba(255,255,255,.45);text-decoration:none;">support@socialboosthorizon.com</a>
    </p>

    <!-- Partner section -->
    <div style="margin:14px auto;max-width:440px;background:rgba(108,58,245,.08);border:1px solid rgba(108,58,245,.2);border-radius:10px;padding:12px 20px;">
      <p style="color:rgba(255,255,255,.5);font-size:12px;margin:0;line-height:1.6;">
        📱 <strong style="color:rgba(255,255,255,.7);">Vous voulez acheter un numéro étranger ?</strong><br>
        Notre partenaire est là pour vous, c'est rapide. Consultez sur
        <a href="https://texerra.site" style="color:#8B5CF6;text-decoration:none;font-weight:600;">texerra.site</a>
      </p>
    </div>

    <p style="color:rgba(255,255,255,.25);font-size:11px;margin:10px 0 0;">© 2025 Social Boost Horizon · Tous droits réservés</p>
    <p style="color:rgba(255,255,255,.15);font-size:10px;margin:4px 0 0;">
      Cet email vous a été envoyé car vous êtes inscrit sur Social Boost Horizon.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
function hero(emoji: string, title: string, subtitle: string): string {
  return `
  <div style="background:linear-gradient(160deg,rgba(108,58,245,.18) 0%,rgba(236,72,153,.1) 100%);padding:36px 32px 28px;text-align:center;border-bottom:1px solid rgba(108,58,245,.15);">
    <div style="font-size:48px;margin-bottom:12px;">${emoji}</div>
    <h1 style="color:#fff;font-size:24px;font-weight:700;margin:0 0 8px;">${title}</h1>
    <p style="color:rgba(255,255,255,.55);font-size:14px;margin:0;">${subtitle}</p>
  </div>`;
}

function section(rows: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 32px;">${rows}</table>`;
}

function row(label: string, value: string, accent = false): string {
  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);">
      <span style="color:rgba(255,255,255,.4);font-size:12px;text-transform:uppercase;letter-spacing:.6px;">${label}</span><br>
      <span style="color:${accent ? "#6C3AF5" : "#fff"};font-size:16px;font-weight:600;">${value}</span>
    </td>
  </tr>`;
}

function btn(label: string, href: string): string {
  return `
  <table cellpadding="0" cellspacing="0" style="margin:28px auto 32px;">
    <tr><td style="background:linear-gradient(135deg,#6C3AF5,#8B5CF6);border-radius:10px;padding:14px 36px;">
      <a href="${href}" style="color:#fff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:.3px;">${label}</a>
    </td></tr>
  </table>`;
}

function divider(): string {
  return `<tr><td style="height:1px;background:rgba(255,255,255,.07);"></td></tr>`;
}

function note(text: string): string {
  return `
  <div style="background:rgba(108,58,245,.1);border-left:3px solid #6C3AF5;border-radius:0 8px 8px 0;padding:12px 16px;margin:0 32px 28px;">
    <p style="color:rgba(255,255,255,.6);font-size:13px;margin:0;line-height:1.5;">${text}</p>
  </div>`;
}

// ── Send helper (fire-and-forget) ──────────────────────────────────────────────
async function send(to: string, subject: string, html: string, tag: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email/${tag}] RESEND_API_KEY non configuré — email non envoyé`);
    return;
  }
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) console.error(`[email/${tag}] ❌ Resend error:`, error);
    else        console.log(`[email/${tag}] ✅ Envoyé → ${to}`);
  } catch (e) {
    console.error(`[email/${tag}] ❌ Exception:`, e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. BIENVENUE — Inscription
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendWelcomeEmail(to: string, name: string, referralCode: string): Promise<void> {
  const firstName = name.split(" ")[0] || name;
  const html = layout(`
    ${hero("🎉", `Bienvenue, ${firstName} !`, "Votre compte Social Boost Horizon est prêt")}
    ${section(`
      <tr><td style="padding:0 0 16px;">
        <p style="color:rgba(255,255,255,.7);font-size:14px;line-height:1.7;margin:0;">
          Merci de rejoindre <strong style="color:#fff;">Social Boost Horizon</strong> — la plateforme qui booste votre visibilité sur les réseaux sociaux.
          Votre compte est maintenant actif et prêt à l'emploi.
        </p>
      </td></tr>
      ${divider()}
      ${row("Nom enregistré", name)}
      ${row("Email", to)}
      ${referralCode ? row("Votre code de parrainage", referralCode, true) : ""}
    `)}
    ${referralCode ? note(`Partagez votre code <strong>${referralCode}</strong> et gagnez <strong>10% de commission</strong> sur chaque rechargement de vos filleuls !`) : ""}
    ${btn("🚀 Accéder à mon compte", APP_URL)}
  `);

  await send(to, "🎉 Bienvenue sur Social Boost Horizon !", html, "welcome");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. RECHARGEMENT — Confirmé
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendRechargeEmail(
  to: string,
  name: string,
  amount: number,
  method: string,
  newBalance: number
): Promise<void> {
  const firstName = name.split(" ")[0] || name;
  const dateStr   = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Douala" });

  const html = layout(`
    ${hero("💰", "Rechargement confirmé !", `${amount.toLocaleString("fr-FR")} FCFA crédités sur votre solde`)}
    ${section(`
      <tr><td style="padding:0 0 16px;">
        <p style="color:rgba(255,255,255,.7);font-size:14px;line-height:1.7;margin:0;">
          Bonjour <strong style="color:#fff;">${firstName}</strong>, votre rechargement a bien été reçu et crédité.
        </p>
      </td></tr>
      ${divider()}
      ${row("Montant crédité", `${amount.toLocaleString("fr-FR")} FCFA`, true)}
      ${row("Nouveau solde", `${newBalance.toLocaleString("fr-FR")} FCFA`)}
      ${row("Méthode de paiement", method)}
      ${row("Date", dateStr)}
    `)}
    ${note("Votre solde est immédiatement disponible pour passer des commandes. Merci pour votre confiance !")}
    ${btn("📦 Commander maintenant", APP_URL)}
  `);

  await send(to, `💰 Rechargement de ${amount.toLocaleString("fr-FR")} FCFA confirmé`, html, "recharge");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. RETRAIT — Demande soumise
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendWithdrawalEmail(
  to: string,
  name: string,
  amount: number,
  phone: string,
  method: string,
  fee: number
): Promise<void> {
  const firstName = name.split(" ")[0] || name;
  const dateStr   = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Douala" });
  const net       = amount - fee;

  const html = layout(`
    ${hero("🏧", "Demande de retrait reçue", "Traitement sous 24h ouvrables")}
    ${section(`
      <tr><td style="padding:0 0 16px;">
        <p style="color:rgba(255,255,255,.7);font-size:14px;line-height:1.7;margin:0;">
          Bonjour <strong style="color:#fff;">${firstName}</strong>, nous avons bien reçu votre demande de retrait.
          Elle sera traitée dans les <strong style="color:#fff;">24 heures ouvrables</strong>.
        </p>
      </td></tr>
      ${divider()}
      ${row("Montant demandé", `${amount.toLocaleString("fr-FR")} FCFA`, true)}
      ${fee > 0 ? row("Frais de retrait", `${fee.toLocaleString("fr-FR")} FCFA`) : ""}
      ${fee > 0 ? row("Montant net reçu", `${net.toLocaleString("fr-FR")} FCFA`) : ""}
      ${row("Méthode", method)}
      ${row("Numéro de réception", phone)}
      ${row("Date de la demande", dateStr)}
    `)}
    ${note("Si vous n'avez pas reçu votre retrait dans les 24h ouvrables, contactez-nous via le support de l'application.")}
    ${btn("💬 Contacter le support", APP_URL)}
  `);

  await send(to, `🏧 Demande de retrait de ${amount.toLocaleString("fr-FR")} FCFA reçue`, html, "withdrawal");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. COMMANDE — Passée avec succès
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendOrderEmail(
  to: string,
  name: string,
  serviceName: string,
  platform: string,
  quantity: number,
  priceXAF: number,
  link: string,
  orderId?: string
): Promise<void> {
  const firstName = name.split(" ")[0] || name;
  const dateStr   = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Douala" });
  const shortLink = link.length > 50 ? link.substring(0, 47) + "…" : link;

  const html = layout(`
    ${hero("📦", "Commande passée !", `Votre commande ${platform} est en cours de traitement`)}
    ${section(`
      <tr><td style="padding:0 0 16px;">
        <p style="color:rgba(255,255,255,.7);font-size:14px;line-height:1.7;margin:0;">
          Bonjour <strong style="color:#fff;">${firstName}</strong>, votre commande a bien été enregistrée et est maintenant en traitement.
        </p>
      </td></tr>
      ${divider()}
      ${orderId ? row("ID Commande", orderId, true) : ""}
      ${row("Service", serviceName)}
      ${row("Plateforme", platform)}
      ${row("Quantité", quantity.toLocaleString("fr-FR"))}
      ${priceXAF > 0 ? row("Montant débité", `${priceXAF.toLocaleString("fr-FR")} FCFA`) : ""}
      ${row("Lien cible", shortLink)}
      ${row("Date", dateStr)}
    `)}
    ${note("Le temps de livraison varie selon le service. Vous pouvez suivre l'avancement dans l'onglet <strong>Commandes</strong> de l'application.")}
    ${btn("📊 Suivre ma commande", APP_URL)}
  `);

  await send(to, `📦 Commande ${platform} — ${quantity.toLocaleString("fr-FR")} ${serviceName}`, html, "order");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. STATUT COMMANDE — Mis à jour (succès / partiel / annulée / remboursé)
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendOrderStatusEmail(
  to: string,
  name: string,
  status: "succès" | "partiel" | "annulée" | "remboursé",
  serviceName: string,
  platform: string,
  quantity: number,
  price: number,
  orderId: string,
  refundAmt?: number
): Promise<void> {
  const firstName = name.split(" ")[0] || name;
  const dateStr   = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Douala" });

  const CONFIG = {
    "succès":    { emoji: "✅", accentColor: "#10B981", title: "Commande livrée !", subtitle: `${serviceName} sur ${platform} a été livré avec succès`, subject: `✅ Commande ${orderId} livrée !`, noteText: "Merci pour votre confiance ! Revenez nous voir pour booster encore plus votre visibilité." },
    "partiel":   { emoji: "⚠️", accentColor: "#F59E0B", title: "Livraison partielle", subtitle: `${serviceName} sur ${platform} — une partie n'a pas pu être livrée`, subject: `⚠️ Commande ${orderId} — livraison partielle`, noteText: "Vérifiez que votre compte est public et que votre lien est correct avant de relancer une nouvelle commande." },
    "annulée":   { emoji: "❌", accentColor: "#EF4444", title: "Commande annulée", subtitle: `${serviceName} sur ${platform} a été annulée par le prestataire`, subject: `❌ Commande ${orderId} annulée`, noteText: "Vérifiez la confidentialité de votre lien avant de relancer. Si le problème persiste, contactez notre support." },
    "remboursé": { emoji: "💰", accentColor: "#6C3AF5", title: "Commande remboursée", subtitle: `${serviceName} sur ${platform} — montant remboursé sur votre solde`, subject: `💰 Commande ${orderId} remboursée`, noteText: "Le montant a été crédité sur votre solde et est disponible immédiatement pour une nouvelle commande." },
  };

  const c = CONFIG[status];

  const html = layout(`
    <div style="background:linear-gradient(160deg,rgba(${status === "succès" ? "16,185,129" : status === "partiel" ? "245,158,11" : status === "annulée" ? "239,68,68" : "108,58,245"},.15) 0%,rgba(17,28,53,0) 100%);padding:36px 32px 28px;text-align:center;border-bottom:1px solid rgba(${status === "succès" ? "16,185,129" : status === "partiel" ? "245,158,11" : status === "annulée" ? "239,68,68" : "108,58,245"},.2);">
      <div style="font-size:48px;margin-bottom:12px;">${c.emoji}</div>
      <h1 style="color:#fff;font-size:24px;font-weight:700;margin:0 0 8px;">${c.title}</h1>
      <p style="color:rgba(255,255,255,.55);font-size:14px;margin:0;">${c.subtitle}</p>
    </div>
    ${section(`
      <tr><td style="padding:0 0 16px;">
        <p style="color:rgba(255,255,255,.7);font-size:14px;line-height:1.7;margin:0;">
          Bonjour <strong style="color:#fff;">${firstName}</strong>, voici la mise à jour de votre commande.
        </p>
      </td></tr>
      ${divider()}
      ${row("Référence commande", orderId, true)}
      ${row("Service", serviceName)}
      ${row("Plateforme", platform)}
      ${row("Quantité commandée", quantity.toLocaleString("fr-FR"))}
      ${price > 0 ? row("Montant payé", `${price.toLocaleString("fr-FR")} FCFA`) : ""}
      ${refundAmt && refundAmt > 0 ? row("Remboursement crédité", `${refundAmt.toLocaleString("fr-FR")} FCFA`) : ""}
      ${row("Date de mise à jour", dateStr)}
      <tr><td style="padding:14px 0 0;">
        <span style="display:inline-block;background:rgba(${status === "succès" ? "16,185,129" : status === "partiel" ? "245,158,11" : status === "annulée" ? "239,68,68" : "108,58,245"},.15);border:1px solid rgba(${status === "succès" ? "16,185,129" : status === "partiel" ? "245,158,11" : status === "annulée" ? "239,68,68" : "108,58,245"},.4);color:${c.accentColor};font-size:13px;font-weight:700;padding:6px 14px;border-radius:20px;letter-spacing:.4px;">
          Statut : ${status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </td></tr>
    `)}
    ${note(c.noteText)}
    ${btn("📊 Voir mes commandes", APP_URL)}
  `);

  await send(to, c.subject, html, `order-status-${status}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. DEMANDE DE SERVICE — Confirmation reçue
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendServiceRequestConfirmEmail(
  to: string,
  name: string,
  serviceEmoji: string,
  serviceLabel: string,
  waNumber: string,
  details: Record<string, string>
): Promise<void> {
  const firstName  = name.split(" ")[0] || name;
  const dateStr    = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Douala" });
  const waClean    = waNumber.replace(/\s+/g, "").replace(/[^\d+]/g, "");
  const waLink     = waClean ? `https://wa.me/${waClean.replace("+", "")}` : "https://wa.me/237699853665";

  const detailRows = Object.entries(details)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => row(k, String(v).substring(0, 120)))
    .join("");

  const html = layout(`
    ${hero(serviceEmoji, "Demande bien reçue !", `${serviceLabel} — nous vous contactons bientôt`)}
    ${section(`
      <tr><td style="padding:0 0 16px;">
        <p style="color:rgba(255,255,255,.7);font-size:14px;line-height:1.7;margin:0;">
          Bonjour <strong style="color:#fff;">${firstName}</strong>, nous avons bien reçu votre demande de <strong style="color:#fff;">${serviceLabel}</strong>.
          <br><br>
          Notre équipe va l'étudier et vous contactera directement sur <strong style="color:#25D366;">WhatsApp</strong> dans les plus brefs délais pour finaliser les détails de votre projet.
        </p>
      </td></tr>
      ${divider()}
      ${row("Type de service", `${serviceEmoji} ${serviceLabel}`)}
      ${detailRows}
      ${row("Votre WhatsApp renseigné", waNumber || "Non fourni")}
      ${row("Date de la demande", dateStr)}
    `)}
    <div style="background:rgba(37,211,102,.08);border:1px solid rgba(37,211,102,.25);border-radius:12px;padding:18px 24px;margin:0 32px 28px;text-align:center;">
      <p style="color:rgba(255,255,255,.6);font-size:13px;margin:0 0 12px;">Vous pouvez aussi nous contacter directement sur WhatsApp :</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr><td style="background:#25D366;border-radius:10px;padding:12px 28px;">
          <a href="${waLink}" style="color:#fff;font-size:14px;font-weight:700;text-decoration:none;">💬 Ouvrir WhatsApp</a>
        </td></tr>
      </table>
    </div>
    ${btn("🏠 Retour à l'application", APP_URL)}
  `);

  await send(to, `${serviceEmoji} Demande ${serviceLabel} reçue — Social Boost Horizon`, html, "service-request");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. RAPPORT CONSOLIDÉ ADMIN (journalier / hebdo / mensuel)
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendConsolidatedAdminReport(
  to: string,
  type: "daily" | "weekly" | "monthly",
  periodLabel: string,
  stats: {
    newUsers: number;
    orders: number;
    revenue: number;
    profit: number;
    margin: number;
    deposits: number;
    nbDeposits: number;
    withdrawals: number;
    nbWithdrawals: number;
    refunds: number;
    net: number;
    referralsPaid: number;
  }
): Promise<void> {
  const typeEmoji = type === "daily" ? "📊" : type === "weekly" ? "📈" : "🏆";
  const typeLabel =
    type === "daily" ? "Rapport journalier" :
    type === "weekly" ? "Rapport hebdomadaire" : "Bilan mensuel";

  const subject = `${typeEmoji} ${typeLabel} — Social Boost Horizon`;
  const f = (n: number) => n.toLocaleString("fr-FR");
  const sign = stats.net >= 0 ? "+" : "";

  const html = layout(`
    ${hero(typeEmoji, typeLabel, periodLabel)}

    <!-- SECTION UTILISATEURS -->
    <div style="padding:0 32px;">
      <p style="color:rgba(255,255,255,.35);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:24px 0 10px;">👥 Utilisateurs</p>
    </div>
    ${section(`
      ${row("Nouveaux inscrits sur la période", `+${stats.newUsers}`, true)}
    `)}

    <!-- SECTION COMMANDES -->
    <div style="padding:0 32px;">
      <p style="color:rgba(255,255,255,.35);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:8px 0 10px;">📦 Commandes</p>
    </div>
    ${section(`
      ${row("Nombre de commandes", f(stats.orders), true)}
      ${row("Chiffre d'affaires", `${f(stats.revenue)} FCFA`)}
      ${row("Bénéfice net estimé", `${f(stats.profit)} FCFA`, true)}
      ${row("Marge moyenne", `${stats.margin} %`)}
    `)}

    <!-- SECTION PAIEMENTS -->
    <div style="padding:0 32px;">
      <p style="color:rgba(255,255,255,.35);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:8px 0 10px;">💰 Paiements</p>
    </div>
    ${section(`
      ${row("Dépôts", `${stats.nbDeposits} opération(s) — ${f(stats.deposits)} FCFA`, true)}
      ${row("Retraits", `${stats.nbWithdrawals} opération(s) — ${f(stats.withdrawals)} FCFA`)}
      ${row("Remboursements", `${f(stats.refunds)} FCFA`)}
      ${row("Parrainages crédités", `${f(stats.referralsPaid)} FCFA`)}
      ${divider()}
      ${row("Net encaissé (Dépôts − Retraits − Remb.)", `${sign}${f(stats.net)} FCFA`, stats.net >= 0)}
    `)}

    ${note(`Rapport généré automatiquement le ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Douala", dateStyle: "full", timeStyle: "short" })} (WAT)`)}
    ${btn("🚀 Ouvrir le tableau de bord", APP_URL)}
  `);

  await send(to, subject, html, `admin-report-${type}`);
}
