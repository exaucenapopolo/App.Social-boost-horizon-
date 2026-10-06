import * as adminNS from "firebase-admin";
import type { Query } from "firebase-admin/firestore";

// firebase-admin exports its API on the default export in ESM context
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin: typeof adminNS = (adminNS as any).default ?? adminNS;

let initialized = false;
let useAdminFirestore = false;

function initializeAdmin() {
  if (initialized) return;
  initialized = true;

  try {
    if (admin.apps && admin.apps.length > 0) {
      useAdminFirestore = true;
      return;
    }
  } catch { /* apps not accessible yet */ }

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    try {
      const sa = JSON.parse(saJson);
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId: sa.project_id ?? "social-boost-horizon",
      });
      useAdminFirestore = true;
      console.log("[firebase-admin] Initialized with service account credentials");
      return;
    } catch (e) {
      console.error("[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e);
    }
  }

  try {
    admin.initializeApp({ projectId: "social-boost-horizon" });
    console.log("[firebase-admin] Initialized with projectId only (REST API mode)");
  } catch (e) {
    console.warn("[firebase-admin] initializeApp failed:", e);
  }
}

export function getFirebaseAdmin() {
  initializeAdmin();
  return admin;
}

async function getAdminAccessToken(): Promise<string | null> {
  if (!useAdminFirestore) return null;
  try {
    const fb = getFirebaseAdmin();
    const token = await fb.app().options.credential?.getAccessToken();
    return token?.access_token ?? null;
  } catch {
    return null;
  }
}

export function asString(v: unknown, fallback = ""): string {
  return v != null ? String(v) : fallback;
}

export function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

export function asBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

export function asStringOrNull(v: unknown): string | null {
  return v != null ? String(v) : null;
}

/**
 * Convertit n'importe quelle valeur date en chaîne ISO 8601.
 * Gère les objets Timestamp Firestore (Admin SDK et REST), les strings ISO
 * et les objets Date JavaScript.
 */
export function asIsoDate(v: unknown): string | null {
  if (v == null) return null;
  // Firestore Admin SDK Timestamp → { toDate(): Date }
  if (typeof v === "object" && v !== null && typeof (v as any).toDate === "function") {
    return (v as any).toDate().toISOString();
  }
  // REST Firestore Timestamp → { _seconds, _nanoseconds } or { seconds, nanoseconds }
  if (typeof v === "object" && v !== null) {
    const secs = (v as any)._seconds ?? (v as any).seconds;
    if (typeof secs === "number") {
      return new Date(secs * 1000).toISOString();
    }
  }
  // String ISO ou parseable
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

export async function verifyFirebaseToken(token: string): Promise<{ uid: string; email: string | null } | null> {
  try {
    const fb = getFirebaseAdmin();
    const decoded = await fb.auth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return null;
  }
}

const FIRESTORE_BASE =
  "https://firestore.googleapis.com/v1/projects/social-boost-horizon/databases/(default)/documents";

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
}

interface FirestoreQueryRow {
  document?: FirestoreDocument;
}

function fromFirestoreValue(v: FirestoreValue): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v)
    return (v.arrayValue?.values ?? []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue?.fields ?? {});
  if ("nullValue" in v) return null;
  return null;
}

function fromFirestoreFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    result[k] = fromFirestoreValue(v);
  }
  return result;
}

function toFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === "object") {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

async function getBestToken(userIdToken: string): Promise<string> {
  const adminToken = await getAdminAccessToken();
  return adminToken ?? userIdToken;
}

export async function firestoreGet(
  path: string,
  idToken: string
): Promise<Record<string, unknown> | null> {
  // PRIMARY: Admin SDK bypasses all security rules
  try {
    const fb = getFirebaseAdmin();
    const db = fb.firestore();
    const snap = await db.doc(path).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as Record<string, unknown>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("Could not load the default credentials") && !msg.includes("UNAUTHENTICATED")) {
      console.error(`[firestoreGet] Admin SDK error on ${path}:`, msg);
    }
    // SECONDARY: REST API fallback
  }
  try {
    const token = await getBestToken(idToken);
    const res: any = await fetch(`${FIRESTORE_BASE}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const doc = await res.json() as FirestoreDocument;
    if (!doc.fields) return null;
    return { id: doc.name?.split("/").pop(), ...fromFirestoreFields(doc.fields) };
  } catch {
    return null;
  }
}

/**
 * Server-side admin Firestore query — bypasses ALL security rules.
 * Uses Firebase Admin SDK when credentials are available (FIREBASE_SERVICE_ACCOUNT_JSON).
 * Falls back to REST API with best available token if Admin SDK is not configured.
 * The client NEVER touches Firestore directly; all reads go through this server function.
 */
export async function adminFirestoreQuery(
  collection: string,
  filters: { field: string; value: unknown }[],
  _unusedIdToken?: string
): Promise<Record<string, unknown>[]> {
  // PRIMARY: Admin SDK — ignores all Firestore security rules
  try {
    const fb = getFirebaseAdmin();
    const db = fb.firestore();
    let q: Query = db.collection(collection);
    for (const f of filters) {
      q = q.where(f.field, "==", f.value);
    }
    const snap = await q.get();
    const docs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
    docs.sort((a: any, b: any) => {
      const ta = a["createdAt"] ? new Date(a["createdAt"] as string).getTime() : 0;
      const tb = b["createdAt"] ? new Date(b["createdAt"] as string).getTime() : 0;
      return tb - ta;
    });
    return docs;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("Could not load the default credentials") && !msg.includes("UNAUTHENTICATED")) {
      console.error(`[adminFirestoreQuery] Admin SDK error on ${collection}:`, msg);
    }
    // SECONDARY: REST API fallback (requires Firestore security rules to allow authenticated reads)
  }
  return firestoreQueryRest(collection, filters, _unusedIdToken ?? "");
}

/** Alias kept for backward compatibility */
export const firestoreQuery = adminFirestoreQuery;

async function firestoreQueryRest(
  collection: string,
  filters: { field: string; value: unknown }[],
  idToken: string
): Promise<Record<string, unknown>[]> {
  try {
    const token = await getBestToken(idToken);
    const where = filters.map(({ field, value }) => ({
      fieldFilter: {
        field: { fieldPath: field },
        op: "EQUAL",
        value: typeof value === "number"
          ? (Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value })
          : { stringValue: String(value) },
      },
    }));

    const body = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: filters.length === 1
          ? where[0]
          : { compositeFilter: { op: "AND", filters: where } },
      },
    };

    const res: any = await fetch(
      `${FIRESTORE_BASE}:runQuery`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[firestoreQueryRest] ${collection} HTTP ${res.status}:`, txt);
      return [];
    }
    const results = await res.json() as FirestoreQueryRow[];
    const docs = results
      .filter((r) => r.document)
      .map((r) => ({
        id: r.document!.name?.split("/").pop(),
        ...fromFirestoreFields(r.document!.fields ?? {}),
      }));

    return (docs as Record<string, unknown>[]).sort((a, b) => {
      const ta = a["createdAt"] ? new Date(a["createdAt"] as string).getTime() : 0;
      const tb = b["createdAt"] ? new Date(b["createdAt"] as string).getTime() : 0;
      return tb - ta;
    });
  } catch (e) {
    console.error(`[firestoreQueryRest] ${collection} exception:`, e);
    return [];
  }
}

export async function firestoreList(
  collection: string,
  idToken: string,
  limit = 200
): Promise<Record<string, unknown>[]> {
  try {
    const token = await getBestToken(idToken);
    const body = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        limit,
      },
    };
    const res: any = await fetch(
      `${FIRESTORE_BASE}:runQuery`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[firestoreList] ${collection} HTTP ${res.status}:`, txt);
      return [];
    }
    const results = await res.json() as FirestoreQueryRow[];
    return results
      .filter((r) => r.document)
      .map((r) => ({
        id: r.document!.name?.split("/").pop(),
        ...fromFirestoreFields(r.document!.fields ?? {}),
      }));
  } catch (e) {
    console.error(`[firestoreList] ${collection} exception:`, e);
    return [];
  }
}

export async function firestoreCreate(
  collection: string,
  data: Record<string, unknown>,
  idToken: string
): Promise<Record<string, unknown> | null> {
  // PRIMARY: Admin SDK bypasses security rules
  try {
    const fb = getFirebaseAdmin();
    const db = fb.firestore();
    const docRef = await db.collection(collection).add(data);
    return { id: docRef.id, ...data };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("Could not load the default credentials") && !msg.includes("UNAUTHENTICATED")) {
      console.error(`[firestoreCreate] Admin SDK error on ${collection}:`, msg);
    }
  }
  // SECONDARY: REST API fallback
  try {
    const token = await getBestToken(idToken);
    const fields = toFirestoreFields(data);
    const res: any = await fetch(`${FIRESTORE_BASE}/${collection}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[firestoreCreate] REST ${collection} HTTP ${res.status}:`, text);
      return null;
    }
    const doc = await res.json() as FirestoreDocument;
    return { id: doc.name?.split("/").pop(), ...data };
  } catch (e) {
    console.error("[firestoreCreate] exception:", e);
    return null;
  }
}

export async function firestoreSet(
  docPath: string,
  data: Record<string, unknown>,
  idToken: string
): Promise<boolean> {
  try {
    const token = await getBestToken(idToken);
    const parts = docPath.split("/");
    const docId = parts.pop()!;
    const collectionPath = parts.join("/");
    const fields = toFirestoreFields(data);
    const res: any = await fetch(
      `${FIRESTORE_BASE}/${collectionPath}?documentId=${encodeURIComponent(docId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fields }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      console.error(`[firestoreSet] ${docPath} HTTP ${res.status}:`, text);
    }
    return res.ok;
  } catch (e) {
    console.error("[firestoreSet] exception:", e);
    return false;
  }
}

export async function firestoreUpdate(
  docPath: string,
  data: Record<string, unknown>,
  idToken: string
): Promise<boolean> {
  // PRIMARY: Admin SDK bypasses security rules (supports partial updates)
  try {
    const fb = getFirebaseAdmin();
    const db = fb.firestore();
    await db.doc(docPath).set(data, { merge: true });
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("Could not load the default credentials") && !msg.includes("UNAUTHENTICATED")) {
      console.error(`[firestoreUpdate] Admin SDK error on ${docPath}:`, msg);
    }
  }
  // SECONDARY: REST API fallback
  try {
    const token = await getBestToken(idToken);
    const fields = toFirestoreFields(data);
    const updateMask = Object.keys(data)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join("&");
    const res: any = await fetch(`${FIRESTORE_BASE}/${docPath}?${updateMask}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[firestoreUpdate] REST ${docPath} HTTP ${res.status}:`, text);
    }
    return res.ok;
  } catch (e) {
    console.error("[firestoreUpdate] exception:", e);
    return false;
  }
}

const PROJECT_ID = "social-boost-horizon";
const FIRESTORE_DB_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)`;

/**
 * Atomic counter increment via Firestore REST API transactions.
 * Falls back to Admin SDK if credentials are available.
 * Returns the new counter value, or null on failure.
 * Guarantees the counter never goes below `minValue`.
 */
export async function firestoreTransactionIncrement(
  docPath: string,
  field: string,
  minValue: number,
  idToken: string
): Promise<number | null> {
  try {
    const token = await getBestToken(idToken);

    const txRes: any = await fetch(`${FIRESTORE_DB_BASE}:beginTransaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ options: { readWrite: {} } }),
    });
    if (!txRes.ok) {
      console.error("[txIncrement] beginTransaction HTTP", txRes.status, await txRes.text().catch(() => ""));
      return null;
    }
    const { transaction } = await txRes.json() as { transaction: string };

    const getRes: any = await fetch(
      `${FIRESTORE_DB_BASE}/documents/${docPath}?transaction=${encodeURIComponent(transaction)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    let currentCount = minValue - 1;
    if (getRes.ok) {
      const doc = await getRes.json() as FirestoreDocument;
      if (doc.fields?.[field]) {
        const v = doc.fields[field];
        if ("integerValue" in v) currentCount = parseInt(v.integerValue, 10);
        else if ("doubleValue" in v) currentCount = Math.floor(v.doubleValue);
      }
    }

    const nextCount = Math.max(currentCount, minValue - 1) + 1;
    const fullDocPath = `projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;

    const commitRes: any = await fetch(`${FIRESTORE_DB_BASE}:commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        transaction,
        writes: [{
          update: {
            name: fullDocPath,
            fields: { [field]: { integerValue: String(nextCount) } },
          },
          updateMask: { fieldPaths: [field] },
        }],
      }),
    });

    if (!commitRes.ok) {
      console.error("[txIncrement] commit HTTP", commitRes.status, await commitRes.text().catch(() => ""));
      return null;
    }
    console.log(`[txIncrement] ${docPath}.${field} → ${nextCount}`);
    return nextCount;
  } catch (e) {
    console.error("[txIncrement] exception:", e);
    return null;
  }
}

/**
 * Prepend an item to an array field in a user document, keeping at most `maxLen` items.
 * Used to maintain orderRefs, recentActivities, recentRecharges for fallback queries.
 */
export async function appendToUserArray(
  uid: string,
  idToken: string,
  field: string,
  item: Record<string, unknown>,
  maxLen = 100
): Promise<void> {
  try {
    const user = await firestoreGet(`users/${uid}`, idToken);
    const existing = Array.isArray(user?.[field]) ? (user[field] as Record<string, unknown>[]) : [];
    const updated = [item, ...existing].slice(0, maxLen);
    await firestoreUpdate(`users/${uid}`, { [field]: updated }, idToken);
  } catch (e) {
    console.warn(`[appendToUserArray] ${field}:`, e);
  }
}

/**
 * Fetch documents by IDs from a collection (individual GETs — bypasses security rule list queries).
 */
export async function firestoreGetMany(
  collection: string,
  ids: string[],
  idToken: string
): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  const results = await Promise.all(
    ids.map((id) => firestoreGet(`${collection}/${id}`, idToken).catch(() => null))
  );
  return results.filter(Boolean) as Record<string, unknown>[];
}