import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import StarBackground from "@/components/StarBackground";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { type Recharge, useWallet } from "@/context/WalletContext";
import { apiClient, BASE_URL } from "@/services/api";
import { getFreshToken } from "@/services/tokenStore";
import { COUNTRIES, Country, formatCurrency } from "@/lib/countries";

// ─── Dépendances optionnelles (fallback silencieux si absentes) ───
let AsyncStorageModule: any = null;
try {
  AsyncStorageModule = require("@react-native-async-storage/async-storage").default;
} catch {
  AsyncStorageModule = null;
}

let LocalizationModule: any = null;
try {
  LocalizationModule = require("expo-localization");
} catch {
  LocalizationModule = null;
}

// ═══════════════════════════════════════════════════════════════
//  PALETTE
// ═══════════════════════════════════════════════════════════════
const NAVY        = "#0A1C3A";
const NAVY_LIGHT  = "#152E54";
const GOLD        = "#D4AF37";
const GOLD_SOFT   = "#C6A15B";

const LIGHT_BG        = "#F7F5F0";
const LIGHT_SURFACE   = "#FFFFFF";
const LIGHT_TEXT      = "#1A202C";
const LIGHT_TEXT_2    = "#718096";
const LIGHT_BORDER    = "rgba(10,28,58,0.08)";
const LIGHT_INPUT_BG  = "#F5F6F8";
const LIGHT_ICON_BG   = "rgba(10,28,58,0.05)";
const LIGHT_ICON_BORD = "rgba(10,28,58,0.08)";

const DARK_BG         = "#0B132B";
const DARK_SURFACE    = "#1C2541";
const DARK_TEXT       = "#F8F9FA";
const DARK_TEXT_2     = "#A0AEC0";
const DARK_BORDER     = "rgba(255,255,255,0.08)";
const DARK_INPUT_BG   = "rgba(255,255,255,0.04)";
const DARK_ICON_BG    = "rgba(212,175,55,0.12)";
const DARK_ICON_BORD  = "rgba(212,175,55,0.26)";

const SUCCESS = "#10B981";
const WARNING = "#F59E0B";
const INFO    = "#3B82F6";
const DANGER  = "#EF4444";
const PURPLE  = "#8B5CF6";

// ═══════════════════════════════════════════════════════════════
//  DATA — Mobile Money (liste restreinte, sans France/Canada/Madagascar)
// ═══════════════════════════════════════════════════════════════
const AMOUNTS_FCFA = [500, 1000, 2000, 5000, 10000, 20000];

export interface PayCountry extends Country {
  operators: string[];
}

const INTL_COUNTRIES: PayCountry[] = [
  { code: "cm", name: "Cameroun",             flag: "🇨🇲", phoneCode: "+237", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Orange Money"] },
  { code: "ga", name: "Gabon",                flag: "🇬🇦", phoneCode: "+241", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "cg", name: "Congo Brazzaville",    flag: "🇨🇬", phoneCode: "+242", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "td", name: "Tchad",                flag: "🇹🇩", phoneCode: "+235", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Airtel Money"] },
  { code: "cf", name: "Centrafrique",         flag: "🇨🇫", phoneCode: "+236", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money"] },
  { code: "gq", name: "Guinée Équatoriale",   flag: "🇬🇶", phoneCode: "+240", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Airtel Money"] },
  { code: "sn", name: "Sénégal",              flag: "🇸🇳", phoneCode: "+221", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "Wave"] },
  { code: "ci", name: "Côte d'Ivoire",        flag: "🇨🇮", phoneCode: "+225", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "MTN Mobile Money", "Wave"] },
  { code: "ml", name: "Mali",                 flag: "🇲🇱", phoneCode: "+223", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "Moov Money"] },
  { code: "bf", name: "Burkina Faso",         flag: "🇧🇫", phoneCode: "+226", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "Moov Money"] },
  { code: "bj", name: "Bénin",                flag: "🇧🇯", phoneCode: "+229", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Moov Money"] },
  { code: "tg", name: "Togo",                 flag: "🇹🇬", phoneCode: "+228", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Flooz", "T-Money"] },
  { code: "ne", name: "Niger",                flag: "🇳🇪", phoneCode: "+227", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Airtel Money", "Zamani"] },
  { code: "gw", name: "Guinée-Bissau",        flag: "🇬🇼", phoneCode: "+245", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money"] },
  { code: "gn", name: "Guinée Conakry",       flag: "🇬🇳", phoneCode: "+224", currency: "GNF", currencySymbol: "FG",   xafRate: 14.5,   operators: ["Orange Money", "MTN Mobile Money"] },
  { code: "cd", name: "RD Congo",             flag: "🇨🇩", phoneCode: "+243", currency: "CDF", currencySymbol: "FC",   xafRate: 4.70,   operators: ["M-Pesa", "Airtel Money", "Orange Money"] },
  { code: "rw", name: "Rwanda",               flag: "🇷🇼", phoneCode: "+250", currency: "RWF", currencySymbol: "FRw",  xafRate: 1.98,   operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "ug", name: "Ouganda",              flag: "🇺🇬", phoneCode: "+256", currency: "UGX", currencySymbol: "USh",  xafRate: 5.64,   operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "tz", name: "Tanzanie",             flag: "🇹🇿", phoneCode: "+255", currency: "TZS", currencySymbol: "TSh",  xafRate: 3.81,   operators: ["M-Pesa", "Airtel Money"] },
  { code: "ke", name: "Kenya",                flag: "🇰🇪", phoneCode: "+254", currency: "KES", currencySymbol: "KSh",  xafRate: 0.20,   operators: ["M-Pesa"] },
  { code: "et", name: "Éthiopie",             flag: "🇪🇹", phoneCode: "+251", currency: "ETB", currencySymbol: "Br",   xafRate: 0.19,   operators: ["Telebirr"] },
  { code: "zm", name: "Zambie",               flag: "🇿🇲", phoneCode: "+260", currency: "ZMW", currencySymbol: "ZK",   xafRate: 0.041,  operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "mw", name: "Malawi",               flag: "🇲🇼", phoneCode: "+265", currency: "MWK", currencySymbol: "MK",   xafRate: 2.67,   operators: ["TNM Mpamba", "Airtel Money"] },
  { code: "gh", name: "Ghana",                flag: "🇬🇭", phoneCode: "+233", currency: "GHS", currencySymbol: "GH₵",  xafRate: 0.024,  operators: ["MTN Mobile Money", "AirtelTigo Money"] },
  { code: "ng", name: "Nigéria",              flag: "🇳🇬", phoneCode: "+234", currency: "NGN", currencySymbol: "₦",    xafRate: 2.44,   operators: ["MTN Mobile Money", "Airtel Money", "OPay"] },
  { code: "sl", name: "Sierra Leone",         flag: "🇸🇱", phoneCode: "+232", currency: "SLE", currencySymbol: "Le",   xafRate: 0.034,  operators: ["Orange Money"] },
  { code: "mr", name: "Mauritanie",           flag: "🇲🇷", phoneCode: "+222", currency: "MRU", currencySymbol: "UM",   xafRate: 0.056,  operators: ["Masrvi", "Bankily"] },
  { code: "gm", name: "Gambie",               flag: "🇬🇲", phoneCode: "+220", currency: "GMD", currencySymbol: "D",    xafRate: 0.097,  operators: ["QMoney", "Afrimoney"] },
  { code: "mz", name: "Mozambique",           flag: "🇲🇿", phoneCode: "+258", currency: "MZN", currencySymbol: "MT",   xafRate: 0.099,  operators: ["M-Pesa", "Airtel Money"] },
];

function getEquivalentLocal(amountXAF: number, country: PayCountry): number {
  if (country.xafRate === 1) return amountXAF;
  return Math.round(amountXAF * country.xafRate);
}
function getEquivalentXAF(localAmount: number, country: PayCountry): number {
  if (country.xafRate === 1) return localAmount;
  return Math.round(localAmount / country.xafRate);
}

// ═══════════════════════════════════════════════════════════════
//  DATA — Carte bancaire (TOUS LES PAYS DU MONDE, triés A→Z)
// ═══════════════════════════════════════════════════════════════
const CURRENCY_SYMBOLS: Record<string, string> = {
  XAF: "FCFA", XOF: "FCFA", USD: "$", EUR: "€", GBP: "£", CAD: "C$",
  CHF: "CHF", JPY: "¥", CNY: "¥", INR: "₹", AED: "د.إ", SAR: "﷼",
  TRY: "₺", RUB: "₽", ZAR: "R", MAD: "MAD", GHS: "GH₵", NGN: "₦",
  KES: "KSh", UGX: "USh", TZS: "TSh", RWF: "FRw", ZMW: "ZK", CDF: "FC",
  AOA: "Kz", MZN: "MT", BRL: "R$", MXN: "MX$", AUD: "A$", NZD: "NZ$",
  KRW: "₩", SGD: "S$", THB: "฿", MYR: "RM", IDR: "Rp", PHP: "₱",
  VND: "₫", PLN: "zł", SEK: "kr", NOK: "kr", DKK: "kr", CZK: "Kč",
  HUF: "Ft", RON: "lei", BGN: "лв", HRK: "kn", UAH: "₴", ILS: "₪",
  EGP: "E£", TND: "DT", DZD: "DA", LYD: "LD", QAR: "﷼", KWD: "KD",
  BHD: "BD", OMR: "﷼", JOD: "JD", LBP: "ل.ل", PKR: "₨", BDT: "৳",
  LKR: "Rs", NPR: "Rs", MUR: "Rs", SCR: "Rs", MGA: "Ar", MVR: "Rf",
  AFN: "؋", IRR: "﷼", IQD: "ID", SYP: "£S", YER: "﷼", ETB: "Br",
  GMD: "D", GNF: "FG", LRD: "L$", SLL: "Le", SOS: "Sh", SDG: "SDG",
  SSP: "SSP", DJF: "Fdj", KMF: "CF", CVE: "$", STN: "Db", BIF: "FBu",
  ERN: "Nfk", LSL: "L", SZL: "E", NAD: "N$", BWP: "P", MWK: "MK",
  ZWG: "ZiG", ZWL: "Z$", ALL: "L", XCD: "EC$", AMD: "֏", AZN: "₼",
  BSD: "B$", BBD: "Bds$", BZD: "BZ$", BTN: "Nu.", BYN: "Br", MMK: "K",
  BOB: "Bs.", BAM: "KM", BND: "B$", KHR: "៛", KPW: "₩", CRC: "₡",
  CUP: "₱", ANG: "ƒ", GIP: "£", GTQ: "Q", GYD: "G$", HTG: "G",
  HNL: "L", ISK: "kr", JMD: "J$", KZT: "₸", KGS: "с", LAK: "₭",
  MKD: "ден", MDL: "L", MNT: "₮", NIO: "C$", XPF: "₣", UZS: "soʻm",
  PAB: "B/.", PGK: "K", PYG: "₲", HKD: "HK$", RSD: "дин", SRD: "$",
  TJS: "SM", TWD: "NT$", TOP: "T$", TTD: "TT$", TMT: "m", WST: "T",
  SBD: "SI$", MRU: "UM", PEN: "S/", CLP: "$", COP: "$", ARS: "$",
  UYU: "$U", VES: "Bs.", GEL: "₾", FJD: "FJ$", VUV: "VT", BMD: "BD$",
  FKP: "£", SHP: "£", TMT_M: "m",
};

const CURRENCY_XAF: Record<string, number> = {
  XAF: 1, XOF: 1, USD: 590, EUR: 690, GBP: 771.60, CAD: 408.95, CHF: 703.08,
  JPY: 3.6921, CNY: 86.92, INR: 6.0616, AED: 158.68, SAR: 155.20, TRY: 11.86,
  RUB: 6.9466, ZAR: 35.01, MAD: 58.68, GHS: 49.67, NGN: 0.4346, KES: 4.4919,
  UGX: 0.1577, TZS: 0.2260, RWF: 0.4200, ZMW: 24.39, CDF: 0.2344, AOA: 0.6400,
  MZN: 9.1200, BRL: 103.50, MXN: 29.60, AUD: 375.40, NZD: 340.20, KRW: 0.4233,
  SGD: 432.10, THB: 16.90, MYR: 130.20, IDR: 0.0373, PHP: 10.35, VND: 0.0230,
  PLN: 147.80, SEK: 54.20, NOK: 52.80, DKK: 92.60, CZK: 25.10, HUF: 1.5900,
  RON: 138.70, BGN: 352.80, HRK: 91.50, UAH: 14.05, ILS: 158.30, EGP: 11.90,
  TND: 187.60, DZD: 4.3500, LYD: 120.50, QAR: 159.80, KWD: 1898.00, BHD: 1545.00,
  OMR: 1514.00, JOD: 822.00, LBP: 0.0065, PKR: 2.0800, BDT: 4.8300, LKR: 1.9800,
  NPR: 3.7800, MUR: 12.60, SCR: 42.30, MGA: 0.1300, MVR: 37.80, AFN: 7.8000,
  IRR: 0.0138, IQD: 0.4450, SYP: 0.0440, YER: 2.3800, ETB: 4.1500, GMD: 8.2000,
  GNF: 0.0670, LRD: 3.0200, SLL: 0.0270, SOS: 1.0100, SDG: 0.9700, SSP: 0.4500,
  DJF: 3.2800, KMF: 1.3800, CVE: 6.3100, STN: 28.20, BIF: 0.2000, ERN: 38.80,
  LSL: 35.10, SZL: 35.10, NAD: 35.10, BWP: 44.50, MWK: 0.3350, ZWG: 22.10,
  ZWL: 0.0020, ALL: 6.30, XCD: 215.80, AMD: 1.50, AZN: 347.00, BSD: 582.82,
  BBD: 291.41, BZD: 291.41, BTN: 6.06, BYN: 178.00, MMK: 0.28, BOB: 84.50,
  BAM: 352.80, BND: 432.10, KHR: 0.14, KPW: 0.65, CRC: 1.13, CUP: 24.28,
  ANG: 325.60, GIP: 771.60, GTQ: 75.10, GYD: 2.79, HTG: 4.42, HNL: 23.50,
  ISK: 4.20, JMD: 3.75, KZT: 1.20, KGS: 6.67, LAK: 0.027, MKD: 10.20,
  MDL: 32.80, MNT: 0.17, NIO: 16.00, XPF: 5.78, UZS: 0.046, PAB: 582.82,
  PGK: 155.00, PYG: 0.079, HKD: 74.60, RSD: 5.88, SRD: 16.50, TJS: 53.50,
  TWD: 18.30, TOP: 245.00, TTD: 86.00, TMT: 166.50, WST: 210.00, SBD: 71.00,
  MRU: 14.68, PEN: 155.00, CLP: 0.61, COP: 0.14, ARS: 1.40, UYU: 14.60,
  VES: 16.00, GEL: 216.00, FJD: 258.00, VUV: 4.90,
};

export interface CardCountry {
  code: string;
  name: string;
  flag: string;
  currency: string;
  currencySymbol: string;
}

const CARD_COUNTRIES_RAW: Array<[string, string, string]> = [
  ["AF","Afghanistan","AFN"],["ZA","Afrique du Sud","ZAR"],["AL","Albanie","ALL"],
  ["DZ","Algérie","DZD"],["DE","Allemagne","EUR"],["AD","Andorre","EUR"],
  ["AO","Angola","AOA"],["AG","Antigua-et-Barbuda","XCD"],["SA","Arabie Saoudite","SAR"],
  ["AR","Argentine","ARS"],["AM","Arménie","AMD"],["AU","Australie","AUD"],
  ["AT","Autriche","EUR"],["AZ","Azerbaïdjan","AZN"],["BS","Bahamas","BSD"],
  ["BH","Bahreïn","BHD"],["BD","Bangladesh","BDT"],["BB","Barbade","BBD"],
  ["BE","Belgique","EUR"],["BZ","Belize","BZD"],["BJ","Bénin","XOF"],
  ["BT","Bhoutan","BTN"],["BY","Biélorussie","BYN"],["MM","Birmanie","MMK"],
  ["BO","Bolivie","BOB"],["BA","Bosnie-Herzégovine","BAM"],["BW","Botswana","BWP"],
  ["BR","Brésil","BRL"],["BN","Brunei","BND"],["BG","Bulgarie","BGN"],
  ["BF","Burkina Faso","XOF"],["BI","Burundi","BIF"],["KH","Cambodge","KHR"],
  ["CM","Cameroun","XAF"],["CA","Canada","CAD"],["CV","Cap-Vert","CVE"],
  ["CF","Centrafrique","XAF"],["CL","Chili","CLP"],["CN","Chine","CNY"],
  ["CY","Chypre","EUR"],["CO","Colombie","COP"],["KM","Comores","KMF"],
  ["CG","Congo Brazzaville","XAF"],["CD","Congo RDC","CDF"],["KR","Corée du Sud","KRW"],
  ["KP","Corée du Nord","KPW"],["CR","Costa Rica","CRC"],["CI","Côte d'Ivoire","XOF"],
  ["HR","Croatie","EUR"],["CU","Cuba","CUP"],["CW","Curaçao","ANG"],
  ["DK","Danemark","DKK"],["DJ","Djibouti","DJF"],["DM","Dominique","XCD"],
  ["EG","Égypte","EGP"],["AE","Émirats Arabes Unis","AED"],["EC","Équateur","USD"],
  ["ER","Érythrée","ERN"],["ES","Espagne","EUR"],["EE","Estonie","EUR"],
  ["SZ","Eswatini","SZL"],["US","États-Unis","USD"],["ET","Éthiopie","ETB"],
  ["FJ","Fidji","FJD"],["FI","Finlande","EUR"],["FR","France","EUR"],
  ["GA","Gabon","XAF"],["GM","Gambie","GMD"],["GE","Géorgie","GEL"],
  ["GH","Ghana","GHS"],["GI","Gibraltar","GIP"],["GR","Grèce","EUR"],
  ["GD","Grenade","XCD"],["GL","Groenland","DKK"],["GP","Guadeloupe","EUR"],
  ["GT","Guatemala","GTQ"],["GN","Guinée","GNF"],["GQ","Guinée Équatoriale","XAF"],
  ["GW","Guinée-Bissau","XOF"],["GY","Guyana","GYD"],["GF","Guyane française","EUR"],
  ["HT","Haïti","HTG"],["HN","Honduras","HNL"],["HU","Hongrie","HUF"],
  ["IN","Inde","INR"],["ID","Indonésie","IDR"],["IQ","Irak","IQD"],
  ["IR","Iran","IRR"],["IE","Irlande","EUR"],["IS","Islande","ISK"],
  ["IL","Israël","ILS"],["IT","Italie","EUR"],["JM","Jamaïque","JMD"],
  ["JP","Japon","JPY"],["JO","Jordanie","JOD"],["KZ","Kazakhstan","KZT"],
  ["KE","Kenya","KES"],["KG","Kirghizistan","KGS"],["KI","Kiribati","AUD"],
  ["XK","Kosovo","EUR"],["KW","Koweït","KWD"],["LA","Laos","LAK"],
  ["LS","Lesotho","LSL"],["LV","Lettonie","EUR"],["LB","Liban","LBP"],
  ["LR","Liberia","LRD"],["LY","Libye","LYD"],["LI","Liechtenstein","CHF"],
  ["LT","Lituanie","EUR"],["LU","Luxembourg","EUR"],["MK","Macédoine du Nord","MKD"],
  ["MG","Madagascar","MGA"],["MY","Malaisie","MYR"],["MW","Malawi","MWK"],
  ["MV","Maldives","MVR"],["ML","Mali","XOF"],["MT","Malte","EUR"],
  ["MA","Maroc","MAD"],["MH","Îles Marshall","USD"],["MQ","Martinique","EUR"],
  ["MU","Maurice","MUR"],["MR","Mauritanie","MRU"],["YT","Mayotte","EUR"],
  ["MX","Mexique","MXN"],["FM","Micronésie","USD"],["MD","Moldavie","MDL"],
  ["MC","Monaco","EUR"],["MN","Mongolie","MNT"],["ME","Monténégro","EUR"],
  ["MS","Montserrat","XCD"],["MZ","Mozambique","MZN"],["NA","Namibie","NAD"],
  ["NR","Nauru","AUD"],["NP","Népal","NPR"],["NI","Nicaragua","NIO"],
  ["NE","Niger","XOF"],["NG","Nigeria","NGN"],["NU","Niue","NZD"],
  ["NO","Norvège","NOK"],["NC","Nouvelle-Calédonie","XPF"],["NZ","Nouvelle-Zélande","NZD"],
  ["OM","Oman","OMR"],["UG","Ouganda","UGX"],["UZ","Ouzbékistan","UZS"],
  ["PK","Pakistan","PKR"],["PW","Palaos","USD"],["PS","Palestine","ILS"],
  ["PA","Panama","PAB"],["PG","Papouasie-Nouvelle-Guinée","PGK"],["PY","Paraguay","PYG"],
  ["NL","Pays-Bas","EUR"],["PE","Pérou","PEN"],["PH","Philippines","PHP"],
  ["PL","Pologne","PLN"],["PF","Polynésie française","XPF"],["PR","Porto Rico","USD"],
  ["PT","Portugal","EUR"],["QA","Qatar","QAR"],["HK","Hong Kong","HKD"],
  ["RE","La Réunion","EUR"],["RO","Roumanie","RON"],["GB","Royaume-Uni","GBP"],
  ["RU","Russie","RUB"],["RW","Rwanda","RWF"],["KN","Saint-Christophe-et-Niévès","XCD"],
  ["SM","Saint-Marin","EUR"],["VC","Saint-Vincent-et-les-Grenadines","XCD"],["LC","Sainte-Lucie","XCD"],
  ["SB","Îles Salomon","SBD"],["SV","Salvador","USD"],["WS","Samoa","WST"],
  ["AS","Samoa américaines","USD"],["ST","Sao Tomé-et-Principe","STN"],["SN","Sénégal","XOF"],
  ["RS","Serbie","RSD"],["SC","Seychelles","SCR"],["SL","Sierra Leone","SLL"],
  ["SG","Singapour","SGD"],["SK","Slovaquie","EUR"],["SI","Slovénie","EUR"],
  ["SO","Somalie","SOS"],["SD","Soudan","SDG"],["SS","Soudan du Sud","SSP"],
  ["LK","Sri Lanka","LKR"],["SE","Suède","SEK"],["CH","Suisse","CHF"],
  ["SR","Suriname","SRD"],["SY","Syrie","SYP"],["TJ","Tadjikistan","TJS"],
  ["TW","Taïwan","TWD"],["TZ","Tanzanie","TZS"],["TD","Tchad","XAF"],
  ["CZ","République Tchèque","CZK"],["TH","Thaïlande","THB"],["TL","Timor oriental","USD"],
  ["TG","Togo","XOF"],["TO","Tonga","TOP"],["TT","Trinité-et-Tobago","TTD"],
  ["TN","Tunisie","TND"],["TM","Turkménistan","TMT"],["TR","Turquie","TRY"],
  ["TV","Tuvalu","AUD"],["UA","Ukraine","UAH"],["UY","Uruguay","UYU"],
  ["VU","Vanuatu","VUV"],["VA","Vatican","EUR"],["VE","Venezuela","VES"],
  ["VN","Vietnam","VND"],["YE","Yémen","YER"],["ZM","Zambie","ZMW"],
  ["ZW","Zimbabwe","ZWL"],
];

function flagFromCode(code: string): string {
  if (!code) return "🏳️";
  try {
    return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
  } catch {
    return "🏳️";
  }
}

const CARD_COUNTRIES: CardCountry[] = CARD_COUNTRIES_RAW
  .map(([code, name, currency]) => ({
    code: code.toLowerCase(),
    name,
    flag: flagFromCode(code),
    currency,
    currencySymbol: CURRENCY_SYMBOLS[currency] ?? currency,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));

function cardConvertToXAF(localAmount: number, currency: string): number {
  const rate = CURRENCY_XAF[currency.toUpperCase()] ?? 1;
  return Math.round(localAmount * rate);
}
function cardConvertFromXAF(xafAmount: number, currency: string): number {
  const rate = CURRENCY_XAF[currency.toUpperCase()] ?? 1;
  if (rate === 0) return 0;
  return Math.max(1, Math.round(xafAmount / rate));
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function searchCountries<T extends { code: string; name: string }>(
  list: T[],
  query: string
): T[] {
  const q = normalizeStr(query.trim());
  if (!q) return list;
  const startsWith: T[] = [];
  const contains: T[] = [];
  for (const c of list) {
    const n = normalizeStr(c.name);
    const code = c.code.toLowerCase();
    if (n.startsWith(q) || code.startsWith(q)) startsWith.push(c);
    else if (n.includes(q) || code.includes(q)) contains.push(c);
  }
  return [...startsWith, ...contains];
}

// ─── Cache local ───────────────────────────────────────────────
const CACHE_KEYS = {
  intlPhone: "@sbh/wallet/intlPhone",
  intlCountry: "@sbh/wallet/intlCountry",
  cardCountry: "@sbh/wallet/cardCountry",
} as const;

async function cacheGet(key: string): Promise<string | null> {
  if (!AsyncStorageModule) return null;
  try {
    return await AsyncStorageModule.getItem(key);
  } catch {
    return null;
  }
}
async function cacheSet(key: string, value: string): Promise<void> {
  if (!AsyncStorageModule) return;
  try {
    await AsyncStorageModule.setItem(key, value);
  } catch {}
}

function detectDeviceRegion(): string | null {
  if (!LocalizationModule) return null;
  try {
    const locales = LocalizationModule.getLocales?.();
    const region = locales?.[0]?.regionCode;
    return typeof region === "string" ? region.toLowerCase() : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  MODALE PERSONNALISÉE
// ═══════════════════════════════════════════════════════════════
type ModalKind = "info" | "success" | "warning" | "error";

interface ModalButton {
  label: string;
  onPress?: () => void;
  style?: "primary" | "danger" | "cancel";
}

interface ModalConfig {
  kind: ModalKind;
  title: string;
  message?: string;
  buttons?: ModalButton[];
}

const MODAL_META: Record<ModalKind, { icon: any; color: string; bg: string }> = {
  info:    { icon: "info",           color: INFO,    bg: "rgba(59,130,246,0.14)"  },
  success: { icon: "check-circle",   color: SUCCESS, bg: "rgba(16,185,129,0.14)"  },
  warning: { icon: "alert-triangle", color: WARNING, bg: "rgba(245,158,11,0.14)"  },
  error:   { icon: "x-circle",       color: DANGER,  bg: "rgba(239,68,68,0.14)"   },
};

function AppModal({
  config,
  onClose,
}: {
  config: ModalConfig | null;
  onClose: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const visible = !!config;
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 150, useNativeDriver: true }),
      ]).start(() => setRendered(false));
    }
  }, [visible]);

  if (!rendered || !config) return null;

  const meta = MODAL_META[config.kind] ?? MODAL_META.info;
  const buttons: ModalButton[] =
    config.buttons && config.buttons.length > 0
      ? config.buttons
      : [{ label: "OK", style: "primary" }];

  const stacked = buttons.length > 2;

  const handlePress = (btn: ModalButton) => {
    Haptics.selectionAsync();
    onClose();
    if (btn.onPress) setTimeout(btn.onPress, 180);
  };

  return (
    <Modal transparent visible={rendered} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[mStyles.backdrop, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Animated.View style={[mStyles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[mStyles.iconWrap, { backgroundColor: meta.bg }]}>
            <Feather name={meta.icon} size={30} color={meta.color} />
          </View>
          <Text style={mStyles.title}>{config.title}</Text>
          {config.message ? <Text style={mStyles.message}>{config.message}</Text> : null}
          <View style={[mStyles.actions, stacked && { flexDirection: "column" }]}>
            {buttons.map((btn, i) => {
              const st = btn.style ?? (buttons.length === 1 ? "primary" : i === 0 ? "primary" : "cancel");
              const bg =
                st === "primary" ? GOLD :
                st === "danger"  ? DANGER :
                "rgba(255,255,255,0.10)";
              const fg = st === "cancel" ? "#E2E8F0" : "#080E1A";
              return (
                <Pressable
                  key={i}
                  onPress={() => handlePress(btn)}
                  style={({ pressed }) => [
                    mStyles.btn,
                    stacked ? { width: "100%" } : { flex: 1 },
                    { backgroundColor: bg },
                    pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Text style={[mStyles.btnText, { color: fg }]} numberOfLines={1}>
                    {btn.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function useAppModal() {
  const [config, setConfig] = useState<ModalConfig | null>(null);
  const show = useCallback((c: ModalConfig) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setConfig(c);
  }, []);
  const hide = useCallback(() => setConfig(null), []);
  const modalEl = <AppModal config={config} onClose={hide} />;
  return { show, hide, modalEl };
}

// ═══════════════════════════════════════════════════════════════
//  ANIMATIONS
// ═══════════════════════════════════════════════════════════════
function usePressSpring(to = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = useCallback(() => {
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  }, []);
  const onPressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 6 }).start();
  }, []);
  return { scale, onPressIn, onPressOut };
}

function useEntry(delay = 0, duration = 420) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1, duration, delay, useNativeDriver: true, easing: Easing.out(Easing.cubic),
    }).start();
  }, []);
  return anim;
}

// ═══════════════════════════════════════════════════════════════
//  STATUS
// ═══════════════════════════════════════════════════════════════
const STATUS_CONFIG = {
  pending:   { label: "En attente", color: WARNING, bg: "rgba(245,158,11,0.12)" },
  confirmed: { label: "Confirmé",   color: SUCCESS, bg: "rgba(16,185,129,0.12)" },
  rejected:  { label: "Rejeté",     color: DANGER,  bg: "rgba(239,68,68,0.12)" },
};

const ACTIVITY_TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string; prefix: string }> = {
  depot:         { icon: "arrow-down-circle",  color: "#11998e", bg: "rgba(17,153,142,0.12)", prefix: "+" },
  commande:      { icon: "shopping-cart",      color: INFO,      bg: "rgba(59,130,246,0.12)", prefix: "-" },
  remboursement: { icon: "refresh-ccw",        color: SUCCESS,   bg: "rgba(16,185,129,0.12)", prefix: "+" },
  annulation:    { icon: "x-circle",           color: "#FF5722", bg: "rgba(255,87,34,0.12)",  prefix: "" },
  transfert:     { icon: "arrow-right-circle", color: GOLD,      bg: "rgba(212,175,55,0.12)", prefix: "" },
  retrait:       { icon: "download",           color: PURPLE,    bg: "rgba(139,92,246,0.12)", prefix: "-" },
  parrainage:    { icon: "gift",               color: GOLD,      bg: "rgba(212,175,55,0.12)", prefix: "+" },
};

const ACTIVITY_STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  confirmed:    { label: "Effectué",    color: SUCCESS, bg: "rgba(16,185,129,0.15)" },
  completed:    { label: "Effectué",    color: SUCCESS, bg: "rgba(16,185,129,0.15)" },
  success:      { label: "Effectué",    color: SUCCESS, bg: "rgba(16,185,129,0.15)" },
  pending:      { label: "En attente",  color: WARNING, bg: "rgba(245,158,11,0.15)" },
  "En attente": { label: "En attente",  color: WARNING, bg: "rgba(245,158,11,0.15)" },
  rejected:     { label: "Rejeté",      color: DANGER,  bg: "rgba(239,68,68,0.15)" },
  failed:       { label: "Échoué",      color: DANGER,  bg: "rgba(239,68,68,0.15)" },
  annulée:      { label: "Annulé",      color: DANGER,  bg: "rgba(239,68,68,0.15)" },
};

function getActivityStatusCfg(status: string) {
  return ACTIVITY_STATUS_LABEL[status] ?? { label: status ?? "—", color: LIGHT_TEXT_2, bg: "rgba(158,158,158,0.1)" };
}

// ═══════════════════════════════════════════════════════════════
//  SUB COMPONENTS
// ═══════════════════════════════════════════════════════════════
function RechargeItem({ item, C, userCountry }: { item: Recharge; C: any; userCountry?: Country | null }) {
  const cfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const date = new Date(item.createdAt);
  return (
    <View style={[styles.histItem, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={[styles.histIcon, { backgroundColor: "#11998e" + "18" }]}>
        <Feather name="arrow-down-circle" size={20} color="#11998e" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.histTitle, { color: C.text }]} numberOfLines={1}>
          {item.method ?? "Dépôt"}
        </Text>
        <Text style={[styles.histMeta, { color: C.textMuted }]}>
          {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
          {item.phone ? ` • ${item.phone}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={[styles.histAmount, { color: SUCCESS }]}>
          +{userCountry && userCountry.xafRate !== 1
            ? formatCurrency(item.amount ?? 0, userCountry)
            : `${(item.amount ?? 0).toLocaleString("fr-FR")} FCFA`}
        </Text>
        <View style={[styles.histBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.histBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
    </View>
  );
}

function ActivityItem({ item, C, userCountry }: { item: any; C: any; userCountry?: Country | null }) {
  const cfg = ACTIVITY_TYPE_CONFIG[item.type] ?? { icon: "activity", color: C.accentIcon, bg: C.iconBg, prefix: "" };
  const scfg = getActivityStatusCfg(item.status ?? "");
  const date = new Date(item.createdAt ?? Date.now());
  const amount = Number(item.amount ?? 0);

  return (
    <View style={[styles.histItem, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={[styles.histIcon, { backgroundColor: cfg.bg }]}>
        <Feather name={cfg.icon} size={18} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.histTitle, { color: C.text }]} numberOfLines={1}>
          {item.label ?? item.type ?? "Transaction"}
        </Text>
        <Text style={[styles.histMeta, { color: C.textMuted }]}>
          {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
          {" · "}
          {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {amount > 0 && (
          <Text style={[styles.histAmount, { color: cfg.color }]}>
            {cfg.prefix}{userCountry && userCountry.xafRate !== 1
            ? formatCurrency(amount, userCountry)
            : `${amount.toLocaleString("fr-FR")} FCFA`}
          </Text>
        )}
        <View style={[styles.histBadge, { backgroundColor: scfg.bg }]}>
          <Text style={[styles.histBadgeText, { color: scfg.color }]}>{scfg.label}</Text>
        </View>
      </View>
    </View>
  );
}

function BalanceCard({
  icon, label, value, currency, color, C, isDark, action, onAction,
}: any) {
  const { scale, onPressIn, onPressOut } = usePressSpring(0.97);
  return (
    <Animated.View style={[styles.balanceCard, { backgroundColor: C.surface, borderColor: color + "40", transform: [{ scale }] }]}>
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut} style={{ gap: 6 }}>
        <View style={[styles.balanceIconBox, { backgroundColor: color + "18", borderColor: color + "30" }]}>
          <Feather name={icon} size={16} color={color} />
        </View>
        <Text style={[styles.balanceLabel, { color: C.textMuted }]}>{label}</Text>
        <Text style={[styles.balanceValue, { color: C.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={[styles.balanceCurrency, { color }]}>{currency}</Text>
        {action && (
          <Pressable
            onPress={onAction}
            style={({ pressed }) => [
              styles.balanceAction,
              { backgroundColor: color + "15", borderColor: color + "30" },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Feather name="arrow-up-right" size={10} color={color} />
            <Text style={[styles.balanceActionText, { color }]}>{action}</Text>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

function ModeSegmented({ payMode, setPayMode, C, isDark }: any) {
  const tabs = [
    { key: "cameroun",      icon: "smartphone" as const, label: "Cameroun",     sub: "MTN · Orange",          color: "#11998e" },
    { key: "international", icon: "globe" as const,      label: "International", sub: "Mobile Money · Carte",  color: INFO },
    { key: "historique",    icon: "list" as const,       label: "Historique",    sub: "Transactions",          color: PURPLE },
  ];
  return (
    <View style={[styles.segment, { backgroundColor: C.surface, borderColor: C.border }]}>
      {tabs.map((t, i) => {
        const active = payMode === t.key;
        return (
          <React.Fragment key={t.key}>
            {i > 0 && <View style={[styles.segmentDivider, { backgroundColor: C.border }]} />}
            <Pressable
              style={({ pressed }) => [
                styles.segmentBtn,
                active && { backgroundColor: t.color + "14" },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => {
                setPayMode(t.key);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={[styles.segmentIconBox, { backgroundColor: active ? t.color + "20" : C.iconBg }]}>
                <Feather name={t.icon} size={14} color={active ? t.color : C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.segmentLabel, { color: active ? t.color : C.text }]} numberOfLines={1}>
                  {t.label}
                </Text>
                <Text style={[styles.segmentSub, { color: C.textMuted }]} numberOfLines={1}>
                  {t.sub}
                </Text>
              </View>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
type PayMode = "cameroun" | "international" | "historique";
type IntlMethod = "mobilemoney" | "card";

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { recharges, isLoading } = useWallet();
  const { isDark: ctxIsDark, toggleTheme } = useTheme();
  const isDark = ctxIsDark === true;

  const { show: showModal, modalEl: appModal } = useAppModal();

  const C = useMemo(() => ({
    bg:          isDark ? DARK_BG         : LIGHT_BG,
    surface:     isDark ? DARK_SURFACE    : LIGHT_SURFACE,
    border:      isDark ? DARK_BORDER     : LIGHT_BORDER,
    separator:   isDark ? DARK_BORDER     : LIGHT_BORDER,
    text:        isDark ? DARK_TEXT       : LIGHT_TEXT,
    textMuted:   isDark ? DARK_TEXT_2     : LIGHT_TEXT_2,
    inputBg:     isDark ? DARK_INPUT_BG   : LIGHT_INPUT_BG,
    inputBorder: isDark ? DARK_BORDER     : LIGHT_BORDER,
    iconBg:      isDark ? DARK_ICON_BG    : LIGHT_ICON_BG,
    iconBorder:  isDark ? DARK_ICON_BORD  : LIGHT_ICON_BORD,
    accentIcon:  isDark ? GOLD            : NAVY,
  }), [isDark]);

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;

  const userCountry = user?.country
    ? COUNTRIES.find((c) => c.code === user.country?.toLowerCase()) ?? null
    : null;

  const [payMode, setPayMode] = useState<PayMode>("cameroun");
  const [submitting, setSubmitting] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const [fapshiAmount, setFapshiAmount] = useState("");
  const [fapshiDesc, setFapshiDesc] = useState("Rechargement SBH");

  // ── International ──
  const [intlMethod, setIntlMethod] = useState<IntlMethod>("mobilemoney");
  const [intlCountry, setIntlCountry] = useState<PayCountry>(
    INTL_COUNTRIES.find((c) => c.code === "cm") ?? INTL_COUNTRIES[0]
  );
  const [intlPhone, setIntlPhone] = useState("");
  const [intlAmount, setIntlAmount] = useState("");
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  // ── Carte bancaire ──
  const [cardCountry, setCardCountry] = useState<CardCountry>(
    CARD_COUNTRIES.find((c) => c.code === "cm") ?? CARD_COUNTRIES[0]
  );
  const [showCardCountryModal, setShowCardCountryModal] = useState(false);
  const [cardCountrySearch, setCardCountrySearch] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [nelsiusPolling, setNelsiusPolling] = useState(false);

  // ── Transfert / Retrait ──
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState<"main" | "withdrawal" | null>(null);
  const [transferring, setTransferring] = useState(false);

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [wdCountry, setWdCountry] = useState<PayCountry>(INTL_COUNTRIES[0]);
  const [wdPhone, setWdPhone] = useState("");
  const [wdAmount, setWdAmount] = useState("");
  const [wdMethod, setWdMethod] = useState("MTN Mobile Money");
  const [wdSubmitting, setWdSubmitting] = useState(false);
  const [showWdCountryModal, setShowWdCountryModal] = useState(false);
  const [wdCountrySearch, setWdCountrySearch] = useState("");

  const withdrawal = user?.withdrawalBalance ?? 0;
  const balance = user?.balance ?? 0;
  const referral = user?.referralBalance ?? 0;

  const entry0 = useEntry(60);
  const entry1 = useEntry(140);
  const entry2 = useEntry(220);

  // ─────────────────────────────────────────────────────────────
  // Cache : restaurer numéro / pays au démarrage
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cachedPhone, cachedIntlCountry, cachedCardCountry] = await Promise.all([
        cacheGet(CACHE_KEYS.intlPhone),
        cacheGet(CACHE_KEYS.intlCountry),
        cacheGet(CACHE_KEYS.cardCountry),
      ]);
      if (cancelled) return;

      if (cachedPhone) setIntlPhone(cachedPhone);

      if (cachedIntlCountry) {
        const match = INTL_COUNTRIES.find((c) => c.code === cachedIntlCountry);
        if (match) setIntlCountry(match);
      } else {
        const detect = detectDeviceRegion() ?? (user?.country ? String(user.country).toLowerCase() : null);
        if (detect) {
          const match = INTL_COUNTRIES.find((c) => c.code === detect);
          if (match) setIntlCountry(match);
        }
      }

      if (cachedCardCountry) {
        const match = CARD_COUNTRIES.find((c) => c.code === cachedCardCountry);
        if (match) setCardCountry(match);
      } else {
        const detect = detectDeviceRegion() ?? (user?.country ? String(user.country).toLowerCase() : null);
        if (detect) {
          const match = CARD_COUNTRIES.find((c) => c.code === detect);
          if (match) setCardCountry(match);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.country]);

  // ─────────────────────────────────────────────────────────────
  // Handlers transfert / retrait
  // ─────────────────────────────────────────────────────────────
  const handleTransfer = async () => {
    const ref = user?.referralBalance ?? 0;
    if (ref <= 0) {
      showModal({
        kind: "warning",
        title: "Solde insuffisant",
        message: "Vous n'avez aucun solde parrainage à transférer.",
      });
      return;
    }
    if (!transferTarget) {
      showModal({
        kind: "warning",
        title: "Destination requise",
        message: "Choisissez vers quel solde vous souhaitez transférer.",
      });
      return;
    }
    setTransferring(true);
    try {
      const res = await apiClient.wallet.transfer(transferTarget);
      if (res.success) {
        await refreshUser();
        setShowTransferModal(false);
        setTransferTarget(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showModal({
          kind: "success",
          title: "Transfert réussi",
          message: `${ref.toLocaleString("fr-FR")} FCFA transférés vers votre solde ${transferTarget === "main" ? "principal" : "de retrait"}.`,
        });
      } else {
        showModal({ kind: "error", title: "Transfert impossible", message: res.error ?? "Veuillez réessayer." });
      }
    } catch (e: any) {
      showModal({ kind: "error", title: "Erreur de connexion", message: e?.message ?? "Vérifiez votre connexion." });
    } finally {
      setTransferring(false);
    }
  };

  const WITHDRAWAL_FEE = 455;
  const WITHDRAWAL_FEE_THRESHOLD = 10000;

  const doWithdraw = async (feeSource?: "main" | "withdrawal") => {
    const amt = parseInt(wdAmount, 10);
    setWdSubmitting(true);
    try {
      const res = await apiClient.wallet.withdraw({
        amount: amt,
        phone: `${wdCountry.phoneCode}${wdPhone.replace(/\D/g, "")}`,
        country: wdCountry.code.toUpperCase(),
        countryName: wdCountry.name,
        method: wdMethod,
        feeSource,
      });
      if (res.success) {
        await refreshUser();
        setShowWithdrawModal(false);
        setWdAmount(""); setWdPhone("");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showModal({
          kind: "success",
          title: "Retrait soumis",
          message: `Votre demande de retrait de ${amt.toLocaleString("fr-FR")} FCFA a été enregistrée.`,
        });
      } else {
        showModal({ kind: "error", title: "Retrait impossible", message: res.error ?? "Veuillez réessayer." });
      }
    } catch (e: any) {
      showModal({ kind: "error", title: "Erreur de connexion", message: e?.message ?? "Vérifiez votre connexion." });
    } finally {
      setWdSubmitting(false);
    }
  };

  const handleWithdraw = () => {
    const MIN = 1500;
    const amt = parseInt(wdAmount, 10);
    if (!amt || amt < MIN) {
      showModal({
        kind: "warning",
        title: "Montant invalide",
        message: `Le retrait minimum est de ${MIN.toLocaleString("fr-FR")} FCFA.`,
      });
      return;
    }
    if (amt > withdrawal) {
      showModal({
        kind: "warning",
        title: "Solde insuffisant",
        message: `Votre solde retrait est de ${withdrawal.toLocaleString("fr-FR")} FCFA.`,
      });
      return;
    }
    if (!wdPhone.trim()) {
      showModal({ kind: "warning", title: "Numéro requis", message: "Entrez votre numéro Mobile Money." });
      return;
    }

    const fee = amt < WITHDRAWAL_FEE_THRESHOLD ? WITHDRAWAL_FEE : 0;
    if (fee === 0) { doWithdraw(undefined); return; }

    const mainBal = user?.balance ?? 0;
    const canPayFromMain = mainBal >= fee;
    const canPayFromWithdrawal = withdrawal >= amt + fee;

    if (!canPayFromMain && !canPayFromWithdrawal) {
      showModal({
        kind: "warning",
        title: "Fonds insuffisants",
        message: `Des frais de ${fee} FCFA s'appliquent aux retraits inférieurs à ${WITHDRAWAL_FEE_THRESHOLD.toLocaleString("fr-FR")} FCFA.\n\nSolde principal : ${mainBal.toLocaleString("fr-FR")} FCFA\nSolde retrait : ${withdrawal.toLocaleString("fr-FR")} FCFA`,
      });
      return;
    }

    const buttons: ModalButton[] = [];
    if (canPayFromMain) {
      buttons.push({
        label: `Solde principal (${mainBal.toLocaleString("fr-FR")} FCFA)`,
        onPress: () => doWithdraw("main"),
        style: "primary",
      });
    }
    if (canPayFromWithdrawal) {
      buttons.push({
        label: `Solde retrait (${(withdrawal - amt).toLocaleString("fr-FR")} FCFA)`,
        onPress: () => doWithdraw("withdrawal"),
        style: "primary",
      });
    }
    buttons.push({ label: "Annuler", style: "cancel" });

    showModal({
      kind: "info",
      title: `Frais de retrait : ${fee} FCFA`,
      message: `Des frais de ${fee} FCFA s'appliquent aux retraits inférieurs à ${WITHDRAWAL_FEE_THRESHOLD.toLocaleString("fr-FR")} FCFA.\n\nDepuis quel solde souhaitez-vous payer ces frais ?`,
      buttons,
    });
  };

  const filteredWdCountries = searchCountries(INTL_COUNTRIES, wdCountrySearch);
  const filteredCountries = searchCountries(INTL_COUNTRIES, countrySearch);
  const filteredCardCountries = searchCountries(CARD_COUNTRIES, cardCountrySearch);

  const amountPresets = AMOUNTS_FCFA.map((a) => ({
    xaf: a,
    local: getEquivalentLocal(a, intlCountry),
  }));

  const CARD_PRESETS_XAF = [2000, 5000, 10000, 20000, 50000, 100000];
  const cardPresets = CARD_PRESETS_XAF.map((xaf) => ({
    xaf,
    local: cardConvertFromXAF(xaf, cardCountry.currency),
  }));

  const PAYMENT_TYPES = new Set(["depot", "parrainage", "transfert", "retrait"]);

  const mergeRecharges = (acts: any[], contextRecharges: any[]): any[] => {
    const seenIds = new Set(acts.map((a: any) => a.id).filter(Boolean));
    const seenTransIds = new Set(acts.map((a: any) => a.transId).filter(Boolean));
    const extra = (contextRecharges as any[])
      .map((r) => ({
        id: r.id,
        type: "depot",
        label: r.method ?? "Dépôt Mobile Money",
        amount: r.amount ?? 0,
        status: r.status ?? "pending",
        transId: r.transactionId ?? r.transId ?? "",
        phone: r.phone ?? "",
        createdAt: r.createdAt,
      }))
      .filter((r) => {
        if (seenIds.has(r.id)) return false;
        if (r.transId && seenTransIds.has(r.transId)) return false;
        return true;
      });
    return [...acts, ...extra].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  };

  const loadActivities = useCallback(async () => {
    setLoadingActivities(true);
    try {
      const res = await apiClient.wallet.activities();
      const fromApi: any[] = res.success && Array.isArray(res.data)
        ? (res.data as any[]).filter((a) => PAYMENT_TYPES.has(a.type))
        : [];
      setActivities(mergeRecharges(fromApi, recharges as any[]));
    } catch {
      const fallback = (recharges as any[]).map((r) => ({
        id: r.id,
        type: "depot",
        label: r.method ?? "Dépôt Mobile Money",
        amount: r.amount ?? 0,
        status: r.status ?? "pending",
        createdAt: r.createdAt,
      }));
      setActivities(fallback.sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } finally {
      setLoadingActivities(false);
    }
  }, [recharges]);

  useEffect(() => {
    if (payMode === "historique") loadActivities();
  }, [payMode, loadActivities]);

  // ─────────────────────────────────────────────────────────────
  // Fapshi (Cameroun)
  // ─────────────────────────────────────────────────────────────
  const confirmFapshiPayment = async (transId: string, amount: number) => {
    const MAX_ATTEMPTS = 3;
    const DELAY_MS = 5000;
    setIsPolling(true);
    let credited = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await apiClient.wallet.fapshiConfirm(transId, amount);
        if (res.success && (res.data?.credited || (res as any).alreadyCredited)) {
          credited = true;
          await refreshUser();
          loadActivities();
          setIsPolling(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showModal({
            kind: "success",
            title: "Paiement confirmé",
            message: `${(res.data?.credited ?? amount).toLocaleString("fr-FR")} FCFA ont été crédités sur votre solde.`,
          });
          return;
        }
      } catch {}
      if (attempt < MAX_ATTEMPTS) {
        await new Promise<void>((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }
    setIsPolling(false);
    if (!credited) {
      await refreshUser();
      loadActivities();
      showModal({
        kind: "info",
        title: "Paiement en cours de traitement",
        message: "Votre paiement est en cours de validation.\n\nVotre solde sera mis à jour automatiquement dès confirmation. Vous pouvez consulter l'historique pour vérifier.",
      });
    }
  };

  const handleFapshiPay = async () => {
    const amount = parseInt(fapshiAmount, 10);
    if (!amount || amount < 100) {
      showModal({ kind: "warning", title: "Montant invalide", message: "Le montant minimum est de 100 FCFA." });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}api/create-fapshi-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: fapshiDesc || "Rechargement Social Boost Horizon",
          externalId: user?.id,
        }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        try {
          const token = await getFreshToken();
          await fetch(`${BASE_URL}api/wallet/record-pending-recharge`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ transId: data.transId, amount, method: "Fapshi Mobile Money" }),
          });
          loadActivities();
        } catch {}
        setSubmitting(false);
        await WebBrowser.openBrowserAsync(data.checkoutUrl);
        if (data.transId) await confirmFapshiPayment(data.transId, amount);
      } else {
        showModal({
          kind: "error",
          title: "Paiement impossible",
          message: data.error ?? data.message ?? "Veuillez réessayer.",
        });
      }
    } catch (e: any) {
      showModal({ kind: "error", title: "Erreur de connexion", message: e?.message ?? "Vérifiez votre connexion." });
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Mobile Money International
  // ─────────────────────────────────────────────────────────────
  const handleIntlPay = async () => {
    const amountLocal = parseInt(intlAmount, 10);
    const minLocal = getEquivalentLocal(500, intlCountry);
    if (!amountLocal || amountLocal < minLocal) {
      showModal({
        kind: "warning",
        title: "Montant invalide",
        message: `Le minimum est de ${minLocal.toLocaleString("fr-FR")} ${intlCountry.currencySymbol}.`,
      });
      return;
    }
    if (!intlPhone.trim()) {
      showModal({ kind: "warning", title: "Numéro requis", message: "Entrez votre numéro Mobile Money." });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      // Cache : mémoriser le numéro et le pays choisis
      await Promise.all([
        cacheSet(CACHE_KEYS.intlPhone, intlPhone.trim()),
        cacheSet(CACHE_KEYS.intlCountry, intlCountry.code),
      ]);

      const amountXAF = getEquivalentXAF(amountLocal, intlCountry);
      const res = await apiClient.wallet.createIntlPayment({
        amount: amountLocal,
        amountXAF,
        currency: intlCountry.currency,
        country: intlCountry.code.toUpperCase(),
        phone: intlPhone.trim(),
        username: user?.name ?? undefined,
        email: user?.email ?? undefined,
      });
      if (res && (res as any).success && (res as any).checkoutUrl) {
        const checkoutUrl = (res as any).checkoutUrl as string;
        await WebBrowser.openBrowserAsync(checkoutUrl);
        await refreshUser();
        loadActivities();
        showModal({
          kind: "info",
          title: "Paiement initié",
          message: "Votre solde sera mis à jour automatiquement dès confirmation. Vous pouvez consulter l'historique pour suivre l'opération.",
        });
      } else {
        showModal({
          kind: "error",
          title: "Paiement impossible",
          message: (res as any)?.error ?? "Veuillez réessayer.",
        });
      }
    } catch (e: any) {
      showModal({ kind: "error", title: "Erreur de connexion", message: e?.message ?? "Vérifiez votre connexion." });
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Carte bancaire NelsiusPay
  // ─────────────────────────────────────────────────────────────
  const handleNelsiusPay = async () => {
    const amount = parseInt(cardAmount, 10);
    if (!amount || amount < 1) {
      showModal({ kind: "warning", title: "Montant invalide", message: "Entrez un montant valide." });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      // Cache : mémoriser le pays choisi
      await cacheSet(CACHE_KEYS.cardCountry, cardCountry.code);

      const res = await apiClient.wallet.nelsiuspayCheckout({
        amount,
        currency: cardCountry.currency,
      });
      if (res && (res as any).success && (res as any).checkoutUrl) {
        const reference = (res as any).reference as string;
        const checkoutUrl = (res as any).checkoutUrl as string;

        await WebBrowser.openBrowserAsync(checkoutUrl);

        setNelsiusPolling(true);
        let credited = false;
        for (let i = 0; i < 6; i++) {
          await new Promise<void>((resolve) => setTimeout(resolve, i === 0 ? 1000 : 4000));
          try {
            const statusRes = await apiClient.wallet.nelsiuspayStatus(reference);
            if (statusRes && (statusRes as any).success) {
              const st = (statusRes as any).status;
              if (st === "CONFIRMED") {
                credited = true;
                await refreshUser();
                loadActivities();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                const creditedXAF = (statusRes as any).creditedAmountXAF;
                showModal({
                  kind: "success",
                  title: "Paiement confirmé",
                  message: creditedXAF
                    ? `${Number(creditedXAF).toLocaleString("fr-FR")} FCFA ont été crédités sur votre solde.`
                    : "Votre solde a été mis à jour.",
                });
                break;
              }
              if (st === "FAILED") {
                showModal({
                  kind: "error",
                  title: "Paiement non confirmé",
                  message: "Le paiement n'a pas abouti. Aucun montant n'a été débité.",
                });
                break;
              }
            }
          } catch {}
        }
        setNelsiusPolling(false);
        if (!credited) {
          await refreshUser();
          loadActivities();
          showModal({
            kind: "info",
            title: "Paiement en cours de traitement",
            message: "Votre paiement est en cours de validation.\n\nVotre solde sera mis à jour automatiquement dès confirmation.",
          });
        }
      } else {
        showModal({
          kind: "error",
          title: "Paiement impossible",
          message: (res as any)?.error ?? "Veuillez réessayer.",
        });
      }
    } catch (e: any) {
      showModal({ kind: "error", title: "Erreur de connexion", message: e?.message ?? "Vérifiez votre connexion." });
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    Haptics.selectionAsync();
    if (router.canGoBack?.()) router.back();
    else router.push("/(tabs)" as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <StarBackground dark={isDark} />

      {appModal}

      {/* Polling overlay Fapshi */}
      <Modal visible={isPolling} transparent animationType="fade">
        <View style={styles.pollingOverlay}>
          <View style={[styles.pollingCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "#11998e18", alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color="#11998e" />
            </View>
            <Text style={[styles.pollingTitle, { color: C.text }]}>Vérification du paiement</Text>
            <Text style={[styles.pollingDesc, { color: C.textMuted }]}>
              Merci de patienter quelques instants…
            </Text>
          </View>
        </View>
      </Modal>

      {/* Polling overlay NelsiusPay */}
      <Modal visible={nelsiusPolling} transparent animationType="fade">
        <View style={styles.pollingOverlay}>
          <View style={[styles.pollingCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: GOLD + "22", alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color={GOLD} />
            </View>
            <Text style={[styles.pollingTitle, { color: C.text }]}>Vérification du paiement</Text>
            <Text style={[styles.pollingDesc, { color: C.textMuted }]}>
              Merci de patienter quelques instants…
            </Text>
          </View>
        </View>
      </Modal>

      {/* ═══ HEADER ═══ */}
      <LinearGradient
        colors={isDark ? ["#132C57", "#0A1C3A"] : ["#FFFFFF", "#FBF8F1"]}
        style={[styles.header, { paddingTop: topPad + 12 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      >
        {!isDark && <View style={styles.headerGoldLine} />}

        <Pressable
          onPress={goBack}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(10,28,58,0.05)",
              borderColor: isDark ? "transparent" : LIGHT_BORDER,
            },
            pressed && { opacity: 0.85 },
          ]}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={20} color={isDark ? "#fff" : NAVY} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: isDark ? "#FFFFFF" : NAVY }]}>
            Mon Portefeuille
          </Text>
          <Text style={[styles.headerSub, { color: isDark ? "rgba(255,255,255,0.7)" : LIGHT_TEXT_2 }]}>
            Gérez votre solde en toute sécurité
          </Text>
        </View>

        <Pressable
          onPress={() => { Haptics.selectionAsync(); toggleTheme(); }}
          style={({ pressed }) => [
            styles.headerBtn,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(10,28,58,0.05)",
              borderColor: isDark ? "transparent" : LIGHT_BORDER,
              borderWidth: isDark ? 0 : 1,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Feather name={isDark ? "sun" : "moon"} size={17} color={isDark ? GOLD : NAVY} />
        </Pressable>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ═══ BALANCES ═══ */}
        <Animated.View
          style={{
            opacity: entry0,
            transform: [{ translateY: entry0.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            gap: 12,
          }}
        >
          <View
            style={[
              styles.mainBalanceCard,
              {
                borderColor: isDark ? GOLD + "30" : "rgba(212,175,55,0.22)",
                shadowColor: isDark ? "#000" : NAVY,
              },
            ]}
          >
            <LinearGradient
              colors={isDark ? ["#132C57", "#0A1C3A", "#071229"] : ["#FFFFFF", "#FBF8F1"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.mainBalanceGrad}
            >
              {!isDark && <View style={styles.goldTopLine} />}
              <View style={styles.mainBalanceTop}>
                <View style={{ flex: 1 }}>
                  <View style={styles.mainBalanceLabelRow}>
                    <View style={[styles.mainBalanceIconBox, { backgroundColor: isDark ? "rgba(212,175,55,0.15)" : "rgba(10,28,58,0.06)" }]}>
                      <Feather name="credit-card" size={13} color={isDark ? GOLD : NAVY} />
                    </View>
                    <Text style={[styles.mainBalanceLabel, { color: isDark ? "rgba(255,255,255,0.65)" : LIGHT_TEXT_2 }]}>
                      Solde principal
                    </Text>
                  </View>
                  <Text style={[styles.mainBalanceValue, { color: isDark ? "#FFFFFF" : NAVY }]}>
                    {userCountry && userCountry.xafRate !== 1
                      ? formatCurrency(balance, userCountry)
                      : `${balance.toLocaleString("fr-FR")} FCFA`}
                  </Text>
                </View>
                <View
                  style={[
                    styles.mainBalanceIconLarge,
                    {
                      backgroundColor: isDark ? "rgba(212,175,55,0.15)" : "rgba(212,175,55,0.18)",
                      borderColor: isDark ? GOLD + "40" : "rgba(212,175,55,0.35)",
                    },
                  ]}
                >
                  <Feather name="wallet" size={26} color={isDark ? GOLD : GOLD_SOFT} />
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.balanceRow}>
            <BalanceCard
              icon="gift"
              label="Parrainage"
              value={userCountry && userCountry.xafRate !== 1
                ? Math.round(referral * userCountry.xafRate).toLocaleString("fr-FR")
                : referral.toLocaleString("fr-FR")}
              currency={userCountry?.currencySymbol ?? "FCFA"}
              color={GOLD}
              C={C}
              isDark={isDark}
              action="Transférer"
              onAction={() => { setTransferTarget(null); setShowTransferModal(true); Haptics.selectionAsync(); }}
            />
            <BalanceCard
              icon="download-cloud"
              label="Retrait"
              value={userCountry && userCountry.xafRate !== 1
                ? Math.round(withdrawal * userCountry.xafRate).toLocaleString("fr-FR")
                : withdrawal.toLocaleString("fr-FR")}
              currency={userCountry?.currencySymbol ?? "FCFA"}
              color={PURPLE}
              C={C}
              isDark={isDark}
              action="Retirer"
              onAction={() => { setWdAmount(""); setWdPhone(""); setShowWithdrawModal(true); Haptics.selectionAsync(); }}
            />
          </View>
        </Animated.View>

        {/* ═══ TABS ═══ */}
        <Animated.View
          style={{
            opacity: entry1,
            transform: [{ translateY: entry1.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          }}
        >
          <ModeSegmented payMode={payMode} setPayMode={setPayMode} C={C} isDark={isDark} />
        </Animated.View>

        {/* ═══ CAMEROUN ═══ */}
        {payMode === "cameroun" && (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <Animated.View
              style={[
                styles.formSection,
                {
                  backgroundColor: C.surface,
                  borderColor: "#11998e" + "35",
                  opacity: entry2,
                  transform: [{ translateY: entry2.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
                },
              ]}
            >
              <View style={[styles.formHeader, { backgroundColor: "#11998e" + "14", borderColor: "#11998e" + "25" }]}>
                <View style={[styles.formHeaderIcon, { backgroundColor: "#11998e" + "20" }]}>
                  <Feather name="smartphone" size={20} color="#11998e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formTitle, { color: C.text }]}>Dépôt Mobile Money</Text>
                  <Text style={[styles.formSub, { color: C.textMuted }]}>MTN MoMo · Orange Money</Text>
                </View>
              </View>

              <View style={styles.formBody}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Choisissez un montant</Text>
                <View style={styles.presetsWrap}>
                  {AMOUNTS_FCFA.map((a) => {
                    const isActive = fapshiAmount === String(a);
                    return (
                      <Pressable
                        key={a}
                        style={({ pressed }) => [
                          styles.presetChip,
                          {
                            backgroundColor: isActive ? "#11998e" : C.inputBg,
                            borderColor: isActive ? "#11998e" : C.inputBorder,
                          },
                          pressed && { opacity: 0.85 },
                        ]}
                        onPress={() => { setFapshiAmount(String(a)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      >
                        <Text style={[styles.presetChipText, { color: isActive ? "#fff" : C.text }]}>
                          {a.toLocaleString()}
                        </Text>
                        <Text style={[styles.presetChipSub, { color: isActive ? "rgba(255,255,255,0.75)" : C.textMuted }]}>
                          FCFA
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                  <Feather name="edit-3" size={16} color={C.textMuted} />
                  <TextInput
                    style={[styles.input, { color: C.text }]}
                    placeholder="Montant personnalisé…"
                    placeholderTextColor={C.textMuted}
                    keyboardType="numeric"
                    value={fapshiAmount}
                    onChangeText={setFapshiAmount}
                  />
                  <Text style={[styles.inputSuffix, { color: C.textMuted }]}>FCFA</Text>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.9 }, submitting && { opacity: 0.6 }]}
                  onPress={handleFapshiPay}
                  disabled={submitting}
                >
                  <LinearGradient colors={["#11998e", "#38ef7d"]} style={styles.payBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="smartphone" size={18} color="#fff" />}
                    <Text style={styles.payBtnText}>{submitting ? "Traitement…" : "Payer maintenant"}</Text>
                    {!submitting && <Feather name="arrow-right" size={18} color="#fff" />}
                  </LinearGradient>
                </Pressable>

                <View style={styles.methodsRow}>
                  {["MTN MoMo", "Orange Money"].map((op, idx) => (
                    <View key={op} style={[styles.methodChip, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                      <View style={[styles.methodDot, { backgroundColor: idx === 0 ? "#FFCC00" : "#FF6600" }]} />
                      <Text style={[styles.methodChipText, { color: C.text }]}>{op}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        )}

        {/* ═══ INTERNATIONAL ═══ */}
        {payMode === "international" && (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <Animated.View
              style={[
                styles.formSection,
                {
                  backgroundColor: C.surface,
                  borderColor: INFO + "35",
                  opacity: entry2,
                  transform: [{ translateY: entry2.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
                },
              ]}
            >
              <View style={[styles.formHeader, { backgroundColor: INFO + "12", borderColor: INFO + "25" }]}>
                <View style={[styles.formHeaderIcon, { backgroundColor: INFO + "20" }]}>
                  <Feather name="globe" size={20} color={INFO} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formTitle, { color: C.text }]}>Dépôt International</Text>
                  <Text style={[styles.formSub, { color: C.textMuted }]}>Mobile Money ou carte bancaire</Text>
                </View>
              </View>

              {/* Sous-toggle */}
              <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14 }}>
                <Pressable
                  onPress={() => { setIntlMethod("mobilemoney"); Haptics.selectionAsync(); }}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 11,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      backgroundColor: intlMethod === "mobilemoney" ? INFO + "18" : C.inputBg,
                      borderColor: intlMethod === "mobilemoney" ? INFO : C.border,
                    },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Feather name="smartphone" size={14} color={intlMethod === "mobilemoney" ? INFO : C.textMuted} />
                  <Text
                    style={[styles.methodBtnText, { color: intlMethod === "mobilemoney" ? INFO : C.text, marginLeft: 6 }]}
                    numberOfLines={1}
                  >
                    Mobile Money
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => { setIntlMethod("card"); Haptics.selectionAsync(); }}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 11,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      backgroundColor: intlMethod === "card" ? GOLD + "18" : C.inputBg,
                      borderColor: intlMethod === "card" ? GOLD : C.border,
                    },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Feather name="credit-card" size={14} color={intlMethod === "card" ? GOLD : C.textMuted} />
                  <Text
                    style={[styles.methodBtnText, { color: intlMethod === "card" ? GOLD : C.text, marginLeft: 6 }]}
                    numberOfLines={1}
                  >
                    Carte bancaire
                  </Text>
                </Pressable>
              </View>

              {/* Mobile Money */}
              {intlMethod === "mobilemoney" && (
                <View style={styles.formBody}>
                  <View>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Pays</Text>
                    <Pressable
                      style={[styles.countryBtn, { backgroundColor: C.inputBg, borderColor: INFO + "40" }]}
                      onPress={() => { setShowCountryModal(true); setCountrySearch(""); }}
                    >
                      <Text style={styles.countryFlag}>{intlCountry.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.countryName, { color: C.text }]} numberOfLines={1}>{intlCountry.name}</Text>
                        <Text style={[styles.countrySub, { color: C.textMuted }]} numberOfLines={1}>
                          {intlCountry.phoneCode} · {intlCountry.operators.join(" · ")}
                        </Text>
                      </View>
                      <Feather name="chevron-down" size={16} color={INFO} />
                    </Pressable>
                  </View>

                  <View>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Numéro Mobile Money</Text>
                    <View style={[styles.phoneRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                      <View style={[styles.phoneCodeBox, { backgroundColor: INFO + "14" }]}>
                        <Text style={[styles.phoneCodeText, { color: INFO }]}>{intlCountry.phoneCode}</Text>
                      </View>
                      <TextInput
                        style={[styles.phoneInput, { color: C.text }]}
                        placeholder="6XX XXX XXX"
                        placeholderTextColor={C.textMuted}
                        keyboardType="phone-pad"
                        value={intlPhone}
                        onChangeText={setIntlPhone}
                      />
                    </View>
                  </View>

                  <View>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                      Montant ({intlCountry.currencySymbol})
                    </Text>
                    <View style={styles.presetsWrap}>
                      {amountPresets.map((p) => {
                        const isActive = intlAmount === String(p.local);
                        return (
                          <Pressable
                            key={p.xaf}
                            style={({ pressed }) => [
                              styles.presetChip,
                              {
                                backgroundColor: isActive ? INFO : C.inputBg,
                                borderColor: isActive ? INFO : C.inputBorder,
                              },
                              pressed && { opacity: 0.85 },
                            ]}
                            onPress={() => { setIntlAmount(String(p.local)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                          >
                            <Text style={[styles.presetChipText, { color: isActive ? "#fff" : C.text }]}>
                              {p.local.toLocaleString()}
                            </Text>
                            <Text style={[styles.presetChipSub, { color: isActive ? "rgba(255,255,255,0.75)" : C.textMuted }]}>
                              {intlCountry.currencySymbol}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                      <Feather name="edit-3" size={16} color={C.textMuted} />
                      <TextInput
                        style={[styles.input, { color: C.text }]}
                        placeholder={`Montant en ${intlCountry.currencySymbol}`}
                        placeholderTextColor={C.textMuted}
                        keyboardType="numeric"
                        value={intlAmount}
                        onChangeText={setIntlAmount}
                      />
                      <Text style={[styles.inputSuffix, { color: C.textMuted }]}>{intlCountry.currencySymbol}</Text>
                    </View>

                    {intlAmount ? (
                      <View style={[styles.conversionRow, { backgroundColor: INFO + "10", borderColor: INFO + "30" }]}>
                        <Feather name="refresh-cw" size={12} color={INFO} />
                        <Text style={[styles.conversionText, { color: INFO }]}>
                          ≈ {getEquivalentXAF(parseInt(intlAmount) || 0, intlCountry).toLocaleString("fr-FR")} FCFA
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Pressable
                    style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.9 }, submitting && { opacity: 0.6 }]}
                    onPress={handleIntlPay}
                    disabled={submitting}
                  >
                    <LinearGradient colors={isDark ? [NAVY_LIGHT, NAVY] : [INFO, "#2563EB"]} style={styles.payBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                      {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="credit-card" size={18} color="#fff" />}
                      <Text style={styles.payBtnText}>{submitting ? "Traitement…" : "Procéder au paiement"}</Text>
                      {!submitting && <Feather name="arrow-right" size={18} color={isDark ? GOLD : "#fff"} />}
                    </LinearGradient>
                  </Pressable>
                </View>
              )}

              {/* Carte bancaire */}
              {intlMethod === "card" && (
                <View style={styles.formBody}>
                  <View>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Pays</Text>
                    <Pressable
                      style={[styles.countryBtn, { backgroundColor: C.inputBg, borderColor: GOLD + "40" }]}
                      onPress={() => { setShowCardCountryModal(true); setCardCountrySearch(""); }}
                    >
                      <Text style={styles.countryFlag}>{cardCountry.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.countryName, { color: C.text }]} numberOfLines={1}>
                          {cardCountry.name}
                        </Text>
                        <Text style={[styles.countrySub, { color: C.textMuted }]} numberOfLines={1}>
                          {cardCountry.currency} · {cardCountry.currencySymbol}
                        </Text>
                      </View>
                      <Feather name="chevron-down" size={16} color={GOLD} />
                    </Pressable>
                  </View>

                  <View>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                      Montant ({cardCountry.currencySymbol})
                    </Text>
                    <View style={styles.presetsWrap}>
                      {cardPresets.map((p) => {
                        const isActive = cardAmount === String(p.local);
                        return (
                          <Pressable
                            key={p.xaf}
                            style={({ pressed }) => [
                              styles.presetChip,
                              {
                                backgroundColor: isActive ? GOLD : C.inputBg,
                                borderColor: isActive ? GOLD : C.inputBorder,
                              },
                              pressed && { opacity: 0.85 },
                            ]}
                            onPress={() => { setCardAmount(String(p.local)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                          >
                            <Text style={[styles.presetChipText, { color: isActive ? "#000" : C.text }]}>
                              {p.local.toLocaleString()}
                            </Text>
                            <Text style={[styles.presetChipSub, { color: isActive ? "rgba(0,0,0,0.65)" : C.textMuted }]}>
                              {cardCountry.currencySymbol}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                      <Feather name="credit-card" size={16} color={C.textMuted} />
                      <TextInput
                        style={[styles.input, { color: C.text }]}
                        placeholder={`Montant en ${cardCountry.currencySymbol}`}
                        placeholderTextColor={C.textMuted}
                        keyboardType="numeric"
                        value={cardAmount}
                        onChangeText={setCardAmount}
                      />
                      <Text style={[styles.inputSuffix, { color: C.textMuted }]}>
                        {cardCountry.currencySymbol}
                      </Text>
                    </View>
                    {cardAmount ? (
                      <View style={[styles.conversionRow, { backgroundColor: GOLD + "10", borderColor: GOLD + "30" }]}>
                        <Feather name="refresh-cw" size={12} color={GOLD} />
                        <Text style={[styles.conversionText, { color: GOLD }]}>
                          ≈ {cardConvertToXAF(parseInt(cardAmount) || 0, cardCountry.currency).toLocaleString("fr-FR")} FCFA
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Pressable
                    style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.9 }, submitting && { opacity: 0.6 }]}
                    onPress={handleNelsiusPay}
                    disabled={submitting}
                  >
                    <LinearGradient
                      colors={[GOLD_SOFT, GOLD]}
                      style={styles.payBtnGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      {submitting ? (
                        <ActivityIndicator size="small" color="#000" />
                      ) : (
                        <Feather name="credit-card" size={18} color="#000" />
                      )}
                      <Text style={[styles.payBtnText, { color: "#000" }]}>
                        {submitting ? "Traitement…" : "Payer par carte"}
                      </Text>
                      {!submitting && <Feather name="arrow-right" size={18} color="#000" />}
                    </LinearGradient>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          </KeyboardAvoidingView>
        )}

        {/* ═══ HISTORIQUE ═══ */}
        {payMode === "historique" && (
          <View style={{ gap: 10 }}>
            <View style={styles.histHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={[styles.accentBar, { backgroundColor: PURPLE }]} />
                <Text style={[styles.histTitle, { color: C.text }]}>Toutes les activités</Text>
              </View>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); loadActivities(); }}
                style={({ pressed }) => [
                  styles.histRefresh,
                  { backgroundColor: C.iconBg, borderColor: C.iconBorder },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Feather name="refresh-cw" size={14} color={C.accentIcon} />
              </Pressable>
            </View>

            {loadingActivities ? (
              <ActivityIndicator size="small" color={PURPLE} style={{ marginVertical: 20 }} />
            ) : activities.length === 0 ? (
              <View style={[styles.emptyHistory, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={[styles.emptyIconBox, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}>
                  <Feather name="inbox" size={32} color={C.accentIcon} />
                </View>
                <Text style={[styles.emptyTitle, { color: C.text }]}>Aucune activité récente</Text>
                <Text style={[styles.emptyText, { color: C.textMuted }]}>
                  Vos dépôts, commandes et remboursements apparaîtront ici
                </Text>
              </View>
            ) : (
              activities.map((a, idx) => (
                <ActivityItem key={a.id ?? idx} item={a} C={C} userCountry={userCountry} />
              ))
            )}
          </View>
        )}

        {/* ═══ RECHARGES RÉCENTES ═══ */}
        {payMode !== "historique" && (
          <View style={{ gap: 10 }}>
            <View style={styles.histHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={[styles.accentBar, { backgroundColor: GOLD }]} />
                <Text style={[styles.histTitle, { color: C.text }]}>Rechargements récents</Text>
              </View>
            </View>
            {isLoading ? (
              <ActivityIndicator size="small" color={C.accentIcon} style={{ marginVertical: 20 }} />
            ) : recharges.length === 0 ? (
              <View style={[styles.emptyHistory, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={[styles.emptyIconBox, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}>
                  <Feather name="inbox" size={28} color={C.accentIcon} />
                </View>
                <Text style={[styles.emptyTitle, { color: C.text }]}>Aucun rechargement récent</Text>
              </View>
            ) : (
              recharges.slice(0, 8).map((r) => <RechargeItem key={r.id} item={r} C={C} userCountry={userCountry} />)
            )}
          </View>
        )}
      </ScrollView>

      {/* ═══ TRANSFER MODAL ═══ */}
      <Modal visible={showTransferModal} animationType="slide" transparent onRequestClose={() => { setShowTransferModal(false); setTransferTarget(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.surface }]}>
            <View style={styles.modalGrabber} />
            <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Transférer vos fonds</Text>
              <Pressable onPress={() => { setShowTransferModal(false); setTransferTarget(null); }} style={[styles.modalClose, { backgroundColor: C.inputBg }]}>
                <Feather name="x" size={18} color={C.text} />
              </Pressable>
            </View>
            <View style={{ padding: 20, gap: 14 }}>
              <View style={[styles.transferInfoBox, { backgroundColor: GOLD + "12", borderColor: GOLD + "30" }]}>
                <View style={[styles.transferInfoIcon, { backgroundColor: GOLD + "22" }]}>
                  <Feather name="gift" size={16} color={GOLD} />
                </View>
                <Text style={[styles.transferInfoText, { color: C.text }]}>
                  Solde parrainage :{" "}
                  <Text style={{ fontFamily: "Inter_700Bold", color: isDark ? GOLD : NAVY }}>
                    {userCountry && userCountry.xafRate !== 1 ? formatCurrency(referral, userCountry) : `${referral.toLocaleString("fr-FR")} FCFA`}
                  </Text>
                </Text>
              </View>

              <Text style={[styles.transferLabel, { color: C.text }]}>Choisissez la destination</Text>

              {[
                { key: "main", label: "Solde Principal", sub: "Utilisez vos fonds pour passer des commandes", icon: "credit-card" as const, color: INFO },
                { key: "withdrawal", label: "Solde de Retrait", sub: "Retirez vos gains en espèces", icon: "download-cloud" as const, color: PURPLE },
              ].map((opt) => {
                const active = transferTarget === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { setTransferTarget(opt.key as any); Haptics.selectionAsync(); }}
                    style={({ pressed }) => [
                      styles.transferOption,
                      {
                        backgroundColor: active ? opt.color + "14" : C.inputBg,
                        borderColor: active ? opt.color : C.border,
                      },
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <View style={[styles.transferOptionIcon, { backgroundColor: opt.color + "20" }]}>
                      <Feather name={opt.icon} size={20} color={opt.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.transferOptionLabel, { color: C.text }]}>{opt.label}</Text>
                      <Text style={[styles.transferOptionSub, { color: C.textMuted }]}>{opt.sub}</Text>
                    </View>
                    {active && <Feather name="check-circle" size={20} color={opt.color} />}
                  </Pressable>
                );
              })}

              <Pressable
                style={({ pressed }) => [
                  styles.transferConfirmBtn,
                  {
                    backgroundColor: transferTarget ? (isDark ? GOLD : NAVY) : C.inputBg,
                    opacity: (!transferTarget || transferring) ? 0.6 : 1,
                  },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={handleTransfer}
                disabled={!transferTarget || transferring}
              >
                {transferring ? (
                  <ActivityIndicator size="small" color={isDark ? "#000" : "#fff"} />
                ) : (
                  <Feather name="arrow-right-circle" size={16} color={transferTarget ? (isDark ? "#000" : "#fff") : C.textMuted} />
                )}
                <Text style={[styles.transferConfirmText, { color: transferTarget ? (isDark ? "#000" : "#fff") : C.textMuted }]}>
                  {transferring ? "Transfert en cours…" : "Confirmer le transfert"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ WITHDRAW MODAL ═══ */}
      <Modal visible={showWithdrawModal} animationType="slide" transparent onRequestClose={() => setShowWithdrawModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.surface, maxHeight: "90%" }]}>
            <View style={styles.modalGrabber} />
            <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Retrait Mobile Money</Text>
              <Pressable onPress={() => setShowWithdrawModal(false)} style={[styles.modalClose, { backgroundColor: C.inputBg }]}>
                <Feather name="x" size={18} color={C.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <View style={[styles.withdrawInfo, { backgroundColor: PURPLE + "12", borderColor: PURPLE + "30" }]}>
                <View style={[styles.withdrawIcon, { backgroundColor: PURPLE + "22" }]}>
                  <Feather name="download-cloud" size={18} color={PURPLE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.withdrawInfoText, { color: C.text }]}>
                    Solde retrait : <Text style={{ fontFamily: "Inter_700Bold", color: PURPLE }}>
                      {userCountry && userCountry.xafRate !== 1 ? formatCurrency(withdrawal, userCountry) : `${withdrawal.toLocaleString("fr-FR")} FCFA`}
                    </Text>
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                    Minimum : 1 500 FCFA
                  </Text>
                </View>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Pays de réception</Text>
                <Pressable
                  style={[styles.countryBtn, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}
                  onPress={() => { setWdCountrySearch(""); setShowWdCountryModal(true); }}
                >
                  <Text style={styles.countryFlag}>{wdCountry.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.countryName, { color: C.text }]} numberOfLines={1}>{wdCountry.name}</Text>
                    <Text style={[styles.countrySub, { color: C.textMuted }]} numberOfLines={1}>
                      {wdCountry.phoneCode} · {wdCountry.operators.join(" • ")}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={16} color={C.textMuted} />
                </Pressable>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Opérateur Mobile Money</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {wdCountry.operators.map((op) => (
                    <Pressable
                      key={op}
                      style={({ pressed }) => [
                        styles.methodBtn,
                        {
                          backgroundColor: wdMethod === op ? PURPLE + "15" : C.inputBg,
                          borderColor: wdMethod === op ? PURPLE : C.border,
                        },
                        pressed && { opacity: 0.9 },
                      ]}
                      onPress={() => { setWdMethod(op); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.methodBtnText, { color: wdMethod === op ? PURPLE : C.text }]}>{op}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                  Numéro Mobile Money ({wdCountry.phoneCode})
                </Text>
                <View style={[styles.phoneRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                  <View style={[styles.phoneCodeBox, { backgroundColor: PURPLE + "14" }]}>
                    <Text style={[styles.phoneCodeText, { color: PURPLE }]}>{wdCountry.phoneCode}</Text>
                  </View>
                  <TextInput
                    style={[styles.phoneInput, { color: C.text }]}
                    placeholder="6XX XXX XXX"
                    placeholderTextColor={C.textMuted}
                    keyboardType="phone-pad"
                    value={wdPhone}
                    onChangeText={setWdPhone}
                  />
                </View>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Montant à retirer (FCFA)</Text>
                <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                  <TextInput
                    style={[styles.input, { color: C.text }]}
                    placeholder="Minimum 1 500 FCFA"
                    placeholderTextColor={C.textMuted}
                    keyboardType="numeric"
                    value={wdAmount}
                    onChangeText={setWdAmount}
                  />
                  <Text style={[styles.inputSuffix, { color: C.textMuted }]}>FCFA</Text>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.withdrawSubmit,
                  { backgroundColor: PURPLE, opacity: wdSubmitting ? 0.6 : 1 },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={handleWithdraw}
                disabled={wdSubmitting}
              >
                {wdSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={16} color="#fff" />}
                <Text style={styles.withdrawSubmitText}>
                  {wdSubmitting ? "Traitement…" : "Soumettre le retrait"}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ WD COUNTRY MODAL ═══ */}
      <Modal visible={showWdCountryModal} animationType="slide" transparent onRequestClose={() => setShowWdCountryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.surface, maxHeight: "90%" }]}>
            <View style={styles.modalGrabber} />
            <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Pays de retrait</Text>
              <Pressable onPress={() => setShowWdCountryModal(false)} style={[styles.modalClose, { backgroundColor: C.inputBg }]}>
                <Feather name="x" size={18} color={C.text} />
              </Pressable>
            </View>
            <View style={[styles.searchBar, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
              <Feather name="search" size={16} color={C.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: C.text }]}
                placeholder="Rechercher un pays…"
                placeholderTextColor={C.textMuted}
                value={wdCountrySearch}
                onChangeText={setWdCountrySearch}
                autoCorrect={false}
              />
            </View>
            <FlatList
              data={filteredWdCountries}
              keyExtractor={(c) => c.code}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 6 }}
              renderItem={({ item }) => {
                const isSelected = wdCountry.code === item.code;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.countryOption,
                      {
                        backgroundColor: isSelected ? PURPLE + "15" : C.inputBg,
                        borderColor: isSelected ? PURPLE : C.border,
                      },
                      pressed && { opacity: 0.9 },
                    ]}
                    onPress={() => {
                      setWdCountry(item);
                      setWdMethod(item.operators[0] ?? "Mobile Money");
                      setWdCountrySearch("");
                      setShowWdCountryModal(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.countryOptionName, { color: C.text }]}>{item.name}</Text>
                      <Text style={[styles.countryOptionSub, { color: C.textMuted }]} numberOfLines={1}>
                        {item.phoneCode} · {item.operators.join(" • ")}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color={PURPLE} />}
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      {/* ═══ COUNTRY PICKER (Mobile Money) ═══ */}
      <Modal visible={showCountryModal} animationType="slide" transparent onRequestClose={() => setShowCountryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.surface, maxHeight: "90%" }]}>
            <View style={styles.modalGrabber} />
            <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Choisir un pays</Text>
              <Pressable onPress={() => setShowCountryModal(false)} style={[styles.modalClose, { backgroundColor: C.inputBg }]}>
                <Feather name="x" size={18} color={C.text} />
              </Pressable>
            </View>
            <View style={[styles.searchBar, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
              <Feather name="search" size={16} color={C.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: C.text }]}
                placeholder="Rechercher un pays…"
                placeholderTextColor={C.textMuted}
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoCorrect={false}
              />
            </View>
            <FlatList
              data={filteredCountries}
              keyExtractor={(c) => c.code}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 6 }}
              renderItem={({ item }) => {
                const isSelected = intlCountry.code === item.code;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.countryOption,
                      {
                        backgroundColor: isSelected ? INFO + "15" : C.inputBg,
                        borderColor: isSelected ? INFO : C.border,
                      },
                      pressed && { opacity: 0.9 },
                    ]}
                    onPress={() => {
                      setIntlCountry(item);
                      setIntlAmount("");
                      setShowCountryModal(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.countryOptionName, { color: C.text }]}>{item.name}</Text>
                      <Text style={[styles.countryOptionSub, { color: C.textMuted }]} numberOfLines={1}>
                        {item.phoneCode} · {item.operators.join(" • ")}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color={INFO} />}
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      {/* ═══ COUNTRY PICKER (Carte bancaire) — tous les pays du monde ═══ */}
      <Modal visible={showCardCountryModal} animationType="slide" transparent onRequestClose={() => setShowCardCountryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.surface, maxHeight: "90%" }]}>
            <View style={styles.modalGrabber} />
            <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Choisir un pays</Text>
              <Pressable onPress={() => setShowCardCountryModal(false)} style={[styles.modalClose, { backgroundColor: C.inputBg }]}>
                <Feather name="x" size={18} color={C.text} />
              </Pressable>
            </View>
            <View style={[styles.searchBar, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
              <Feather name="search" size={16} color={C.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: C.text }]}
                placeholder="Rechercher un pays…"
                placeholderTextColor={C.textMuted}
                value={cardCountrySearch}
                onChangeText={setCardCountrySearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {cardCountrySearch.length > 0 && (
                <Pressable onPress={() => setCardCountrySearch("")} hitSlop={8}>
                  <Feather name="x-circle" size={16} color={C.textMuted} />
                </Pressable>
              )}
            </View>
            <FlatList
              data={filteredCardCountries}
              keyExtractor={(c) => c.code}
              initialNumToRender={20}
              windowSize={10}
              removeClippedSubviews
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 6 }}
              ListEmptyComponent={
                <View style={{ padding: 30, alignItems: "center" }}>
                  <Feather name="search" size={24} color={C.textMuted} />
                  <Text style={{ marginTop: 10, color: C.textMuted, fontFamily: "Inter_400Regular", fontSize: 13 }}>
                    Aucun pays trouvé
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = cardCountry.code === item.code;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.countryOption,
                      {
                        backgroundColor: isSelected ? GOLD + "15" : C.inputBg,
                        borderColor: isSelected ? GOLD : C.border,
                      },
                      pressed && { opacity: 0.9 },
                    ]}
                    onPress={() => {
                      setCardCountry(item);
                      setCardAmount("");
                      setCardCountrySearch("");
                      setShowCardCountryModal(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.countryOptionName, { color: C.text }]}>{item.name}</Text>
                      <Text style={[styles.countryOptionSub, { color: C.textMuted }]} numberOfLines={1}>
                        {item.currency} · {item.currencySymbol}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color={GOLD} />}
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MODAL STYLES
// ═══════════════════════════════════════════════════════════════
const mStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(4,10,22,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#0F1B33",
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.22)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 20,
  },
  iconWrap: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  message: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 22,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 4,
  },
  btn: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 0.1,
  },
});

// ═══════════════════════════════════════════════════════════════
//  STYLES (écran)
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    position: "relative",
  },
  headerGoldLine: {
    position: "absolute", top: 0, left: 20, right: 20, height: 2,
    backgroundColor: GOLD, opacity: 0.35,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, letterSpacing: -0.3 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, marginTop: 3 },

  content: { padding: 14, gap: 16 },

  mainBalanceCard: {
    borderRadius: 22, overflow: "hidden",
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14, shadowOpacity: 0.10, elevation: 5,
  },
  mainBalanceGrad: { padding: 20, position: "relative" },
  goldTopLine: {
    position: "absolute", top: 0, left: 22, right: 22, height: 2,
    backgroundColor: GOLD, opacity: 0.55,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },
  mainBalanceTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  mainBalanceLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  mainBalanceIconBox: {
    width: 24, height: 24, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  mainBalanceLabel: { fontFamily: "Inter_500Medium", fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase" },
  mainBalanceValue: { fontFamily: "Inter_700Bold", fontSize: 30, marginTop: 10, letterSpacing: -0.6 },
  mainBalanceIconLarge: {
    width: 54, height: 54, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },

  balanceRow: { flexDirection: "row", gap: 10 },
  balanceCard: {
    flex: 1, borderRadius: 18, borderWidth: 1.5, padding: 14, gap: 4,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 1,
  },
  balanceIconBox: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
    marginBottom: 4,
  },
  balanceLabel: { fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 0.3, textTransform: "uppercase" },
  balanceValue: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: -0.3, marginTop: 2 },
  balanceCurrency: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  balanceAction: {
    flexDirection: "row", alignItems: "center", gap: 3,
    alignSelf: "flex-start",
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, marginTop: 6,
  },
  balanceActionText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.2 },

  segment: {
    flexDirection: "row", borderRadius: 16, borderWidth: 1, padding: 4,
  },
  segmentBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderRadius: 12,
  },
  segmentDivider: { width: 1, marginVertical: 8, marginHorizontal: 2 },
  segmentIconBox: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  segmentLabel: { fontFamily: "Inter_700Bold", fontSize: 12.5, letterSpacing: -0.1 },
  segmentSub: { fontFamily: "Inter_400Regular", fontSize: 10.5, marginTop: 1 },

  formSection: { borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  formHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderBottomWidth: 1,
  },
  formHeaderIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  formTitle: { fontFamily: "Inter_700Bold", fontSize: 15.5, letterSpacing: -0.2 },
  formSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  formBody: { padding: 16, gap: 14 },

  fieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, letterSpacing: 0.1, marginBottom: 6 },

  presetsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  presetChip: {
    alignItems: "center", gap: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5,
    minWidth: 76, flexGrow: 1, flexBasis: "30%",
  },
  presetChipText: { fontFamily: "Inter_700Bold", fontSize: 13.5 },
  presetChipSub: { fontFamily: "Inter_400Regular", fontSize: 10 },

  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  input: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14.5 },
  inputSuffix: { fontFamily: "Inter_700Bold", fontSize: 12.5 },

  countryBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  countryFlag: { fontSize: 26 },
  countryName: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: -0.1 },
  countrySub: { fontFamily: "Inter_400Regular", fontSize: 11.5, marginTop: 2 },

  phoneRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 12, overflow: "hidden",
  },
  phoneCodeBox: { paddingHorizontal: 14, paddingVertical: 13 },
  phoneCodeText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  phoneInput: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14.5, paddingHorizontal: 12, paddingVertical: 13 },

  conversionRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1,
    alignSelf: "flex-start",
  },
  conversionText: { fontFamily: "Inter_600SemiBold", fontSize: 12.5 },

  payBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  payBtnGradient: {
    height: 54, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10, paddingHorizontal: 20,
  },
  payBtnText: { fontFamily: "Inter_700Bold", fontSize: 15.5, color: "#fff", letterSpacing: 0.1 },

  methodsRow: { flexDirection: "row", gap: 8, justifyContent: "center", flexWrap: "wrap" },
  methodChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  methodDot: { width: 8, height: 8, borderRadius: 4 },
  methodChipText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  histHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
  },
  accentBar: { width: 3, height: 18, borderRadius: 2 },
  histTitle: { fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: -0.2 },
  histRefresh: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  histItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 12,
  },
  histIcon: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  histMeta: { fontFamily: "Inter_400Regular", fontSize: 11.5, marginTop: 2 },
  histAmount: { fontFamily: "Inter_700Bold", fontSize: 13.5 },
  histBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  histBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.2 },

  emptyHistory: {
    borderRadius: 16, borderWidth: 1, padding: 28,
    alignItems: "center", gap: 12,
  },
  emptyIconBox: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, textAlign: "center" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 12.5, textAlign: "center", lineHeight: 18 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(10,28,58,0.55)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "88%", paddingTop: 8 },
  modalGrabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(128,128,128,0.3)", marginBottom: 6 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 17, letterSpacing: -0.2 },
  modalClose: {
    width: 34, height: 34, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },

  transferInfoBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, padding: 12, borderWidth: 1,
  },
  transferInfoIcon: {
    width: 34, height: 34, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
  },
  transferInfoText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13 },
  transferLabel: { fontFamily: "Inter_700Bold", fontSize: 14, marginTop: 4 },
  transferOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 2,
  },
  transferOptionIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  transferOptionLabel: { fontFamily: "Inter_700Bold", fontSize: 14.5, letterSpacing: -0.1 },
  transferOptionSub: { fontFamily: "Inter_400Regular", fontSize: 11.5, marginTop: 3 },
  transferConfirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 15, borderRadius: 13, marginTop: 6,
  },
  transferConfirmText: { fontFamily: "Inter_700Bold", fontSize: 14.5, letterSpacing: 0.1 },

  withdrawInfo: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  withdrawIcon: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  withdrawInfoText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  methodBtn: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1,
  },
  methodBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12.5 },
  withdrawSubmit: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 15, borderRadius: 13,
  },
  withdrawSubmitText: { fontFamily: "Inter_700Bold", fontSize: 14.5, color: "#fff", letterSpacing: 0.1 },

  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    margin: 16, marginTop: 12,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14.5 },
  countryOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 12,
  },
  countryOptionFlag: { fontSize: 26 },
  countryOptionName: { fontFamily: "Inter_600SemiBold", fontSize: 14.5 },
  countryOptionSub: { fontFamily: "Inter_400Regular", fontSize: 11.5, marginTop: 2 },

  pollingOverlay: {
    flex: 1, backgroundColor: "rgba(10,28,58,0.65)",
    alignItems: "center", justifyContent: "center", padding: 30,
  },
  pollingCard: {
    width: "100%", borderRadius: 22, padding: 28,
    alignItems: "center", gap: 12,
    borderWidth: 1,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
  },
  pollingTitle: { fontFamily: "Inter_700Bold", fontSize: 17, textAlign: "center", marginTop: 6, letterSpacing: -0.2 },
  pollingDesc: { fontFamily: "Inter_400Regular", fontSize: 13.5, textAlign: "center", lineHeight: 20 },
});