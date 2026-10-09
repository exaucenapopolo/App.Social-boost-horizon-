import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { firebaseConfig, LOGO_URL } from "./firebase.shared";

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);

export { LOGO_URL };

export default app;
