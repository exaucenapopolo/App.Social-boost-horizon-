/**
 * pendingCredits.ts
 *
 * File d'attente en mémoire pour les crédits Firestore qui ont échoué
 * à cause d'un quota dépassé (RESOURCE_EXHAUSTED).
 *
 * Quand le webhook Fapshi ou SwychrConnect ne peut pas écrire dans Firestore,
 * le crédit est mis en file d'attente ici. Un timer réessaie toutes les 30s.
 * Dès que Firestore accepte à nouveau les écritures, le solde est crédité
 * et la notification push est envoyée à l'utilisateur.
 *
 * Persistance : sauvegarde sur disque dans /tmp/pending_credits.json
 * pour survivre aux redémarrages du serveur.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "./firebase-admin.js";
import { sendRechargeEmail } from "./email.js";
import { getUserPushToken, sendExpoPush } from "./push.js";

// Dossier data/ persistant (survit aux redémarrages du container)
// process.cwd() = racine du workspace ; compatible avec le bundle CJS
const DATA_DIR = resolve(process.cwd(), "artifacts/api-server/data");
const PERSIST_PATH = resolve(DATA_DIR, "pending_credits.json");
const RETRY_INTERVAL_MS = 30_000; // 30 secondes

// Créer le dossier si absent
try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* existe déjà */ }

export interface PendingCredit {
  id: string;           // identifiant unique (ex: fapshi_TRANSID)
  userId: string;
  amount: number;
  method: string;       // "Fapshi Mobile Money" | "Mobile Money International"
  transId: string;
  phone?: string;
  enqueuedAt: string;   // ISO date
  retries: number;
  lastRetryAt?: string;
}

// ── File d'attente en mémoire ─────────────────────────────────────────────
const queue = new Map<string, PendingCredit>();

// ── Persistance sur disque ────────────────────────────────────────────────
function saveToDisk(): void {
  try {
    const arr = Array.from(queue.values());
    writeFileSync(PERSIST_PATH, JSON.stringify(arr, null, 2), "utf8");
  } catch { /* non-critique */ }
}

function loadFromDisk(): void {
  try {
    if (!existsSync(PERSIST_PATH)) return;
    const arr: PendingCredit[] = JSON.parse(readFileSync(PERSIST_PATH, "utf8"));
    for (const c of arr) queue.set(c.id, c);
    if (queue.size > 0) {
      console.log(`[pendingCredits] 📂 ${queue.size} crédit(s) rechargés depuis le disque`);
    }
  } catch { /* fichier corrompu — ignorer */ }
}

// ── API publique ──────────────────────────────────────────────────────────

export function enqueuePendingCredit(credit: Omit<PendingCredit, "enqueuedAt" | "retries">): void {
  if (queue.has(credit.id)) return; // déjà en file
  const entry: PendingCredit = { ...credit, enqueuedAt: new Date().toISOString(), retries: 0 };
  queue.set(credit.id, entry);
  saveToDisk();
  console.log(`[pendingCredits] ⏳ Crédit mis en file: ${credit.id} — ${credit.amount} FCFA → ${credit.userId}`);
}

export function getPendingCount(): number {
  return queue.size;
}

// ── Traitement d'un crédit individuel ─────────────────────────────────────
async function processSingle(credit: PendingCredit): Promise<boolean> {
  try {
    getFirebaseAdmin();
    const db = getFirestore();

    const rechargeRef = db.collection("rechargements").doc(credit.id);
    let alreadyDone = false;
    let userName = "";
    let userEmail = "";
    let newBalanceAfter = 0;

    await db.runTransaction(async (t) => {
      const existing = await t.get(rechargeRef);
      if (existing.exists) {
        alreadyDone = true;
        return;
      }
      const userRef = db.doc(`users/${credit.userId}`);
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) return;

      const userData   = userDoc.data()!;
      userName = String(userData.name ?? "").split(" ")[0] || "";
      userEmail = String(userData.email ?? "");
      const currentBal = Number(userData.balance ?? 0);

      // ── Gestion de la dette avant de créditer ───────────────────────────
      const currentDebt = Number(userData.frozenDebt ?? 0);
      const isBlocked   = !!userData.blocked;
      let   creditToBalance = credit.amount;
      const pqUpdates: Record<string, unknown> = {};

      if (currentDebt > 0) {
        if (credit.amount >= currentDebt) {
          creditToBalance = credit.amount - currentDebt;
          pqUpdates.frozenDebt = 0;
          if (isBlocked) { pqUpdates.blocked = false; pqUpdates.blockedAt = null; }
        } else {
          creditToBalance = 0;
          pqUpdates.frozenDebt = currentDebt - credit.amount;
        }
      }

      newBalanceAfter = currentBal + creditToBalance;
      pqUpdates.balance = newBalanceAfter;
      t.update(userRef, pqUpdates);
      t.set(rechargeRef, {
        amount:        credit.amount,
        method:        credit.method,
        phone:         credit.phone ?? "",
        transactionId: credit.transId,
        transId:       credit.transId,
        status:        "confirmed",
        userId:        credit.userId,
        createdAt:     credit.enqueuedAt ?? new Date().toISOString(),
        creditedBy:    "pending-queue",
        depositNotifSent: false,
      });
      t.set(db.collection("activites").doc(), {
        userId:    credit.userId,
        type:      "depot",
        label:     `Dépôt ${credit.method} confirmé (récupéré)`,
        amount:    credit.amount,
        status:    "confirmed",
        transId:   credit.transId,
        createdAt: new Date().toISOString(),
      });
    });

    if (alreadyDone) {
      console.log(`[pendingCredits] ✅ ${credit.id} déjà traité — retiré de la file`);
      return true;
    }

    console.log(`[pendingCredits] ✅ ${credit.id} crédité — ${credit.amount} FCFA → ${credit.userId}`);

    // Notification push
    const greeting = userName ? `, ${userName}` : "";
    getUserPushToken(credit.userId).then((token) =>
      sendExpoPush(
        token,
        "💰 Rechargement confirmé !",
        `${credit.amount.toLocaleString("fr-FR")} FCFA ont bien été crédités sur votre solde${greeting}. Désolé pour le délai.`,
        { screen: "wallet" },
        "wallet"
      )
    ).catch(() => {});

    // Fire-and-forget recharge email
    if (userEmail) {
      sendRechargeEmail(userEmail, userName, credit.amount, credit.method ?? "Mobile Money", newBalanceAfter).catch(() => {});
    }

    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const isQuota = msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota exceeded");
    if (!isQuota) {
      console.error(`[pendingCredits] ❌ Erreur non-quota pour ${credit.id}:`, msg);
    }
    return false; // Garder en file, réessayer plus tard
  }
}

// ── Boucle de retry ───────────────────────────────────────────────────────
async function retryAll(): Promise<void> {
  if (queue.size === 0) return;

  console.log(`[pendingCredits] 🔄 Retry de ${queue.size} crédit(s) en attente...`);
  let processed = 0;

  for (const [id, credit] of queue) {
    const success = await processSingle(credit);
    if (success) {
      queue.delete(id);
      processed++;
    } else {
      // Mettre à jour le compteur de retry
      queue.set(id, {
        ...credit,
        retries: credit.retries + 1,
        lastRetryAt: new Date().toISOString(),
      });
    }
  }

  if (processed > 0) {
    console.log(`[pendingCredits] ✅ ${processed} crédit(s) traités avec succès`);
    saveToDisk();
  }
}

// ── Audit de démarrage ────────────────────────────────────────────────────
// Vérifie tous les paiements Fapshi "pending" des 24 dernières heures
// et enqueue ceux qui sont SUCCESSFUL mais non crédités.
async function startupAudit(): Promise<void> {
  const FAPSHI_BASE   = "https://live.fapshi.com";
  const FAPSHI_USER   = process.env.FAPSHI_API_USER   ?? "";
  const FAPSHI_SECRET = process.env.FAPSHI_SECRET_KEY ?? "";

  if (!FAPSHI_USER || !FAPSHI_SECRET) return;

  console.log("[pendingCredits] 🔍 Audit démarrage — scan des paiements non crédités des 24h...");

  try {
    const db = getFirestore();

    // Lire les rechargements pending
    let pendingDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    try {
      const snap = await db.collection("rechargements")
        .where("status", "==", "pending")
        .limit(100)
        .get();
      pendingDocs = snap.docs;
    } catch { /* quota dépassé — skip */ }

    // Lire les activites depot pending
    let actDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    try {
      const snap = await db.collection("activites")
        .where("status", "==", "pending")
        .where("type", "==", "depot")
        .limit(100)
        .get();
      actDocs = snap.docs;
    } catch { /* quota dépassé — skip */ }

    // Regrouper par transId
    const pendingMap = new Map<string, { transId: string; userId: string; amount: number; phone: string }>();

    for (const doc of pendingDocs) {
      const d = doc.data();
      const transId = String(d.transId ?? d.transactionId ?? "");
      if (!transId || pendingMap.has(transId)) continue;
      pendingMap.set(transId, {
        transId, userId: String(d.userId ?? ""),
        amount: Number(d.amount ?? 0), phone: String(d.phone ?? ""),
      });
    }
    for (const doc of actDocs) {
      const d = doc.data();
      const transId = String(d.transId ?? "");
      if (!transId || pendingMap.has(transId)) continue;
      pendingMap.set(transId, {
        transId, userId: String(d.userId ?? ""),
        amount: Number(d.amount ?? 0), phone: "",
      });
    }

    if (pendingMap.size === 0) {
      console.log("[pendingCredits] ✅ Audit: aucun paiement en attente trouvé");
      return;
    }

    console.log(`[pendingCredits] 🔍 Audit: ${pendingMap.size} paiement(s) à vérifier chez Fapshi`);
    let queued = 0;

    for (const entry of pendingMap.values()) {
      const { transId, userId, amount, phone } = entry;
      if (!userId || amount <= 0) continue;

      // Vérifier si déjà crédité
      try {
        const confirmed = await db.collection("rechargements").doc(`fapshi_${transId}`).get();
        if (confirmed.exists) continue; // Déjà crédité
      } catch { /* quota — continuer */ }

      // Vérifier chez Fapshi
      try {
        const r = await fetch(`${FAPSHI_BASE}/payment-status/${transId}`, {
          headers: { apiuser: FAPSHI_USER, apikey: FAPSHI_SECRET },
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) continue;
        const raw = await r.json() as Record<string, unknown>;
        const statusObj = (raw?.data ?? raw) as Record<string, unknown>;
        const st = String(statusObj?.status ?? raw?.status ?? "").toUpperCase();

        if (st === "SUCCESSFUL") {
          enqueuePendingCredit({
            id: `fapshi_${transId}`, userId, amount,
            method: "Fapshi Mobile Money", transId, phone,
          });
          queued++;
          console.log(`[pendingCredits] ✅ Audit: ${transId} → ${amount} FCFA → ${userId} (enqueued)`);
        }
      } catch { /* timeout ou erreur réseau */ }
    }

    console.log(`[pendingCredits] ✅ Audit terminé: ${queued}/${pendingMap.size} paiement(s) enqueued`);
  } catch (e: unknown) {
    console.error("[pendingCredits] Erreur audit:", (e as Error).message);
  }
}

// ── Démarrage ─────────────────────────────────────────────────────────────
let started = false;

export function startPendingCreditsProcessor(): void {
  if (started) return;
  started = true;

  // Charger les crédits persistés depuis le dernier redémarrage
  loadFromDisk();

  // Audit automatique 60s après le démarrage (laisse le temps à Firebase Admin de s'initialiser)
  setTimeout(() => {
    startupAudit().catch((e) => console.error("[pendingCredits] audit error:", e));
  }, 60_000);

  // Retry toutes les 30 secondes
  setInterval(() => {
    retryAll().catch((e) => console.error("[pendingCredits] retryAll error:", e));
  }, RETRY_INTERVAL_MS);

  console.log("[pendingCredits] ✅ Processeur démarré (retry 30s, audit startup dans 60s)");
}
