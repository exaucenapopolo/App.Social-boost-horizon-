// artifacts/api-server/api/index.ts
// ─────────────────────────────────────────────────────────────────
// Vercel Serverless Function — point d'entrée.
//
// ⚠️  package.json a "type": "module" → ce fichier est ESM → PAS de require().
// On utilise import() dynamique (async) pour charger le bundle CJS esbuild.
//
// Vercel compile api/*.ts en ESM et supporte le top-level await (Node 18+).
// ─────────────────────────────────────────────────────────────────

import type { IncomingMessage, ServerResponse } from "http";

type ExpressHandler = (req: IncomingMessage, res: ServerResponse) => void;

// import() dynamique du bundle CJS généré par `pnpm run build`
// (esbuild → dist/index.cjs). Le bundle contient TOUT : Express + app + deps.
//
// @ts-ignore TS7016 — le bundle .cjs n'a pas de fichier de déclaration TypeScript.
// On le caste juste après en Record<string, unknown> pour un accès sûr.
const mod = (await import("../dist/index.cjs")) as Record<string, unknown>;

// Interop CJS → ESM (Node.js) :
//   Si dist/index.cjs fait `module.exports = { default: app }`
//      → mod.default.default = app
//   Si dist/index.cjs fait `module.exports = app`
//      → mod.default = app
const inner = (mod?.default as Record<string, unknown> | undefined)?.default;
const candidate = inner ?? mod?.default ?? mod;

if (typeof candidate !== "function") {
  const defaultType = typeof mod?.default;
  const defaultKeys =
    mod?.default && typeof mod.default === "object"
      ? Object.keys(mod.default as object).join(",")
      : "n/a";
  throw new Error(
    `[api/index] Bundle invalide — attendu un handler Express (fonction). ` +
      `typeof mod.default=${defaultType}, keys(mod.default)=${defaultKeys}`
  );
}

export default candidate as ExpressHandler;