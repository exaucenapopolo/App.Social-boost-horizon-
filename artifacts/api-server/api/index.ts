// artifacts/api-server/api/index.ts
// ─────────────────────────────────────────────────────────────────
// Point d'entrée Vercel Serverless Function.
// Vercel détecte automatiquement tout fichier dans `api/` comme une
// fonction serverless et l'exécute à la demande.
//
// On ré-exporte l'app Express (défini dans src/app.ts) pour que Vercel
// puisse la servir en tant que handler HTTP (req, res) => void.
// ─────────────────────────────────────────────────────────────────

import app from "../src/app.js";

export default app;