const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Liste des paquets à transpiler obligatoirement
const PACKAGES_TO_TRANSFORM = [
  "react-native",
  "@react-native",
  "expo",
  "@expo",
  "expo-file-system",
  "expo-router",
  "expo-updates",
  "expo-modules-core",
  "expo-constants",
  "expo-font",
  "expo-web-browser",
  "@react-navigation",
  "@unimodules",
].join("|");

// Expression régulière compatible Windows et Unix pour PNPM
config.resolver.transformIgnorePatterns = [
  /node_modules[\\/](?!(.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(@expo|expo|react-native|@react-native|@react-navigation|@unimodules)[\\/])/,
];

module.exports = config;