import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import {
  firestoreGet,
  firestoreSet,
  firestoreQuery,
  getFirebaseAdmin,
} from "../lib/firebase-admin.js";
import { saveNotifAndSendPush } from "../lib/push.js";
import { sendWelcomeEmail } from "../lib/email.js";

const router = Router();

// ── Cache check-referral — évite 1 lecture Firestore par frappe clavier ──
// Clé = code referral, valeur = { valid, name, expiresAt }
// TTL 24h: les codes changent rarement, et on invalide si jamais c'est faux.
const referralCache = new Map<string, { valid: boolean; name?: string; expiresAt: number }>();
const REFERRAL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

/**
 * GET /auth/check-referral?code=SBH-XXXXXX
 * Public — checks if a referral code exists and returns the parrain's first name.
 */
router.get("/auth/check-referral", async (req: Request, res: Response) => {
  const code = String(req.query.code ?? "").trim().toUpperCase();
  if (!code || code.length < 4) {
    res.json({ valid: false });
    return;
  }

  // Serve from cache if available (0 Firestore reads)
  const cached = referralCache.get(code);
  if (cached && Date.now() < cached.expiresAt) {
    res.json(cached.valid ? { valid: true, name: cached.name } : { valid: false });
    return;
  }

  try {
    // firestoreQuery has Admin SDK + REST fallback — much more reliable than raw Admin SDK
    const results = await firestoreQuery(
      "users",
      [{ field: "referralCode", value: code }],
      ""  // no user token needed — admin credentials used automatically
    );
    if (!results || results.length === 0) {
      referralCache.set(code, { valid: false, expiresAt: Date.now() + REFERRAL_CACHE_TTL });
      res.json({ valid: false });
      return;
    }
    const data = results[0];
    // Support both old docs (username) and new docs (name)
    const fullName = String(data.username ?? data.name ?? "");
    const firstName = fullName.split(" ")[0] || "Utilisateur";
    referralCache.set(code, { valid: true, name: firstName, expiresAt: Date.now() + REFERRAL_CACHE_TTL });
    res.json({ valid: true, name: firstName });
  } catch (e) {
    console.error("[check-referral] Error:", e);
    res.json({ valid: false });
  }
});

/**
 * GET /auth/parrain-info
 * Authenticated — returns the logged-in user's parrain's name and code.
 */
router.get("/auth/parrain-info", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const fb = getFirebaseAdmin();
    const db = fb.firestore();
    const userDoc = await db.doc(`users/${req.uid}`).get();
    const referredBy = String(userDoc.data()?.referredBy ?? "");
    if (!referredBy) {
      res.json({ success: true, data: null });
      return;
    }
    const snap = await db.collection("users")
      .where("referralCode", "==", referredBy)
      .limit(1)
      .get();
    if (snap.empty) {
      res.json({ success: true, data: null });
    } else {
      const parentData = snap.docs[0].data();
      // Support both old docs (username) and new docs (name)
      const parentName = String(parentData.username ?? parentData.name ?? "");
      res.json({ success: true, data: { name: parentName, code: referredBy } });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

router.post(
  "/auth/register",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { name, email, phone, referralCode, referredBy, country } = req.body;
    if (!name || !email) {
      res.status(400).json({ success: false, error: "Nom et email requis" });
      return;
    }

    const existing = await firestoreGet(`users/${req.uid}`, req.idToken!);
    if (existing) {
      res.status(409).json({ success: false, error: "Profil déjà existant" });
      return;
    }

    // Resolve parrain's name before creating profile
    let referredByName = "";
    if (referredBy) {
      try {
        const fb = getFirebaseAdmin();
        const snap = await fb.firestore().collection("users")
          .where("referralCode", "==", referredBy)
          .limit(1)
          .get();
        if (!snap.empty) {
          const pd = snap.docs[0].data();
          referredByName = String(pd?.username ?? pd?.name ?? "");
        }
      } catch { /* ignore */ }
    }

    // ── Détection de fraude par nom ──────────────────────────────────────
    // Si un compte bloqué a le même prénom ou le même nom complet,
    // le nouveau compte est automatiquement bloqué avec la même dette.
    let autoBlocked = false;
    let autoFrozenDebt = 0;
    let autoBlockReason = "";

    try {
      const fb = getFirebaseAdmin();
      const db = fb.firestore();
      const newFirstName = String(name).split(" ")[0].toLowerCase();
      const newFullName  = String(name).toLowerCase().trim();

      // Cherche par nom complet exact (insensible à la casse)
      const blockedByFullName = await db.collection("users")
        .where("blocked", "==", true)
        .where("name", "==", name)
        .limit(1)
        .get();

      if (!blockedByFullName.empty) {
        const bd = blockedByFullName.docs[0].data();
        autoBlocked    = true;
        autoFrozenDebt = Number(bd.frozenDebt ?? 0);
        autoBlockReason = `Nom identique au compte bloqué ${blockedByFullName.docs[0].id}`;
      }

      // Si pas trouvé par nom complet, cherche par prénom parmi les comptes bloqués
      if (!autoBlocked) {
        const blockedSnap = await db.collection("users")
          .where("blocked", "==", true)
          .limit(200)
          .get();

        for (const doc of blockedSnap.docs) {
          const bd = doc.data();
          const blockedFullName  = String(bd.name ?? bd.username ?? "").toLowerCase().trim();
          const blockedFirstName = blockedFullName.split(" ")[0];

          if (
            blockedFirstName === newFirstName && newFirstName.length > 2 &&
            (blockedFullName === newFullName || blockedFullName.includes(newFirstName))
          ) {
            autoBlocked    = true;
            autoFrozenDebt = Number(bd.frozenDebt ?? 0);
            autoBlockReason = `Prénom identique au compte bloqué ${doc.id} (${bd.name ?? bd.username})`;
            break;
          }
        }
      }

      if (autoBlocked) {
        console.warn(`[auth/register] Auto-blocage détecté pour "${name}" (${email}) — ${autoBlockReason}`);
      }
    } catch (e) {
      console.error("[auth/register] Erreur vérification fraude par nom:", e);
    }

    const ok = await firestoreSet(
      `users/${req.uid}`,
      {
        name,
        email,
        phone:              phone ?? "",
        balance:            0,
        referralBalance:    0,
        withdrawalBalance:  0,
        totalOrders:        0,
        referralCode:       referralCode ?? "",
        referredBy:         referredBy ?? "",
        referredByName:     referredByName,
        referralCount:      0,
        referralOrdersUsed: 0,
        country:            country ?? "",
        photoURL:           "",
        createdAt:          new Date().toISOString(),
        ...(autoBlocked ? {
          blocked:      true,
          frozenDebt:   autoFrozenDebt,
          blockedAt:    new Date().toISOString(),
          blockedBy:    "auto-detection",
          blockedReason: autoBlockReason,
        } : {}),
      },
      req.idToken!
    );

    if (!ok) {
      res.status(500).json({ success: false, error: "Erreur lors de la création du profil" });
      return;
    }

    // Fire-and-forget welcome email
    sendWelcomeEmail(email, name, referralCode ?? "").catch(() => {});

    // If user registered with a referral code, increment parent's referralCount + notify parent
    if (referredBy) {
      try {
        const fb = getFirebaseAdmin();
        const db = fb.firestore();
        const { FieldValue } = await import("firebase-admin/firestore");
        const snap = await db.collection("users")
          .where("referralCode", "==", referredBy)
          .limit(1)
          .get();
        if (!snap.empty) {
          const parentDoc      = snap.docs[0];
          const parentId       = parentDoc.id;
          const newUserFirstName = String(name ?? "").split(" ")[0] || "Un utilisateur";

          await parentDoc.ref.update({
            referralCount: FieldValue.increment(1),
          });
          console.log(`[auth] referralCount +1 for parent with code ${referredBy}`);

          // Save to Firestore activites AND send push to parent
          saveNotifAndSendPush(
            parentId,
            "nouveau_filleul",
            "🎉 Nouveau filleul !",
            `${newUserFirstName} vient de rejoindre Social Boost Horizon avec votre code de parrainage. Continuez à inviter pour gagner encore plus de commissions !`,
            { screen: "parrainage" },
            "wallet",
            { filleulName: newUserFirstName }
          ).catch((e) => console.error("[auth] saveNotifAndSendPush error:", e));

          // Notify the new user (filleul) about their referral welcome bonus
          saveNotifAndSendPush(
            req.uid!,
            "parrainage_bienvenue",
            "🎁 Avantage parrainage activé !",
            `Félicitations ! Vous êtes inscrit(e) avec un code de parrainage et bénéficiez de 10% de réduction sur vos 5 prochaines commandes. Lancez dès maintenant votre première commande pour profiter de cette réduction !`,
            { screen: "new-order" },
            "default",
            {}
          ).catch((e) => console.error("[auth] filleul welcome notif error:", e));
        }
      } catch (e) {
        console.error("[auth] referralCount increment error:", e);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        id:                 req.uid,
        name,
        email,
        phone:              phone ?? null,
        balance:            0,
        referralBalance:    0,
        withdrawalBalance:  0,
        totalOrders:        0,
        referralCode:       referralCode ?? "",
        referredBy:         referredBy ?? null,
        referredByName:     referredByName || null,
        referralCount:      0,
        referralOrdersUsed: 0,
        country:            country ?? "",
        photoURL:           null,
        joinedAt:           new Date().toISOString(),
      },
    });
  }
);

export default router;
