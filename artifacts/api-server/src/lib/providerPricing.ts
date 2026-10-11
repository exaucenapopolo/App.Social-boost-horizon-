/**
 * Source unique de vérité pour les prix des fournisseurs SMM de SBH Mobile.
 * Valeurs alignées sur Social-Boost-Horizon/api/index.js (site web).
 *
 * EXO : rate en USD / 1 000 -> conversion 650 XAF/USD -> coefficient 1,51
 * MTP : rate en USD / 1 000 -> conversion 650 XAF/USD -> coefficient 2,5
 * SMMWiz : rate en USD / 1 000 -> conversion 650 XAF/USD -> coefficient 3,5
 * AfriqueBoost : le site traite déjà rate comme un montant en XAF -> coefficient 2,5
 *
 * Pour ajuster les tarifs de l'application, modifie UNIQUEMENT les valeurs ci-dessous.
 * Ne change pas USD_TO_XAF d'AfriqueBoost sans confirmer au fournisseur la devise de rate.
 */
export type ProviderPricingMode = "per_1000" | "per_unit" | "package";
export type ProviderKey = "exo" | "mtp" | "smmwiz" | "afriqueboost";

export const USD_TO_XAF = 650;
export const PROVIDER_PRICING: Record<ProviderKey, { usdToXaf: number; multiplier: number }> = {
  exo:          { usdToXaf: USD_TO_XAF, multiplier: 1.51 },
  mtp:          { usdToXaf: USD_TO_XAF, multiplier: 2.5 },
  smmwiz:       { usdToXaf: USD_TO_XAF, multiplier: 3.5 },
  afriqueboost: { usdToXaf: 1,           multiplier: 2.5 },
};

export function normalizeProvider(value: unknown): ProviderKey {
  const p = String(value ?? "").trim().toLowerCase().replace(/[ _-]+/g, "");
  if (p === "mtp" || p === "morethanpanel") return "mtp";
  if (p === "smmwiz") return "smmwiz";
  if (p === "afriqueboost" || p === "afb" || p === "advanced") return "afriqueboost";
  return "exo";
}

export function getProviderPricing(provider: unknown) {
  return PROVIDER_PRICING[normalizeProvider(provider)];
}

/** Renvoie le prix de vente unitaire : tarif par 1 000, unité ou forfait selon le type. */
export function calculateProviderPriceXAF(rate: unknown, provider: unknown): number {
  const pricing = getProviderPricing(provider);
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate < 0) return 0;
  const providerKey = normalizeProvider(provider);
  // ExoSupplier applique dans l'API web un arrondi du coût converti avant la marge.
  // MTP/SMMWiz/AfriqueBoost utilisent l'arrondi final directement, comme api/index.js.
  const baseCostXAF = providerKey === "exo"
    ? Math.round(numericRate * pricing.usdToXaf)
    : numericRate * pricing.usdToXaf;
  const finalPrice = Math.round(baseCostXAF * pricing.multiplier);
  return Number.isSafeInteger(finalPrice) && finalPrice >= 0 ? finalPrice : 0;
}

/** Les modes SMMWiz suivent la logique du site web ; les autres fournisseurs facturent par 1 000 sauf forfait. */
export function getProviderPricingMode(provider: unknown, rawType: unknown, rawName = ""): ProviderPricingMode {
  const p = normalizeProvider(provider);
  const type = String(rawType ?? "Default").trim().toLowerCase();
  const name = String(rawName ?? "").trim().toLowerCase();
  if (type.includes("package") || type === "forfait" || name.includes("package fixe")) return "package";

  // Éviter que « per 1000 » soit pris pour « per 1 ».
  if (type.includes("per 1000") || type.includes("per 1,000") || type.includes("per 1k")) return "per_1000";
  // Même détection générale que le catalogue web EXO : tarifs explicites à l'unité.
  if (type.includes("per unit") || type.includes("per one") || /pers+1/.test(type)) return "per_unit";

  if (p === "smmwiz") {
    const perUnitTypes = new Set([
      "custom comments", "usernames", "usernames + hashtags", "hashtag scraper",
      "username scraper", "media / likers", "poll", "groups",
    ]);
    if (perUnitTypes.has(type)) return "per_unit";
  }
  return "per_1000";
}

/** Calcul identique pour l'aperçu et le total de la commande mobile. */
export function calculateOrderTotalXAF(
  priceXAF: number,
  quantity: number,
  mode: ProviderPricingMode
): number {
  if (!Number.isFinite(priceXAF) || priceXAF < 0 || !Number.isFinite(quantity) || quantity <= 0) return 0;
  if (mode === "package") return Math.round(priceXAF);
  const raw = mode === "per_unit" ? priceXAF * quantity : (priceXAF / 1000) * quantity;
  return Math.max(1, Math.round(raw));
}
