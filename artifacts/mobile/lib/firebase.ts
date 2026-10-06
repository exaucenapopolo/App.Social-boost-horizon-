import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyD2JiDS0g8EkeNXxjO7_wGI3WznpPvcCCk",
  authDomain: "social-boost-horizon.firebaseapp.com",
  projectId: "social-boost-horizon",
  storageBucket: "social-boost-horizon.appspot.com",
  messagingSenderId: "43658165639",
  appId: "1:43658165639:web:b8f492dc6a25cd12fc6722",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

function initAuth() {
  if (Platform.OS !== "web") {
    try {
      const { initializeAuth, getReactNativePersistence } = require("firebase/auth");
      const AsyncStorage = require("@react-native-async-storage/async-storage").default;
      return initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      return getAuth(app);
    }
  }
  return getAuth(app);
}

export const auth = initAuth();
export const db = getFirestore(app);

export const LOGO_URL =
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/logos/Logo%20social%20Boost%20horizon.jpg";

export default app;
