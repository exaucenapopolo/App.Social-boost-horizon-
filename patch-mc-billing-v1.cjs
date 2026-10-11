#!/usr/bin/env node
'use strict';
// Social Boost Horizon — 1 demande Mč gratuite par jour, puis 50–150 XAF.
// Le débit et le quota sont autoritaires côté serveur et conservés dans Firestore.
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const FILES = {
  providers: path.join(ROOT, 'artifacts/api-server/src/routes/providers.ts'),
  mcSearch: path.join(ROOT, 'artifacts/mobile/components/McSearch.tsx'),
};
function abort(message) {
  console.error('\nERREUR : ' + message + '\nAucun fichier n’a été écrit. Vérifie que tu es à la racine du dépôt.\n');
  process.exit(1);
}
for (const f of Object.values(FILES)) if (!fs.existsSync(f)) abort('Fichier introuvable : ' + path.relative(ROOT, f));
if (!fs.existsSync(path.join(ROOT, 'package.json'))) abort('package.json introuvable à la racine.');
function readNormalized(file) {
  const original = fs.readFileSync(file, 'utf8');
  return { original, eol: original.includes('\r\n') ? '\r\n' : '\n', text: original.replace(/\r\n/g, '\n') };
}
function occurrences(text, needle) {
  let count = 0, from = 0, at;
  while ((at = text.indexOf(needle, from)) !== -1) { count++; from = at + needle.length; }
  return count;
}
function replaceOne(text, needle, replacement, label) {
  const n = occurrences(text, needle);
  if (n !== 1) abort('Repère « ' + label + ' » attendu une fois, trouvé : ' + n + '.');
  return text.replace(needle, replacement);
}
const pFile = readNormalized(FILES.providers);
const mFile = readNormalized(FILES.mcSearch);
let p = pFile.text;
let m = mFile.text;
if (p.includes('MC_BILLING_V1') || m.includes('MC_BILLING_V1')) abort('Le patch est déjà présent. Ne le relance pas.');

const helpers = String.raw`

// MC_BILLING_V1 — facturation et quota quotidien côté serveur.
// Le solde réel reste en XAF; le prix USD est un affichage approximatif uniquement.
const MC_USD_XAF_RATE = 585.5;
type McBillingReservation = {
  uid: string; requestId: string; dayKey: string; isFree: boolean;
  baseXAF: number; reservedXAF: number; startedAtMs: number; active: boolean;
};
function getMcDayKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return pick("year") + "-" + pick("month") + "-" + pick("day");
}
function estimateMcPrice(messageText: string, isComparison: boolean, hasServiceContext: boolean): { baseXAF: number; reserveXAF: number } {
  const text = String(messageText ?? "").trim();
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let baseXAF = 50;
  if (isComparison) baseXAF = 100;
  else if (hasServiceContext || /conseil|conseille|strategie|pourquoi|baisse|perte|garantie|refill|reappro|optimis|amelior|plan|explique|comprendre|information|condition/.test(normalized)) baseXAF = 75;
  if (text.length > 220) baseXAF = Math.max(baseXAF, 100);
  if (text.length > 500) baseXAF = Math.max(baseXAF, 125);
  if (text.length > 1000) baseXAF = 150;
  baseXAF = Math.max(50, Math.min(150, Math.round(baseXAF)));
  return { baseXAF, reserveXAF: Math.min(150, baseXAF + (baseXAF >= 100 ? 50 : 25)) };
}
function finalMcPrice(baseXAF: number, reserveXAF: number, durationMs: number): number {
  const timeSurcharge = durationMs < 2500 ? 0 : durationMs < 7000 ? 10 : durationMs < 15000 ? 25 : 50;
  return Math.max(50, Math.min(150, reserveXAF, baseXAF + timeSurcharge));
}
async function rollbackMcReservation(reservation: McBillingReservation): Promise<void> {
  if (!reservation.active) return;
  const db = getFirestore();
  const userRef = db.doc("users/" + reservation.uid);
  const dailyRef = userRef.collection("mcDailyUsage").doc(reservation.dayKey);
  const requestRef = userRef.collection("mcRequests").doc(reservation.requestId);
  await db.runTransaction(async (tx) => {
    const [userSnap, dailySnap, requestSnap] = await Promise.all([tx.get(userRef), tx.get(dailyRef), tx.get(requestRef)]);
    if (!requestSnap.exists) return;
    const requestData = requestSnap.data() ?? {};
    if (requestData.status !== "processing") return;
    const daily = dailySnap.data() ?? {};
    if (requestData.free === true) {
      if (daily.freeRequestId === reservation.requestId) tx.set(dailyRef, { freeUsed: false, freeRequestId: null, totalRequests: Math.max(0, (Number(daily.totalRequests) || 0) - 1), updatedAt: new Date().toISOString() }, { merge: true });
    } else if (userSnap.exists) {
      const balance = Math.max(0, Number(userSnap.data()?.balance ?? 0) || 0);
      const reserved = Math.max(0, Number(requestData.reservedXAF ?? reservation.reservedXAF) || 0);
      tx.update(userRef, { balance: balance + reserved });
      tx.set(dailyRef, {
        paidRequests: Math.max(0, (Number(daily.paidRequests) || 0) - 1),
        totalRequests: Math.max(0, (Number(daily.totalRequests) || 0) - 1), updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
    tx.update(requestRef, { status: "failed_refunded", reservedXAF: 0, chargedXAF: 0, failedAt: new Date().toISOString() });
  });
  reservation.active = false;
  invalidateProfileCache(reservation.uid);
  invalidateWalletCache(reservation.uid);
}
async function settleMcReservation(reservation: McBillingReservation, durationMs: number): Promise<{
  chargedXAF: number; balanceXAF: number; freeRequestsRemaining: number; paidRequestsToday: number;
}> {
  const chargedXAF = reservation.isFree ? 0 : finalMcPrice(reservation.baseXAF, reservation.reservedXAF, durationMs);
  const db = getFirestore();
  const userRef = db.doc("users/" + reservation.uid);
  const dailyRef = userRef.collection("mcDailyUsage").doc(reservation.dayKey);
  const requestRef = userRef.collection("mcRequests").doc(reservation.requestId);
  const activityRef = db.collection("activites").doc("mc-" + reservation.uid + "-" + reservation.requestId);
  const result = await db.runTransaction(async (tx) => {
    const [userSnap, dailySnap, requestSnap] = await Promise.all([tx.get(userRef), tx.get(dailyRef), tx.get(requestRef)]);
    if (!userSnap.exists || !requestSnap.exists || requestSnap.data()?.status !== "processing") throw new Error("État de facturation Mč incohérent.");
    const daily = dailySnap.data() ?? {};
    const balance = Math.max(0, Number(userSnap.data()?.balance ?? 0) || 0);
    const refund = Math.max(0, reservation.reservedXAF - chargedXAF);
    const settledBalance = balance + refund;
    if (refund > 0) tx.update(userRef, { balance: settledBalance });
    tx.update(requestRef, { status: "completed", reservedXAF: 0, chargedXAF, durationMs, completedAt: new Date().toISOString(), pricingVersion: 1 });
    tx.set(dailyRef, { totalChargedXAF: Math.max(0, Number(daily.totalChargedXAF) || 0) + chargedXAF, updatedAt: new Date().toISOString() }, { merge: true });
    if (chargedXAF > 0) tx.set(activityRef, {
      userId: reservation.uid, type: "commande", label: "Demande à Mč", amount: chargedXAF,
      status: "completed", createdAt: new Date().toISOString(), source: "mc", mcRequestId: reservation.requestId, durationMs,
    });
    return { balanceXAF: settledBalance, freeRequestsRemaining: 0, paidRequestsToday: Math.max(0, Number(daily.paidRequests) || 0) };
  });
  reservation.active = false;
  invalidateProfileCache(reservation.uid);
  invalidateWalletCache(reservation.uid);
  return { chargedXAF, ...result };
}
`;
p = replaceOne(p, 'const router: ReturnType<typeof Router> = Router();\n', 'const router: ReturnType<typeof Router> = Router();\n' + helpers + '\n', 'helpers de facturation');
p = replaceOne(p, 'import mcKnowledge from "../knowledge/mc-knowledge.fr.md";\n', 'import mcKnowledge from "../knowledge/mc-knowledge.fr.md";\nimport { invalidateProfileCache } from "./me.js";\nimport { invalidateWalletCache } from "./wallet.js";\n', 'invalidation des caches');

const usageRoute = String.raw`router.get("/mc/usage", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const uid = req.uid!;
    const dayKey = getMcDayKey();
    const userRef = db.doc("users/" + uid);
    const dailyRef = userRef.collection("mcDailyUsage").doc(dayKey);
    const [userSnap, dailySnap] = await Promise.all([userRef.get(), dailyRef.get()]);
    if (!userSnap.exists) { res.status(404).json({ success: false, error: "Profil utilisateur introuvable." }); return; }
    const daily = dailySnap.data() ?? {};
    const user = userSnap.data() ?? {};
    res.json({ success: true, data: {
      dateKey: dayKey,
      freeRequestsRemaining: daily.freeUsed === true ? 0 : 1,
      paidRequestsToday: Math.max(0, Number(daily.paidRequests) || 0),
      balanceXAF: Math.max(0, Number(user.balance) || 0),
      usdXafRate: MC_USD_XAF_RATE,
    }});
  } catch (error) {
    console.error("[mc/usage] Erreur:", error);
    res.status(500).json({ success: false, error: "Impossible de vérifier le quota Mč." });
  }
});

`;
p = replaceOne(p,
  'router.post("/mc/chat", async (req: Request, res: ExpressResponse) => {\n  try {',
  usageRoute + 'router.post("/mc/chat", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {\n  let mcBillingReservation: McBillingReservation | null = null;\n  try {',
  'route quota et authentification');

const reserveCode = String.raw`    // Identité et quota contrôlés exclusivement côté serveur.
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestId)) { res.status(400).json({ success: false, error: "Identifiant de demande invalide." }); return; }
    getFirebaseAdmin();
    const billingDb = getFirestore();
    const uid = req.uid!;
    const dayKey = getMcDayKey();
    const userRef = billingDb.doc("users/" + uid);
    const dailyRef = userRef.collection("mcDailyUsage").doc(dayKey);
    const requestRef = userRef.collection("mcRequests").doc(requestId);
    const lastUserText = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const isComparisonRequest = comparisonCandidates.length === 2 || requestedComparisonRefs.length === 2 || /compare|comparaison|difference|différence|comparer/i.test(lastUserText);
    const pricePlan = estimateMcPrice(lastUserText, isComparisonRequest, Boolean(serviceContext));
    const reservationResult: any = await billingDb.runTransaction(async (tx) => {
      const [userSnap, dailySnap, requestSnap] = await Promise.all([tx.get(userRef), tx.get(dailyRef), tx.get(requestRef)]);
      if (!userSnap.exists) return { kind: "missing_user" };
      if (requestSnap.exists) return { kind: "duplicate_request" };
      const user = userSnap.data() ?? {};
      const daily = dailySnap.data() ?? {};
      const balanceXAF = Math.max(0, Number(user.balance) || 0);
      const isFree = daily.freeUsed !== true;
      const reservedXAF = isFree ? 0 : pricePlan.reserveXAF;
      if (!isFree && balanceXAF < reservedXAF) return { kind: "insufficient_balance", balanceXAF };
      if (!isFree) tx.update(userRef, { balance: balanceXAF - reservedXAF });
      tx.set(dailyRef, {
        dateKey: dayKey, freeUsed: true, freeRequestId: isFree ? requestId : (daily.freeRequestId ?? null),
        paidRequests: (Number(daily.paidRequests) || 0) + (isFree ? 0 : 1),
        totalRequests: (Number(daily.totalRequests) || 0) + 1, updatedAt: new Date().toISOString(),
      }, { merge: true });
      tx.create(requestRef, {
        requestId, userId: uid, dateKey: dayKey, status: "processing", free: isFree,
        baseXAF: isFree ? 0 : pricePlan.baseXAF, reservedXAF, chargedXAF: 0, createdAt: new Date().toISOString(),
      });
      return { kind: "reserved", isFree, baseXAF: isFree ? 0 : pricePlan.baseXAF, reservedXAF };
    });
    if (reservationResult.kind === "missing_user") { res.status(404).json({ success: false, error: "Profil utilisateur introuvable." }); return; }
    if (reservationResult.kind === "duplicate_request") { res.status(409).json({ success: false, error: "Cette demande a déjà été traitée; elle ne sera pas débitée une seconde fois." }); return; }
    if (reservationResult.kind === "insufficient_balance") {
      res.status(402).json({ success: false, code: "MC_INSUFFICIENT_BALANCE", error: "Ton solde ne suffit pas pour cette demande. Aucune somme n'a été débitée. Recharge ton solde puis réessaie.", balanceXAF: reservationResult.balanceXAF });
      return;
    }
    mcBillingReservation = {
      uid, requestId, dayKey, isFree: reservationResult.isFree, baseXAF: reservationResult.baseXAF,
      reservedXAF: reservationResult.reservedXAF, startedAtMs: Date.now(), active: true,
    };
    if (!mcBillingReservation.isFree) { invalidateProfileCache(uid); invalidateWalletCache(uid); }

`;
p = replaceOne(p, '    const groqRes = await fetch(GROQ_API_URL, {', reserveCode + '    const groqRes = await fetch(GROQ_API_URL, {', 'débit/réservation avant Groq');

// Remplacer uniquement le bloc de réponse HTTP Groq pour que le catch effectue le remboursement.
const groqFailureStart = p.indexOf('    if (!groqRes.ok) {', p.indexOf('const groqRes = await fetch(GROQ_API_URL'));
const groqFailureEndMarker = '    const groqData = await groqRes.json() as any;';
const groqFailureEnd = p.indexOf(groqFailureEndMarker, groqFailureStart);
if (groqFailureStart < 0 || groqFailureEnd < 0) abort('Bloc d’erreur Groq introuvable.');
p = p.slice(0, groqFailureStart) + `    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => "");
      console.error("[mc/chat] Groq error:", groqRes.status, errText.slice(0, 500));
      throw new Error("Mč est temporairement indisponible.");
    }

` + p.slice(groqFailureEnd);

const settlement = String.raw`    if (!mcBillingReservation) throw new Error("Réservation de facturation manquante.");
    const mcDurationMs = Math.max(0, Date.now() - mcBillingReservation.startedAtMs);
    const mcChargedXAF = mcBillingReservation.isFree ? 0 : finalMcPrice(mcBillingReservation.baseXAF, mcBillingReservation.reservedXAF, mcDurationMs);
    const mcSettlement = await settleMcReservation(mcBillingReservation, mcDurationMs);
    mcBillingReservation.active = false;
    const mcBilling = {
      isFree: mcBillingReservation.isFree,
      chargedXAF: mcChargedXAF,
      chargedUSD: Number((mcChargedXAF / MC_USD_XAF_RATE).toFixed(2)),
      balanceXAF: mcSettlement.balanceXAF,
      freeRequestsRemaining: mcSettlement.freeRequestsRemaining,
      paidRequestsToday: mcSettlement.paidRequestsToday,
      durationMs: mcDurationMs,
      usdXafRate: MC_USD_XAF_RATE,
    };

`;
p = replaceOne(p, '    const idsFromKeys = recommendationKeys\n', settlement + '    const idsFromKeys = recommendationKeys\n', 'calcul du coût final et règlement');
p = replaceOne(p, '      recommendations: legacyIds.length ? legacyIds : idsFromKeys,\n', '      recommendations: legacyIds.length ? legacyIds : idsFromKeys,\n      billing: mcBilling,\n', 'données de facturation dans la réponse API');

const oldOuterCatch = `  } catch (e: any) {
    console.error("[mc/chat] Erreur:", e?.message);
    res.status(500).json({ success: false, error: "Une erreur est survenue pendant la réponse de Mč." });
  }
});`;
const newOuterCatch = `  } catch (e: any) {
    if (mcBillingReservation?.active) {
      try { await rollbackMcReservation(mcBillingReservation); }
      catch (refundError) { console.error("[mc/chat] Remboursement de sécurité impossible:", refundError); }
    }
    console.error("[mc/chat] Erreur:", e?.message);
    const wasReserved = Boolean(mcBillingReservation);
    res.status(wasReserved ? 502 : 500).json({
      success: false,
      error: wasReserved
        ? "Mč est temporairement indisponible. La réservation a été annulée lorsque cela a été possible; vérifie ton solde avant de réessayer."
        : "Une erreur est survenue pendant la préparation de la demande Mč.",
    });
  }
});`;
p = replaceOne(p, oldOuterCatch, newOuterCatch, 'remboursement automatique en cas d’échec');

// MOBILE — authentification, compteur de gratuité et prix affiché après réponse.
m = replaceOne(m, 'import { BASE_URL } from "@/services/api";\n', 'import { BASE_URL } from "@/services/api";\nimport { getFreshToken } from "@/services/tokenStore";\n', 'import du token Firebase mobile');

const oldMessageTypes = `interface McMessage {
  role: "user" | "assistant";
  content: string;
  recommendations?: any[];
  suggestions?: string[];
  isGreeting?: boolean;
}`;
const newMessageTypes = `interface McBillingInfo {
  isFree: boolean;
  chargedXAF: number;
  chargedUSD: number;
  balanceXAF: number;
  freeRequestsRemaining: number;
  paidRequestsToday: number;
  durationMs: number;
  usdXafRate: number;
}
interface McUsageInfo {
  freeRequestsRemaining: number;
  paidRequestsToday: number;
  balanceXAF: number;
  usdXafRate: number;
}
interface McMessage {
  role: "user" | "assistant";
  content: string;
  recommendations?: any[];
  suggestions?: string[];
  billing?: McBillingInfo;
  isGreeting?: boolean;
}`;
m = replaceOne(m, oldMessageTypes, newMessageTypes, 'types de facturation mobile');

m = replaceOne(
  m,
  '  const [showStarters, setShowStarters] = useState(true);\n  const scrollRef = useRef<ScrollView>(null);',
  '  const [showStarters, setShowStarters] = useState(true);\n  const [mcUsage, setMcUsage] = useState<McUsageInfo | null>(null);\n  const [mcUsageError, setMcUsageError] = useState("");\n  const scrollRef = useRef<ScrollView>(null);',
  'état de quota quotidien'
);

const refreshUsageBlock = `  const firstName = (userName || "").split(" ")[0] || "";

  const refreshMcUsage = useCallback(async () => {
    const token = await getFreshToken();
    if (!token) {
      setMcUsageError("Connecte-toi pour consulter tes demandes Mč.");
      return;
    }
    const response = await fetch(BASE_URL + "api/mc/usage", {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    });
    const payload = await response.json().catch(() => ({} as any));
    if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error ?? "Impossible de vérifier tes demandes Mč.");
    setMcUsage({
      freeRequestsRemaining: Number(payload.data.freeRequestsRemaining) > 0 ? 1 : 0,
      paidRequestsToday: Math.max(0, Number(payload.data.paidRequestsToday) || 0),
      balanceXAF: Math.max(0, Number(payload.data.balanceXAF) || 0),
      usdXafRate: Number(payload.data.usdXafRate) > 0 ? Number(payload.data.usdXafRate) : 585.5,
    });
    setMcUsageError("");
  }, []);

  useEffect(() => {
    if (!visible) return;
    refreshMcUsage().catch((error: unknown) => {
      setMcUsageError(error instanceof Error ? error.message : "Impossible de vérifier les demandes Mč.");
    });
  }, [visible, refreshMcUsage]);
`;
m = replaceOne(m, '  const firstName = (userName || "").split(" ")[0] || "";\n', refreshUsageBlock, 'chargement du quota lors de l’ouverture de Mč');

m = replaceOne(m, 'Promise<{ reply: string; recommendations: any[]; suggestions?: string[] }> => {', 'Promise<{ reply: string; recommendations: any[]; suggestions?: string[]; billing?: McBillingInfo }> => {', 'type de retour de callAI avec facturation');

// Tous les messages envoyés au mode IA doivent consommer la gratuité ou être facturés côté serveur.
const localBypass = `      // Recherche simple : répondre localement, sans appel IA. N'afficher des cartes
      // que si le client cherche réellement des services/offres.
      if (!suppliedServices.length && !asksForExplanation && localResult.confidence === "high" && localResult.results.length >= 3) {
        return {
          reply: mcPublicText(buildLocalResponse(lastUserQuery, localResult, userName)),
          recommendations: asksForCatalog ? localResult.results.slice(0, 6).map((r) => r.svc) : [],
        };
      }

`;
m = replaceOne(m, localBypass, '', 'suppression de la réponse IA locale non facturée');

// Remplacer le bloc de fetch jusqu’à la normalisation des suggestions, sans toucher le moteur de recherche.
const fetchStartMarker = '      try {\n        const res = await fetch(`${BASE_URL}api/mc/chat`, {';
const fetchStart = m.indexOf(fetchStartMarker);
const fetchEndMarker = '        const responseSuggestions: string[] = Array.isArray(data.suggestions)';
const fetchEnd = m.indexOf(fetchEndMarker, fetchStart);
if (fetchStart < 0 || fetchEnd < 0) abort('Bloc d’appel mobile /api/mc/chat introuvable.');
const newFetchPrefix = `      const token = await getFreshToken();
      if (!token) throw new Error("Reconnecte-toi pour utiliser Mč.");
      const requestId = "mc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
      try {
        const res = await fetch(BASE_URL + "api/mc/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({
            requestId,
            messages: userMessages.slice(-8).map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, 1500) })),
            displayName: firstName,
            candidateServices,
            serviceContext: firstContext,
            comparisonRefs: isCompareContext ? candidateServices.slice(0, 2).map((svc: any) => svc.key) : [],
          }),
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data.success) {
          const error = new Error(String(data.error ?? ("La demande Mč a échoué (HTTP " + res.status + ").")));
          (error as Error & { status?: number }).status = res.status;
          throw error;
        }
        if (data.billing) {
          setMcUsage((previous) => ({
            ...(previous ?? { freeRequestsRemaining: 0, paidRequestsToday: 0, balanceXAF: 0, usdXafRate: 585.5 }),
            freeRequestsRemaining: Number(data.billing.freeRequestsRemaining) > 0 ? 1 : 0,
            paidRequestsToday: Math.max(0, Number(data.billing.paidRequestsToday) || 0),
            balanceXAF: Math.max(0, Number(data.billing.balanceXAF) || 0),
            usdXafRate: Number(data.billing.usdXafRate) > 0 ? Number(data.billing.usdXafRate) : 585.5,
          }));
          setMcUsageError("");
        }
`;
m = m.slice(0, fetchStart) + newFetchPrefix + m.slice(fetchEnd);

m = replaceOne(
  m,
  `        return {
          reply: formatMcReply(data.reply || "Voici ce que les informations disponibles permettent de confirmer."),
          recommendations,
          suggestions: responseSuggestions,
        };`,
  `        return {
          reply: formatMcReply(data.reply || "Voici ce que les informations disponibles permettent de confirmer."),
          recommendations,
          suggestions: responseSuggestions,
          billing: data.billing as McBillingInfo | undefined,
        };`,
  'retour du coût facturé au message'
);

// Supprimer le fallback local en cas d’erreur : cela empêcherait le quota/le débit d’être respecté.
const callAIStart = m.indexOf('  const callAI = useCallback(');
const callCatchStartMarker = '      } catch (_error) {';
const callCatchStart = m.indexOf(callCatchStartMarker, callAIStart);
const callCatchEndMarker = '      }\n    },\n    [allServices, userName, initialService, initialServices]\n  );';
const callCatchEnd = m.indexOf(callCatchEndMarker, callCatchStart);
if (callAIStart < 0 || callCatchStart < 0 || callCatchEnd < 0) abort('Bloc de fallback local de callAI introuvable.');
const noFreeFallback = `      } catch (error) {
        // La route contrôle la facturation; on ne répond jamais gratuitement par fallback.
        throw error;
      }
    },
    [allServices, userName, initialService, initialServices]
  );`;
m = m.slice(0, callCatchStart) + noFreeFallback + m.slice(callCatchEnd + callCatchEndMarker.length);

// Afficher une erreur utile si le solde est insuffisant ou si l’utilisateur n’est plus connecté.
const handleSendStart = m.indexOf('  const handleSend = useCallback(');
const handleCatchStart = m.indexOf('    } catch (e: any) {', handleSendStart);
const handleCatchEnd = m.indexOf('    } finally {', handleCatchStart);
if (handleSendStart < 0 || handleCatchStart < 0 || handleCatchEnd < 0) abort('Bloc d’erreur de handleSend introuvable.');
const friendlyCatch = `    } catch (e: any) {
      const errorMessage = e?.status === 402
        ? "Ton solde ne suffit pas pour cette demande. Aucune somme n'a été débitée. Recharge ton compte, puis réessaie."
        : e?.status === 401
        ? "Reconnecte-toi pour utiliser Mč."
        : (typeof e?.message === "string" && e.message.length < 220
            ? e.message
            : "Mč est temporairement indisponible. Aucune somme ne sera conservée pour une demande qui échoue.");
      setMessages(prev => [...prev, { role: "assistant", content: errorMessage }]);
`;
m = m.slice(0, handleCatchStart) + friendlyCatch + m.slice(handleCatchEnd);

m = replaceOne(
  m,
  '      const { reply, recommendations, suggestions } = await callAI(nextMessages, text);\n      const publicReply = formatMcReply(reply);\n      setMessages(prev => [...prev, { role: "assistant", content: publicReply, recommendations, suggestions }]);',
  '      const { reply, recommendations, suggestions, billing } = await callAI(nextMessages, text);\n      const publicReply = formatMcReply(reply);\n      setMessages(prev => [...prev, { role: "assistant", content: publicReply, recommendations, suggestions, billing }]);',
  'ajout du coût dans le message'
);

const quotaUi = `            {(mcUsage || mcUsageError) && (
              <View style={{ marginHorizontal: 14, marginTop: 9, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.accent + "35", backgroundColor: C.accent + "0A", flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name={mcUsage && mcUsage.freeRequestsRemaining > 0 ? "gift" : "credit-card"} size={14} color={C.accent} />
                <Text style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15, color: C.textSecondary }}>
                  {mcUsage
                    ? (mcUsage.freeRequestsRemaining > 0
                        ? "Demande gratuite du jour : 1 restante."
                        : "Demande gratuite terminée pour aujourd’hui. Les prochaines demandes seront payantes.")
                    : mcUsageError}
                </Text>
              </View>
            )}

`;
m = replaceOne(m, '            {(initialService || (initialServices && initialServices.length > 0)) && (', quotaUi + '            {(initialService || (initialServices && initialServices.length > 0)) && (', 'compteur des demandes gratuites');

const billingUi = `        {!isUser && msg.billing && (
          <View style={{ marginTop: 6, marginBottom: 2, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Feather name={msg.billing.isFree ? "gift" : "credit-card"} size={11} color={C.textMuted} />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: C.textMuted }}>
              {msg.billing.isFree
                ? "Demande gratuite du jour · $0.00"
                : "Coût de cette réponse : $" + Number(msg.billing.chargedUSD || 0).toFixed(2)}
            </Text>
          </View>
        )}
`;
m = replaceOne(m, '        {!isUser && msg.suggestions && msg.suggestions.length > 0 && (', billingUi + '        {!isUser && msg.suggestions && msg.suggestions.length > 0 && (', 'coût final affiché sous la réponse');

if (!p.includes('router.get("/mc/usage", requireAuth')) abort('Contrôle final : endpoint usage absent.');
if (!p.includes('router.post("/mc/chat", requireAuth')) abort('Contrôle final : /mc/chat n’est pas protégé.');
if (!m.includes('Authorization: "Bearer " + token')) abort('Contrôle final : token Firebase absent du mobile.');
if (!m.includes('billing: data.billing as McBillingInfo | undefined')) abort('Contrôle final : retour de facturation absent du mobile.');
if (!m.includes('Demande gratuite du jour : 1 restante.')) abort('Contrôle final : indicateur de quota absent.');

const d = new Date();
const stamp = d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '-' + String(d.getHours()).padStart(2,'0') + String(d.getMinutes()).padStart(2,'0') + String(d.getSeconds()).padStart(2,'0');
const backupDir = path.join(ROOT, '.backup-mc-billing-' + stamp);
fs.mkdirSync(backupDir, { recursive: false });
fs.writeFileSync(path.join(backupDir, 'providers.original'), pFile.original, 'utf8');
fs.writeFileSync(path.join(backupDir, 'mcSearch.original'), mFile.original, 'utf8');
try {
  fs.writeFileSync(FILES.providers, p.replace(/\n/g, pFile.eol), 'utf8');
  fs.writeFileSync(FILES.mcSearch, m.replace(/\n/g, mFile.eol), 'utf8');
} catch (error) {
  console.error('Écriture interrompue. Sauvegardes dans : ' + backupDir);
  console.error(error);
  process.exit(1);
}
console.log('\nPatch Mč billing appliqué.');
console.log('Sauvegardes : ' + path.relative(ROOT, backupDir));
console.log('Fichiers modifiés :');
console.log(' - ' + path.relative(ROOT, FILES.providers));
console.log(' - ' + path.relative(ROOT, FILES.mcSearch));
console.log('\n1 demande IA gratuite par jour et par UID Firebase, puis 50–150 XAF par demande.');
console.log('Le serveur réserve le solde avant Groq, refuse si le solde est insuffisant et rembourse toute demande en échec.');
console.log('L’interface montre le quota gratuit et le coût final approximatif en USD; le solde est débité en XAF.');
