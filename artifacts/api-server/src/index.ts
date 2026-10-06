import app from "./app";
import { startOrderPoller } from "./jobs/orderPoller.js";
import { startFapshiPoller } from "./jobs/fapshiPoller.js";
import { startSwychrPoller } from "./jobs/swychrPoller.js";
import { startReferralPoller } from "./jobs/referralPoller.js";
import { startReportScheduler } from "./routes/reports.js";
import { startPendingCreditsProcessor } from "./lib/pendingCredits.js";

// Vercel définit VERCEL="1" dans son environnement serverless.
const isVercel = process.env.VERCEL === "1";

// ✅ Export par défaut pour Vercel Serverless Function (obligatoire).
//    Sur Vercel, Vercel appelle cette app à chaque requête HTTP.
export default app;

// ── Démarrage du serveur classique (local / Replit uniquement) ──
// Sur Vercel, on ne démarre PAS de serveur : Vercel gère les requêtes.
if (!isVercel) {
  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startOrderPoller();
    startFapshiPoller();
    startSwychrPoller();
    startReferralPoller();
    startReportScheduler();
    startPendingCreditsProcessor(); // Retry crédits bloqués par quota Firestore
  });
} else {
  console.log("[vercel] Running as serverless function — pollers disabled");
}