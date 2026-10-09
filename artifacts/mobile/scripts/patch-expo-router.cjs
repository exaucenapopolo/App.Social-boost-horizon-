// scripts/patch-expo-router.cjs
// Corrige l'incompatibilité expo-router / React 19 :
// react_1.use(...) → react_1.useContext(...)
//
// Compatible pnpm workspace : cherche le fichier dans plusieurs emplacements
// possibles (local artifacts/mobile, ou root node_modules).

const fs = require('fs');
const path = require('path');

const RELATIVE = path.join(
  'expo-router',
  'build',
  'global-state',
  'storeContext.js'
);

function findTarget() {
  // 1) Essayer via require.resolve (le plus fiable)
  try {
    return require.resolve(RELATIVE, { paths: [path.join(__dirname, '..')] });
  } catch (_) {}

  // 2) Fallback : tester plusieurs chemins manuellement
  const candidates = [
    path.join(__dirname, '..', 'node_modules', RELATIVE),
    path.join(__dirname, '..', '..', '..', 'node_modules', RELATIVE),
    path.join(process.cwd(), 'node_modules', RELATIVE),
    path.join(process.cwd(), '..', '..', 'node_modules', RELATIVE),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return null;
}

try {
  const file = findTarget();

  if (!file) {
    console.log('ℹ️  expo-router storeContext.js introuvable, patch ignoré');
    process.exit(0);
  }

  let content = fs.readFileSync(file, 'utf8');
  const patched = content.replace(/react_1\.use\(/g, 'react_1.useContext(');

  if (content !== patched) {
    fs.writeFileSync(file, patched, 'utf8');
    console.log('✅ expo-router storeContext.js patché :', file);
  } else {
    console.log('ℹ️  expo-router storeContext.js déjà patché ou non concerné :', file);
  }
} catch (err) {
  console.warn('⚠️  Impossible de patcher expo-router :', err.message);
}