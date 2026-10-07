#!/usr/bin/env bash
# Force l'utilisation de pnpm pour EAS Build
set -e
echo "[eas-pre-install] Activation de corepack..."
corepack enable
echo "[eas-pre-install] Préparation de pnpm..."
corepack prepare pnpm@12.4.1 --activate
echo "[eas-pre-install] pnpm version: $(pnpm --version)"
echo "[eas-pre-install] Terminé."