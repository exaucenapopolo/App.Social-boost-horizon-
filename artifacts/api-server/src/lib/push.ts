import { getFirebaseAdmin } from "./firebase-admin.js";
import { getFirestore } from "firebase-admin/firestore";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendExpoPush(
  token: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId?: string,
  imageUrl?: string
): Promise<void> {
  if (!token || !token.startsWith("ExponentPushToken")) {
    console.warn("[push] No valid push token — skipping push:", title);
    return;
  }

  const payload: Record<string, unknown> = {
    to: token,
    title,
    body,
    sound: "default",
    channelId: channelId ?? "default",
    data: data ?? {},
  };
  if (imageUrl) payload.imageUrl = imageUrl;

  try {
    const r: any = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.warn("[push] Expo response:", r.status, txt);
    } else {
      const json = await r.json() as Record<string, unknown>;
      console.log("[push] Sent:", title, "→", token.slice(0, 30) + "...", JSON.stringify(json));
    }
  } catch (e) {
    console.warn("[push] sendExpoPush error:", e);
  }
}

export async function getUserPushToken(uid: string): Promise<string | null> {
  if (!uid) return null;
  try {
    getFirebaseAdmin(); // ensure initialized
    const db  = getFirestore();
    const doc = await db.doc(`users/${uid}`).get();
    const token = doc.data()?.expoPushToken;
    if (typeof token === "string" && token.startsWith("ExponentPushToken")) {
      return token;
    }
    console.warn(`[push] No valid expoPushToken for uid=${uid}`);
    return null;
  } catch (e) {
    console.warn("[push] getUserPushToken error:", e);
    return null;
  }
}

/**
 * Saves a notification to Firestore activites collection AND sends a push.
 * This ensures the notification appears both in the phone bar AND in the in-app notification center.
 */
export async function saveNotifAndSendPush(
  uid: string,
  notifType: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId?: string,
  extra?: Record<string, unknown>
): Promise<void> {
  if (!uid) return;

  // 1. Save to Firestore so it appears in the in-app notification center
  try {
    getFirebaseAdmin(); // ensure initialized
    const db = getFirestore();
    await db.collection("activites").add({
      userId:    uid,
      type:      notifType,
      label:     body,
      title,
      amount:    extra?.amount ?? 0,
      status:    "confirmed",
      createdAt: new Date().toISOString(),
      ...(extra ?? {}),
    });
    console.log(`[push] Saved notif type=${notifType} for uid=${uid}`);
  } catch (e) {
    console.warn("[push] saveNotif Firestore error:", e);
  }

  // 2. Send the actual push notification
  const token = await getUserPushToken(uid);
  await sendExpoPush(token, title, body, data, channelId);
}