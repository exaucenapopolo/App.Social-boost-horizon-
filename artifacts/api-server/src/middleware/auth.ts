import type { NextFunction, Request, Response } from "express";
import { verifyFirebaseToken } from "../lib/firebase-admin.js";

export interface AuthRequest extends Request {
  uid?: string;
  email?: string | null;
  idToken?: string;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Token d'authentification requis" });
    return;
  }
  const token = authHeader.slice(7);
  const result = await verifyFirebaseToken(token);
  if (!result) {
    res.status(401).json({ success: false, error: "Token invalide ou expiré" });
    return;
  }
  req.uid = result.uid;
  req.email = result.email;
  req.idToken = token;
  next();
}
