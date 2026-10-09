// scripts/patch-expo-router.cjs
// Corrige l'incompatibilité expo-router / React 19 :
// react_1.use(...) → react_1.useContext(...)

const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-router',
  'build',
  'global-state',
  'storeContext.js'
);

try {
  if (!fs.existsSync(file)) {
    console.log('ℹ️  expo-router storeContext.js introuvable, patch ignoré');
    process.exit(0);
  }
  let content = fs.readFileSync(file, 'utf8');
  const patched = content.replace(/react_1\.use\(/g, 'react_1.useContext(');
  if (content !== patched) {
    fs.writeFileSync(file, patched, 'utf8');
    console.log('✅ expo-router storeContext.js patché');
  } else {
    console.log('ℹ️  expo-router storeContext.js déjà patché ou non concerné');
  }
} catch (err) {
  console.warn('⚠️  Impossible de patcher expo-router :', err.message);
}