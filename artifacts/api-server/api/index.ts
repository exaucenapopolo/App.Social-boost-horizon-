// artifacts/api-server/api/index.ts
// ─────────────────────────────────────────────────────────────────
// Point d'entrée Vercel Serverless Function.
//
// On importe le BUNDLE esbuild (dist/index.cjs) et non le code source,
// car Vercel ne résout pas les dépendances "workspace:*" du monorepo
// pnpm lors de la compilation des fonctions serverless.
//
// Le bundle contient TOUT : app Express + dépendances + packages workspace.
// ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const app = require("../dist/index.cjs");

export default app.default ?? app;