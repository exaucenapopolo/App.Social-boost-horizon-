import { Router } from "express";
import type { Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getFirebaseAdmin, asString, asNumber } from "../lib/firebase-admin.js";
import { sendConsolidatedAdminReport } from "../lib/email.js";

const router: ReturnType<typeof Router> = Router();

const ADMIN_WA   = process.env.MY_PHONE_NUMBER ?? "+237699853665";
const WAT_OFFSET = 1;

const MULTIPLIERS: Record<string, number> = {
  standard:           2,
  revendeur:          2,
  automatique_mtp:    3,
  automatique_smmgen: 3.5,
  avancée:            1.82,
  avancee:            1.82,
  advanced:           1.82,
};

function getMultiplier(type: string, provider: string): number {
  const t = (type ?? "").toLowerCase();
  const p = (provider ?? "").toLowerCase();
  if (t === "automatique" || t === "auto") {
    return p === "smmgen" ? MULTIPLIERS.automatique_smmgen : MULTIPLIERS.automatique_mtp;
  }
  return MULTIPLIERS[t] ?? 2;
}

function calcCostAndProfit(revenue: number, type: string, provider: string): { cost: number; profit: number; margin: number } {
  const mult   = getMultiplier(type, provider);
  const cost   = Math.round(revenue / mult);
  const profit = revenue - cost;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
  return { cost, profit, margin };
}

async function sendWhatsAppOnce(body: string): Promise<void> {
  const SID   = process.env.TWILIO_ACCOUNT_SID ?? "";
  const TOKEN = process.env.TWILIO_AUTH_TOKEN  ?? "";
  const FROM  = process.env.TWILIO_PHONE_NUMBER ?? "";
  if (!SID || !TOKEN || !FROM) throw new Error("Twilio non configuré");

  const params = new URLSearchParams({
    From: `whatsapp:${FROM}`,
    To:   `whatsapp:${ADMIN_WA}`,
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
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt}`);
  }
}

async function sendWhatsApp(body: string): Promise<boolean> {
  const delays = [0, 12000, 30000];
  const SID = process.env.TWILIO_ACCOUNT_SID ?? "";
  if (!SID) {
    console.warn("[reports] Twilio non configuré — aperçu du rapport :");
    console.log(body);
    return false;
  }

  for (let attempt = 1; attempt <= delays.length; attempt++) {
    if (delays[attempt - 1] > 0) {
      console.log(`[reports] ⏳ Retry ${attempt}/${delays.length} dans ${delays[attempt - 1] / 1000}s...`);
      await new Promise((r) => setTimeout(r, delays[attempt - 1]));
    }
    try {
      await sendWhatsAppOnce(body);
      console.log(`[reports] ✅ WhatsApp envoyé (tentative ${attempt})`);
      return true;
    } catch (e) {
      console.error(`[reports] ❌ Tentative ${attempt} échouée:`, (e as Error).message);
    }
  }
  console.error("[reports] ❌ Échec total après 3 tentatives — rapport non livré");
  return false;
}

function getDB() { return getFirebaseAdmin().firestore(); }

function watDateStr(date: Date): string {
  return date.toLocaleString("fr-FR", {
    timeZone: "Africa/Douala",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
function watTimeStr(date: Date): string {
  return date.toLocaleTimeString("fr-FR", {
    timeZone: "Africa/Douala", hour: "2-digit", minute: "2-digit",
  });
}

function startOfDayWAT(date: Date = new Date()): Date {
  const watMs  = date.getTime() + WAT_OFFSET * 3600000;
  const watDay = new Date(watMs);
  watDay.setUTCHours(0, 0, 0, 0);
  return new Date(watDay.getTime() - WAT_OFFSET * 3600000);
}
function startOfWeekWAT(): Date {
  const now     = new Date();
  const watNow  = new Date(now.getTime() + WAT_OFFSET * 3600000);
  const fromMon = (watNow.getUTCDay() + 6) % 7;
  watNow.setUTCDate(watNow.getUTCDate() - fromMon);
  watNow.setUTCHours(0, 0, 0, 0);
  return new Date(watNow.getTime() - WAT_OFFSET * 3600000);
}
function startOfMonthWAT(): Date {
  const now    = new Date();
  const watNow = new Date(now.getTime() + WAT_OFFSET * 3600000);
  const start  = new Date(Date.UTC(watNow.getUTCFullYear(), watNow.getUTCMonth(), 1, 0, 0, 0));
  return new Date(start.getTime() - WAT_OFFSET * 3600000);
}

function f(n: number): string { return n.toLocaleString("fr-FR"); }

interface Order {
  type?: string; provider?: string;
  price?: number; finalCost?: number; totalCost?: number;
  status?: string; platform?: string; userId?: string;
}

interface OrderStats {
  totalOrders: number;
  revenue: number;
  totalCost: number;
  totalProfit: number;
  overallMargin: number;
  byType: {
    standard:    { count: number; revenue: number; cost: number; profit: number; margin: number };
    revendeur:   { count: number; revenue: number; cost: number; profit: number; margin: number };
    automatique: { count: number; revenue: number; cost: number; profit: number; margin: number };
    avancee:     { count: number; revenue: number; cost: number; profit: number; margin: number };
  };
  status: { success: number; inProgress: number; pending: number; cancelled: number; partial: number };
  topPlatforms: [string, number][];
  activeUsers: number;
}

function emptyBucket() { return { count: 0, revenue: 0, cost: 0, profit: 0, margin: 0 }; }

function buildOrderStats(orders: Order[]): OrderStats {
  const byType = {
    standard:    emptyBucket(),
    revendeur:   emptyBucket(),
    automatique: emptyBucket(),
    avancee:     emptyBucket(),
  };
  const statusBucket = { success: 0, inProgress: 0, pending: 0, cancelled: 0, partial: 0 };
  const platformMap: Record<string, number> = {};
  const userSet = new Set<string>();

  let totalRevenue = 0, totalCost = 0, totalProfit = 0;

  for (const o of orders) {
    const t   = (o.type ?? "standard").toLowerCase();
    const p   = (o.provider ?? "").toLowerCase();
    const rev = asNumber(o.price ?? o.finalCost ?? o.totalCost);
    const { cost, profit } = calcCostAndProfit(rev, t, p);

    totalRevenue += rev;
    totalCost    += cost;
    totalProfit  += profit;

    const bucket =
      t === "revendeur" ? byType.revendeur :
      t === "automatique" || t === "auto" ? byType.automatique :
      (t === "avancée" || t === "avancee" || t === "advanced") ? byType.avancee :
      byType.standard;

    bucket.count++;
    bucket.revenue += rev;
    bucket.cost    += cost;
    bucket.profit  += profit;

    const s = (o.status ?? "").toLowerCase();
    if (s.includes("succ") || s === "completed")    statusBucket.success++;
    else if (s.includes("cours") || s === "running") statusBucket.inProgress++;
    else if (s.includes("annul") || s === "canceled") statusBucket.cancelled++;
    else if (s === "partiel" || s === "partial")    statusBucket.partial++;
    else statusBucket.pending++;

    if (o.platform) platformMap[o.platform] = (platformMap[o.platform] || 0) + 1;
    if ((o as any).userId) userSet.add((o as any).userId);
  }

  for (const b of Object.values(byType)) {
    b.margin = b.revenue > 0 ? Math.round((b.profit / b.revenue) * 1000) / 10 : 0;
  }

  return {
    totalOrders:  orders.length,
    revenue:      totalRevenue,
    totalCost,
    totalProfit,
    overallMargin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0,
    byType,
    status:       statusBucket,
    topPlatforms: (Object.entries(platformMap) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 5),
    activeUsers:  userSet.size,
  };
}

function buildFinanceSection(s: OrderStats): string {
  let msg = "";
  msg += `💰 *FINANCES*\n`;
  msg += `├─ Chiffre d'affaires : *${f(s.revenue)} FCFA*\n`;
  msg += `├─ Coût fournisseurs estimé : ~${f(s.totalCost)} FCFA\n`;
  msg += `└─ *BÉNÉFICE NET estimé : ~${f(s.totalProfit)} FCFA (${s.overallMargin} %)*\n\n`;

  msg += `📦 *DÉTAIL PAR TYPE*\n`;

  const { standard, revendeur, automatique, avancee } = s.byType;
  if (standard.count > 0)
    msg += `├─ 🔵 Standard (×2 → 50%) : ${standard.count} cmd — CA ${f(standard.revenue)} → Bén. ~${f(standard.profit)} FCFA\n`;
  if (automatique.count > 0)
    msg += `├─ 🟣 Automatique (×3/3.5 → 67-71%) : ${automatique.count} cmd — CA ${f(automatique.revenue)} → Bén. ~${f(automatique.profit)} FCFA\n`;
  if (revendeur.count > 0)
    msg += `├─ 🟢 Revendeur (×2 → 50%) : ${revendeur.count} cmd — CA ${f(revendeur.revenue)} → Bén. ~${f(revendeur.profit)} FCFA\n`;
  if (avancee.count > 0)
    msg += `└─ 🟠 Avancée (×1.82 → 45%) : ${avancee.count} cmd — CA ${f(avancee.revenue)} → Bén. ~${f(avancee.profit)} FCFA\n`;

  if (standard.count === 0 && automatique.count === 0 && revendeur.count === 0 && avancee.count === 0)
    msg += `└─ Aucune commande sur cette période\n`;

  return msg;
}

export async function sendDailyOrderReport(): Promise<void> {
  console.log("[reports] Génération rapport journalier commandes...");
  const db   = getDB();
  const from = startOfDayWAT();
  const snap = await db.collection("commandes")
    .where("createdAt", ">=", from.toISOString()).get().catch(() => null);
  const orders: Order[] = snap ? snap.docs.map((d) => d.data() as Order) : [];
  const s   = buildOrderStats(orders);
  const now = new Date();

  let msg = `📊 *RAPPORT JOURNALIER — COMMANDES*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 ${watDateStr(now)}\n`;
  msg += `🕙 Généré à ${watTimeStr(now)} (WAT)\n\n`;
  msg += `📦 Total commandes : *${s.totalOrders}*\n`;
  msg += `👥 Utilisateurs actifs : ${s.activeUsers}\n\n`;
  msg += buildFinanceSection(s);
  msg += `\n📈 *STATUTS*\n`;
  msg += `├─ ✅ Succès : ${s.status.success}   🔄 En cours : ${s.status.inProgress}\n`;
  msg += `├─ ⏳ En attente : ${s.status.pending}   🟡 Partiel : ${s.status.partial}\n`;
  msg += `└─ ❌ Annulé : ${s.status.cancelled}\n`;
  if (s.topPlatforms.length > 0) {
    msg += `\n🌐 *TOP PLATEFORMES*\n`;
    s.topPlatforms.forEach(([pl, cnt], i) => {
      msg += `${i === s.topPlatforms.length - 1 ? "└─" : "├─"} ${pl} : ${cnt}\n`;
    });
  }

  await sendWhatsApp(msg);
  console.log("[reports] ✅ Rapport journalier commandes terminé");
}

export async function sendDailyPaymentReport(): Promise<void> {
  console.log("[reports] Génération rapport journalier paiements...");
  const db   = getDB();
  const from = startOfDayWAT();
  const snap = await db.collection("activites")
    .where("createdAt", ">=", from.toISOString()).get().catch(() => null);
  const acts = snap ? snap.docs.map((d) => d.data()) : [];

  let depots = 0, nbDepots = 0;
  let retraits = 0, nbRetraits = 0;
  let rembs = 0, nbRembs = 0;
  let parrainages = 0, nbParr = 0;

  for (const a of acts) {
    const amt = asNumber(a.amount);
    const typ = asString(a.type);
    if (typ === "depot")          { depots += amt; nbDepots++; }
    else if (typ === "retrait")   { retraits += amt; nbRetraits++; }
    else if (typ === "remboursement") { rembs += amt; nbRembs++; }
    else if (typ === "parrainage") { parrainages += amt; nbParr++; }
  }

  const net = depots - retraits - rembs;
  const now = new Date();
  let msg = `💰 *RAPPORT JOURNALIER — PAIEMENTS*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 ${watDateStr(now)}\n`;
  msg += `🕙 Généré à ${watTimeStr(now)} (WAT)\n\n`;
  msg += `📥 Dépôts : ${nbDepots} — *${f(depots)} FCFA*\n`;
  msg += `📤 Retraits : ${nbRetraits} — ${f(retraits)} FCFA\n`;
  msg += `💸 Remboursements : ${nbRembs} — ${f(rembs)} FCFA\n`;
  msg += `🤝 Parrainages crédités : ${nbParr} — ${f(parrainages)} FCFA\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 *Net encaissé : ${net >= 0 ? "+" : ""}${f(net)} FCFA*\n`;
  msg += `_(Dépôts − Retraits − Remboursements)_`;

  await sendWhatsApp(msg);
  console.log("[reports] ✅ Rapport journalier paiements terminé");
}

export async function sendWeeklyOrderReport(): Promise<void> {
  console.log("[reports] Génération rapport hebdomadaire commandes...");
  const db   = getDB();
  const from = startOfWeekWAT();
  const snap = await db.collection("commandes")
    .where("createdAt", ">=", from.toISOString()).get().catch(() => null);
  const orders: Order[] = snap ? snap.docs.map((d) => d.data() as Order) : [];
  const s   = buildOrderStats(orders);
  const now = new Date();

  let msg = `📊 *RAPPORT HEBDOMADAIRE — COMMANDES*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 Semaine du ${watDateStr(from)}\n`;
  msg += `🕙 Généré à ${watTimeStr(now)} (WAT)\n\n`;
  msg += `📦 Total commandes : *${s.totalOrders}*\n`;
  msg += `👥 Utilisateurs actifs : ${s.activeUsers}\n\n`;
  msg += buildFinanceSection(s);
  msg += `\n📈 *STATUTS*\n`;
  msg += `├─ ✅ Succès : ${s.status.success}   🔄 En cours : ${s.status.inProgress}\n`;
  msg += `├─ ⏳ En attente : ${s.status.pending}   🟡 Partiel : ${s.status.partial}\n`;
  msg += `└─ ❌ Annulé : ${s.status.cancelled}\n`;
  if (s.topPlatforms.length > 0) {
    msg += `\n🌐 *TOP PLATEFORMES*\n`;
    s.topPlatforms.forEach(([pl, cnt], i) => {
      msg += `${i === s.topPlatforms.length - 1 ? "└─" : "├─"} ${pl} : ${cnt}\n`;
    });
  }

  await sendWhatsApp(msg);
  console.log("[reports] ✅ Rapport hebdomadaire commandes terminé");
}

export async function sendWeeklyPaymentReport(): Promise<void> {
  console.log("[reports] Génération rapport hebdomadaire paiements...");
  const db   = getDB();
  const from = startOfWeekWAT();
  const snap = await db.collection("activites")
    .where("createdAt", ">=", from.toISOString()).get().catch(() => null);
  const acts = snap ? snap.docs.map((d) => d.data()) : [];

  let depots = 0, nbDepots = 0;
  let retraits = 0, nbRetraits = 0;
  let rembs = 0, nbRembs = 0;
  let parrainages = 0, nbParr = 0;

  for (const a of acts) {
    const amt = asNumber(a.amount);
    const typ = asString(a.type);
    if (typ === "depot")              { depots += amt; nbDepots++; }
    else if (typ === "retrait")       { retraits += amt; nbRetraits++; }
    else if (typ === "remboursement") { rembs += amt; nbRembs++; }
    else if (typ === "parrainage")    { parrainages += amt; nbParr++; }
  }

  const net = depots - retraits - rembs;
  const now = new Date();
  let msg = `💰 *RAPPORT HEBDOMADAIRE — PAIEMENTS*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 Semaine du ${watDateStr(from)}\n`;
  msg += `🕙 Généré à ${watTimeStr(now)} (WAT)\n\n`;
  msg += `📥 Dépôts : ${nbDepots} — *${f(depots)} FCFA*\n`;
  msg += `📤 Retraits : ${nbRetraits} — ${f(retraits)} FCFA\n`;
  msg += `💸 Remboursements : ${nbRembs} — ${f(rembs)} FCFA\n`;
  msg += `🤝 Parrainages crédités : ${nbParr} — ${f(parrainages)} FCFA\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 *Net encaissé : ${net >= 0 ? "+" : ""}${f(net)} FCFA*\n`;
  msg += `_(Dépôts − Retraits − Remboursements)_`;

  await sendWhatsApp(msg);
  console.log("[reports] ✅ Rapport hebdomadaire paiements terminé");
}

export async function sendMonthlyReport(): Promise<void> {
  console.log("[reports] Génération rapport mensuel...");
  const db   = getDB();
  const from = startOfMonthWAT();

  const [ordersSnap, actsSnap, usersSnap] = await Promise.all([
    db.collection("commandes").where("createdAt", ">=", from.toISOString()).get().catch(() => null),
    db.collection("activites").where("createdAt", ">=", from.toISOString()).get().catch(() => null),
    db.collection("users").get().catch(() => null),
  ]);

  const orders: Order[] = ordersSnap ? ordersSnap.docs.map((d) => d.data() as Order) : [];
  const acts   = actsSnap   ? actsSnap.docs.map((d) => d.data()) : [];
  const users  = usersSnap  ? usersSnap.docs.map((d) => ({ id: d.id, ...d.data() as Record<string, unknown> })) : [];

  const s = buildOrderStats(orders);

  let depots = 0, nbDepots = 0;
  let retraits = 0, nbRetraits = 0;
  let rembs = 0, nbRembs = 0;
  for (const a of acts) {
    const amt = asNumber(a.amount);
    const typ = asString(a.type);
    if (typ === "depot")              { depots += amt; nbDepots++; }
    else if (typ === "retrait")       { retraits += amt; nbRetraits++; }
    else if (typ === "remboursement") { rembs += amt; nbRembs++; }
  }

  const spendMap: Record<string, number> = {};
  for (const o of orders) {
    const uid = asString((o as any).userId);
    const pr  = asNumber((o as any).price ?? (o as any).finalCost ?? 0);
    if (uid) spendMap[uid] = (spendMap[uid] || 0) + pr;
  }
  const topUsers = Object.entries(spendMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([uid, spent]) => {
      const u    = users.find((x) => x.id === uid);
      const name = asString((u as any)?.name ?? (u as any)?.username, "Inconnu");
      return { name, spent };
    });

  const newUsers = users.filter((u) => asString((u as any).createdAt) >= from.toISOString()).length;

  const now        = new Date();
  const monthLabel = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "Africa/Douala" }).toUpperCase();

  let msg = `📊 *BILAN MENSUEL — ${monthLabel}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🕙 ${watDateStr(now)} à ${watTimeStr(now)}\n\n`;

  msg += `📦 *COMMANDES : ${s.totalOrders}*\n`;
  msg += `├─ 🔵 Standard : ${s.byType.standard.count}\n`;
  msg += `├─ 🟣 Automatique : ${s.byType.automatique.count}\n`;
  msg += `├─ 🟢 Revendeur : ${s.byType.revendeur.count}\n`;
  msg += `└─ 🟠 Avancée : ${s.byType.avancee.count}\n\n`;

  msg += buildFinanceSection(s);

  msg += `\n💳 *PAIEMENTS DU MOIS*\n`;
  msg += `├─ 📥 Dépôts (${nbDepots}) : ${f(depots)} FCFA\n`;
  msg += `├─ 📤 Retraits (${nbRetraits}) : ${f(retraits)} FCFA\n`;
  msg += `└─ 💸 Remboursements (${nbRembs}) : ${f(rembs)} FCFA\n\n`;

  msg += `📈 *STATUTS COMMANDES*\n`;
  msg += `├─ ✅ Succès : ${s.status.success}   🔄 En cours : ${s.status.inProgress}\n`;
  msg += `└─ ⏳ En attente : ${s.status.pending}   ❌ Annulé : ${s.status.cancelled}\n\n`;

  if (s.topPlatforms.length > 0) {
    msg += `🌐 *TOP PLATEFORMES*\n`;
    s.topPlatforms.forEach(([pl, cnt], i) => {
      msg += `${i === s.topPlatforms.length - 1 ? "└─" : "├─"} ${pl} : ${cnt} cmd\n`;
    });
    msg += "\n";
  }

  if (topUsers.length > 0) {
    msg += `🏆 *TOP CLIENTS*\n`;
    ["🥇", "🥈", "🥉"].slice(0, topUsers.length).forEach((medal, i) => {
      msg += `${medal} ${topUsers[i].name} — ${f(topUsers[i].spent)} FCFA\n`;
    });
    msg += "\n";
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👥 Utilisateurs actifs : ${s.activeUsers}\n`;
  msg += `🆕 Nouveaux inscrits : ${newUsers}\n`;
  msg += `📈 *Marge globale estimée : ${s.overallMargin} %*\n\n`;
  msg += `💡 Bénéfice net = CA − (CA / multiplicateur fournisseur)\n`;
  msg += `   ExoSupplier ×2 · MTP ×3 · SMMGen ×3.5 · AfriqueBoost ×1.82`;

  await sendWhatsApp(msg);
  console.log("[reports] ✅ Rapport mensuel terminé");
}

async function sendConsolidatedEmailReport(type: "daily" | "weekly" | "monthly"): Promise<void> {
  console.log(`[reports] Génération rapport email consolidé (${type})...`);
  const db  = getDB();
  const now = new Date();

  let from: Date;
  let periodLabel: string;

  if (type === "daily") {
    from = startOfDayWAT();
    periodLabel = watDateStr(now);
  } else if (type === "weekly") {
    from = startOfWeekWAT();
    periodLabel = `Semaine du ${watDateStr(from)}`;
  } else {
    from = startOfMonthWAT();
    periodLabel = now.toLocaleString("fr-FR", { month: "long", year: "numeric", timeZone: "Africa/Douala" });
  }

  const fromIso = from.toISOString();

  const [ordersSnap, actsSnap, newUsersSnap] = await Promise.all([
    db.collection("commandes").where("createdAt", ">=", fromIso).get().catch(() => null),
    db.collection("activites").where("createdAt", ">=", fromIso).get().catch(() => null),
    db.collection("users").where("createdAt", ">=", fromIso).get().catch(() => null),
  ]);

  const orders: Order[] = ordersSnap ? ordersSnap.docs.map((d) => d.data() as Order) : [];
  const s = buildOrderStats(orders);

  const acts = actsSnap ? actsSnap.docs.map((d) => d.data()) : [];
  let deposits = 0, nbDeposits = 0;
  let withdrawals = 0, nbWithdrawals = 0;
  let refunds = 0, referralsPaid = 0;

  for (const a of acts) {
    const amt = asNumber(a.amount);
    const typ = asString(a.type);
    if (typ === "depot")              { deposits += amt; nbDeposits++; }
    else if (typ === "retrait")       { withdrawals += amt; nbWithdrawals++; }
    else if (typ === "remboursement") { refunds += amt; }
    else if (typ === "parrainage")    { referralsPaid += amt; }
  }

  const newUsers = newUsersSnap ? newUsersSnap.size : 0;
  const net = deposits - withdrawals - refunds;

  await sendConsolidatedAdminReport(REPORTS_ADMIN_EMAIL, type, periodLabel, {
    newUsers,
    orders: s.totalOrders,
    revenue: s.revenue,
    profit: s.totalProfit,
    margin: s.overallMargin,
    deposits,
    nbDeposits,
    withdrawals,
    nbWithdrawals,
    refunds,
    net,
    referralsPaid,
  });

  await markEmailReportSent(type);
  console.log(`[reports] ✅ Rapport email ${type} envoyé à ${REPORTS_ADMIN_EMAIL}`);
}

const EMAIL_REPORT_TRACK_DOC = "_system/emailReportSentAt";

async function getLastEmailReportSent(type: "daily" | "weekly" | "monthly"): Promise<Date | null> {
  try {
    const snap = await getDB().doc(EMAIL_REPORT_TRACK_DOC).get();
    const val  = snap.data()?.[type];
    return val ? new Date(String(val)) : null;
  } catch { return null; }
}

async function markEmailReportSent(type: "daily" | "weekly" | "monthly"): Promise<void> {
  try {
    await getDB().doc(EMAIL_REPORT_TRACK_DOC).set(
      { [type]: new Date().toISOString() },
      { merge: true }
    );
  } catch (e) { console.error("[reports] ❌ markEmailReportSent:", e); }
}

function isEmailReportOverdue(
  type: "daily" | "weekly" | "monthly",
  lastSent: Date | null
): boolean {
  const now = new Date();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();

  if (type === "daily") {
    if (h < 22 || (h === 22 && m < 45)) return false;
    if (!lastSent) return true;
    const todayTrigger = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 22, 45));
    return lastSent < todayTrigger;
  }

  if (type === "weekly") {
    if (now.getUTCDay() !== 0 || h < 11) return false;
    if (!lastSent) return true;
    const thisSundayTrigger = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11, 0));
    return lastSent < thisSundayTrigger;
  }

  if (type === "monthly") {
    if (now.getUTCDate() !== 1) return false;
    if (!lastSent) return true;
    const thisMonthTrigger = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return lastSent < thisMonthTrigger;
  }

  return false;
}

async function checkOverdueEmailReports(): Promise<void> {
  const [dailyLast, weeklyLast, monthlyLast] = await Promise.all([
    getLastEmailReportSent("daily"),
    getLastEmailReportSent("weekly"),
    getLastEmailReportSent("monthly"),
  ]);

  const checks: Array<["daily" | "weekly" | "monthly", Date | null]> = [
    ["daily",   dailyLast],
    ["weekly",  weeklyLast],
    ["monthly", monthlyLast],
  ];

  for (const [type, lastSent] of checks) {
    if (isEmailReportOverdue(type, lastSent)) {
      console.log(`[reports] ⚡ Rapport email ${type} en retard — envoi de rattrapage`);
      sendConsolidatedEmailReport(type).catch((e) =>
        console.error(`[reports] ❌ Rattrapage ${type}:`, e)
      );
    }
  }
}

const MAX_TIMEOUT_MS = 2_147_483_647;

function safeTimeout(fn: () => void, delayMs: number): void {
  if (delayMs <= MAX_TIMEOUT_MS) {
    setTimeout(fn, delayMs);
  } else {
    setTimeout(() => safeTimeout(fn, delayMs - MAX_TIMEOUT_MS), MAX_TIMEOUT_MS);
  }
}

function msUntilNextUTC(hourUTC: number, minUTC: number, dayOfWeek = -1, dayOfMonth = -1): number {
  const now  = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUTC, minUTC, 0, 0));

  if (dayOfMonth >= 1) {
    let target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dayOfMonth, hourUTC, minUTC, 0, 0));
    if (target <= now) {
      target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, dayOfMonth, hourUTC, minUTC, 0, 0));
    }
    return Math.max(target.getTime() - now.getTime(), 1000);
  }
  if (dayOfWeek >= 0) {
    let daysUntil = (dayOfWeek - now.getUTCDay() + 7) % 7;
    if (daysUntil === 0 && next <= now) daysUntil = 7;
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntil, hourUTC, minUTC, 0, 0));
    return Math.max(target.getTime() - now.getTime(), 1000);
  }
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(next.getTime() - now.getTime(), 1000);
}

function monthlyTriggerDay(): number {
  const now     = new Date();
  const lastDay = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
  return Math.min(30, lastDay);
}

function scheduleRecurring(
  name: string,
  fn: () => Promise<void>,
  hourUTC: number, minUTC: number,
  dayOfWeek = -1, isMonthly = false, fixedDayOfMonth = -1
): void {
  const dayOfMonth = fixedDayOfMonth >= 1 ? fixedDayOfMonth : (isMonthly ? monthlyTriggerDay() : -1);
  const delay      = msUntilNextUTC(hourUTC, minUTC, dayOfWeek, dayOfMonth);
  const delayH     = (delay / 3600000).toFixed(2);
  console.log(`[reports] ⏰ ${name} — dans ${delayH}h`);

  safeTimeout(() => {
    console.log(`[reports] 🔔 ${name}`);
    fn()
      .catch((e) => console.error(`[reports] ❌ ${name}:`, e))
      .finally(() => scheduleRecurring(name, fn, hourUTC, minUTC, dayOfWeek, isMonthly, fixedDayOfMonth));
  }, delay);
}

export function startReportScheduler(): void {
  console.log("[reports] 🚀 Démarrage du planificateur...");
  scheduleRecurring("Rapport journalier commandes",   sendDailyOrderReport,   22, 10);
  scheduleRecurring("Rapport journalier paiements",   sendDailyPaymentReport, 22, 15);
  scheduleRecurring("Rapport hebdo commandes",        sendWeeklyOrderReport,  8,  5,  1);
  scheduleRecurring("Rapport hebdo paiements",        sendWeeklyPaymentReport, 8, 10, 1);
  scheduleRecurring("Rapport mensuel",                sendMonthlyReport,      7,  0,  -1, true);

  scheduleRecurring("Rapport email journalier (admin)", () => sendConsolidatedEmailReport("daily"),   22, 45);
  scheduleRecurring("Rapport email hebdo (admin)",      () => sendConsolidatedEmailReport("weekly"),  11,  0, 0);
  scheduleRecurring("Rapport email mensuel (admin)",    () => sendConsolidatedEmailReport("monthly"),  0,  0, -1, false, 1);

  setTimeout(() => {
    checkOverdueEmailReports().catch((e) =>
      console.error("[reports] ❌ checkOverdue (boot):", e)
    );
  }, 5_000);

  setInterval(() => {
    checkOverdueEmailReports().catch((e) =>
      console.error("[reports] ❌ checkOverdue (interval):", e)
    );
  }, 15 * 60 * 1000);

  console.log("[reports] ✅ Tous les rapports planifiés");
}

const REPORTS_ADMIN_EMAIL = "mcexauofficiel@gmail.com";

async function isAdmin(req: AuthRequest): Promise<boolean> {
  try {
    const user = await getFirebaseAdmin().auth().getUser(req.uid!);
    return user.email === REPORTS_ADMIN_EMAIL;
  } catch { return false; }
}

router.post("/reports/daily/orders", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req))) { res.status(403).json({ error: "Accès refusé" }); return; }
  res.json({ success: true, message: "Rapport journalier commandes en cours — vérifiez WhatsApp." });
  sendDailyOrderReport().catch(() => {});
});

router.post("/reports/daily/payments", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req))) { res.status(403).json({ error: "Accès refusé" }); return; }
  res.json({ success: true, message: "Rapport journalier paiements en cours." });
  sendDailyPaymentReport().catch(() => {});
});

router.post("/reports/weekly/orders", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req))) { res.status(403).json({ error: "Accès refusé" }); return; }
  res.json({ success: true, message: "Rapport hebdomadaire commandes en cours." });
  sendWeeklyOrderReport().catch(() => {});
});

router.post("/reports/weekly/payments", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req))) { res.status(403).json({ error: "Accès refusé" }); return; }
  res.json({ success: true, message: "Rapport hebdomadaire paiements en cours." });
  sendWeeklyPaymentReport().catch(() => {});
});

router.post("/reports/monthly", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await isAdmin(req))) { res.status(403).json({ error: "Accès refusé" }); return; }
  res.json({ success: true, message: "Bilan mensuel en cours." });
  sendMonthlyReport().catch(() => {});
});

router.post("/reports/test-now", async (_req, res: Response) => {
  res.json({ success: true, message: "Envoi des 5 rapports en cours — vérifiez votre WhatsApp dans quelques secondes." });
  const all = [
    sendDailyOrderReport(),
    sendDailyPaymentReport(),
    sendWeeklyOrderReport(),
    sendWeeklyPaymentReport(),
    sendMonthlyReport(),
  ];
  Promise.allSettled(all).then((results) => {
    results.forEach((r, i) => {
      if (r.status === "rejected") console.error(`[reports/test-now] rapport ${i} échoué:`, r.reason);
    });
    console.log("[reports/test-now] ✅ Tous les rapports traités");
  });
});

export default router;