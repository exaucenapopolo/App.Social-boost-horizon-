export interface Country {
  code: string;
  name: string;
  flag: string;
  phoneCode: string;
  currency: string;
  currencySymbol: string;
  xafRate: number;
  /** Taux utilisé uniquement pour afficher les prix des services (new-order).
   *  Si absent, on utilise xafRate. */
  serviceXafRate?: number;
}

export const COUNTRIES: Country[] = [
  // ── Zone CFA / FCFA (taux 1:1) ──────────────────────────────────────────
  { code: "cm", name: "Cameroun",             flag: "🇨🇲", phoneCode: "+237", currency: "XAF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "sn", name: "Sénégal",              flag: "🇸🇳", phoneCode: "+221", currency: "XOF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "ci", name: "Côte d'Ivoire",        flag: "🇨🇮", phoneCode: "+225", currency: "XOF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "ml", name: "Mali",                 flag: "🇲🇱", phoneCode: "+223", currency: "XOF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "bf", name: "Burkina Faso",         flag: "🇧🇫", phoneCode: "+226", currency: "XOF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "bj", name: "Bénin",               flag: "🇧🇯", phoneCode: "+229", currency: "XOF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "tg", name: "Togo",                flag: "🇹🇬", phoneCode: "+228", currency: "XOF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "ne", name: "Niger",               flag: "🇳🇪", phoneCode: "+227", currency: "XOF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "gw", name: "Guinée-Bissau",       flag: "🇬🇼", phoneCode: "+245", currency: "XOF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "ga", name: "Gabon",               flag: "🇬🇦", phoneCode: "+241", currency: "XAF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "cg", name: "Congo Brazzaville",   flag: "🇨🇬", phoneCode: "+242", currency: "XAF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "td", name: "Tchad",               flag: "🇹🇩", phoneCode: "+235", currency: "XAF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "cf", name: "Centrafrique",        flag: "🇨🇫", phoneCode: "+236", currency: "XAF",  currencySymbol: "FCFA", xafRate: 1 },
  { code: "gq", name: "Guinée Équatoriale",  flag: "🇬🇶", phoneCode: "+240", currency: "XAF",  currencySymbol: "FCFA", xafRate: 1 },
  // ── Guinées hors zone CFA ───────────────────────────────────────────────
  { code: "gn", name: "Guinée Conakry",      flag: "🇬🇳", phoneCode: "+224", currency: "GNF",  currencySymbol: "FG",   xafRate: 14.5 },
  // ── Afrique centrale / Est ──────────────────────────────────────────────
  { code: "cd", name: "RD Congo",            flag: "🇨🇩", phoneCode: "+243", currency: "CDF",  currencySymbol: "FC",   xafRate: 4.70, serviceXafRate: 4.27 },
  { code: "rw", name: "Rwanda",              flag: "🇷🇼", phoneCode: "+250", currency: "RWF",  currencySymbol: "FRw",  xafRate: 1.98 },
  { code: "ug", name: "Ouganda",             flag: "🇺🇬", phoneCode: "+256", currency: "UGX",  currencySymbol: "USh",  xafRate: 5.64 },
  { code: "tz", name: "Tanzanie",            flag: "🇹🇿", phoneCode: "+255", currency: "TZS",  currencySymbol: "TSh",  xafRate: 3.81 },
  { code: "ke", name: "Kenya",              flag: "🇰🇪", phoneCode: "+254", currency: "KES",  currencySymbol: "KSh",  xafRate: 0.20 },
  { code: "et", name: "Éthiopie",           flag: "🇪🇹", phoneCode: "+251", currency: "ETB",  currencySymbol: "Br",   xafRate: 0.19 },
  { code: "mg", name: "Madagascar",         flag: "🇲🇬", phoneCode: "+261", currency: "MGA",  currencySymbol: "Ar",   xafRate: 68 },
  { code: "mz", name: "Mozambique",         flag: "🇲🇿", phoneCode: "+258", currency: "MZN",  currencySymbol: "MT",   xafRate: 0.099 },
  { code: "zm", name: "Zambie",             flag: "🇿🇲", phoneCode: "+260", currency: "ZMW",  currencySymbol: "ZK",   xafRate: 0.041 },
  { code: "mw", name: "Malawi",             flag: "🇲🇼", phoneCode: "+265", currency: "MWK",  currencySymbol: "MK",   xafRate: 2.67 },
  // ── Afrique de l'Ouest / Nord ──────────────────────────────────────────
  { code: "gh", name: "Ghana",              flag: "🇬🇭", phoneCode: "+233", currency: "GHS",  currencySymbol: "GH₵",  xafRate: 0.024 },
  { code: "ng", name: "Nigéria",            flag: "🇳🇬", phoneCode: "+234", currency: "NGN",  currencySymbol: "₦",    xafRate: 2.44 },
  { code: "mr", name: "Mauritanie",         flag: "🇲🇷", phoneCode: "+222", currency: "MRU",  currencySymbol: "UM",   xafRate: 0.056 },
  { code: "sl", name: "Sierra Leone",       flag: "🇸🇱", phoneCode: "+232", currency: "SLE",  currencySymbol: "Le",   xafRate: 0.034 },
  { code: "gm", name: "Gambie",             flag: "🇬🇲", phoneCode: "+220", currency: "GMD",  currencySymbol: "D",    xafRate: 0.097 },
  // ── International ─────────────────────────────────────────────────────
  { code: "ca", name: "Canada",             flag: "🇨🇦", phoneCode: "+1",   currency: "CAD",  currencySymbol: "C$",   xafRate: 0.0021 },
  { code: "fr", name: "France",             flag: "🇫🇷", phoneCode: "+33",  currency: "EUR",  currencySymbol: "€",    xafRate: 0.00152 },
];

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code.toLowerCase() === code.toLowerCase());
}

export function formatCurrency(amountXAF: number, country: Country): string {
  if (country.xafRate === 1) {
    return `${Math.round(amountXAF).toLocaleString("fr-FR")} ${country.currencySymbol}`;
  }
  const localAmount = Math.round(amountXAF * country.xafRate);
  return `${localAmount.toLocaleString("fr-FR")} ${country.currencySymbol}`;
}

export function convertToXAF(localAmount: number, country: Country): number {
  if (country.xafRate === 1) return localAmount;
  return Math.round(localAmount / country.xafRate);
}

export function convertFromXAF(xafAmount: number, country: Country): number {
  if (country.xafRate === 1) return xafAmount;
  return Math.round(xafAmount * country.xafRate);
}
