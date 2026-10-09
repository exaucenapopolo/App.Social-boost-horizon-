import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";

import { firebaseConfig, LOGO_URL } from "./firebase.shared";

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

function initAuth() {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "auth/already-initialized"
    ) {
      return getAuth(app);
    }

    console.error("[firebase] Échec d'initialisation d'Auth :", error);
    throw error;
  }
}

export const auth = initAuth();
export const db = getFirestore(app);

export { LOGO_URL };

export default app;
