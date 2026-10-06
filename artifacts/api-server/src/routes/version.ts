import { Router } from "express";
import { getFirebaseAdmin } from "../lib/firebase-admin.js";
import { getFirestore } from "firebase-admin/firestore";

const router = Router();

const DEFAULT_VERSION = {
  latestVersion: "1.15.0",
  minVersion: "1.0.0",
  downloadUrl: "",
  changelog: "",
  forceUpdate: false,
};

// GET /api/version — public, no auth required
router.get("/api/version", async (_req, res) => {
  try {
    const db = getFirestore(getFirebaseAdmin());
    const doc = await db.collection("config").doc("appVersion").get();
    const data = doc.exists ? doc.data() : DEFAULT_VERSION;
    res.json({ success: true, data });
  } catch {
    res.json({ success: true, data: DEFAULT_VERSION });
  }
});

export default router;
