import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  User as FirebaseUser,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { auth } from "@/lib/firebase";
import { apiClient, type UserProfile } from "@/services/api";
import { clearToken, getFreshToken, saveToken } from "@/services/tokenStore";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  balance: number;
  referralBalance: number;
  totalOrders: number;
  joinedAt: string;
  referralCode: string;
  referredBy?: string;
  photoURL?: string;
  isAdmin?: boolean;
  country?: string;
  withdrawalBalance?: number;
  referralCount?: number;
  referralOrdersUsed?: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  register: (
    name: string,
    email: string,
    password: string,
    phone?: string,
    referredBy?: string,
    country?: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  addBalance: (amount: number) => Promise<void>;
  /**
   * Débite le solde de l'utilisateur.
   *
   * @param amount  Montant à débiter.
   * @param opts    Options optionnelles.
   *   - `{ server: true }` → débit RÉEL côté serveur via
   *     `/api/wallet/deduct` (achats directs : abonnements à vie).
   *   - omis ou `{ server: false }` → mise à jour optimiste LOCALE
   *     (utilisé par new-order.tsx où le backend a déjà débité).
   */
  deductBalance: (amount: number, opts?: { server?: boolean }) => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

const PROFILE_CACHE_KEY = "@sbh_user_profile_v2";

async function saveProfileToCache(u: User): Promise<void> {
  try { await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(u)); } catch {}
}
async function loadProfileFromCache(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch { return null; }
}
async function clearProfileCache(): Promise<void> {
  try { await AsyncStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
}

function generateReferralCode(name: string, uid: string): string {
  const prefix = name.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
  const suffix = uid.slice(-4).toUpperCase();
  return `SBH-${prefix}${suffix}`;
}

function profileToUser(p: UserProfile): User {
  return {
    id: p.id,
    name: p.name || "Utilisateur",
    email: p.email || "",
    phone: p.phone ?? undefined,
    balance: p.balance ?? 0,
    referralBalance: p.referralBalance ?? 0,
    totalOrders: p.totalOrders ?? 0,
    joinedAt: p.joinedAt || new Date().toISOString(),
    referralCode: p.referralCode || "",
    referredBy: p.referredBy ?? undefined,
    photoURL: p.photoURL ?? undefined,
    isAdmin: p.isAdmin ?? false,
    country: p.country ?? undefined,
    withdrawalBalance: (p as any).withdrawalBalance ?? 0,
    referralCount: (p as any).referralCount ?? 0,
    referralOrdersUsed: (p as any).referralOrdersUsed ?? 0,
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loginFlowActive = useRef(false);

  const applyUser = useCallback((userData: User) => {
    setUser(userData);
    saveProfileToCache(userData);
  }, []);

  const loadUserFromApi = useCallback(async (): Promise<User | null> => {
    const res = await apiClient.me.get();
    if (res.success && res.data) {
      return profileToUser(res.data);
    }
    return null;
  }, []);

  useEffect(() => {
    let mounted = true;

    loadProfileFromCache().then((cached) => {
      if (cached && mounted && !user) {
        setUser(cached);
        setIsLoading(false);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (!mounted) return;

      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken(true);
          await saveToken(token, firebaseUser.uid);

          if (loginFlowActive.current) {
            loginFlowActive.current = false;
            setIsLoading(false);
            return;
          }

          const userData = await loadUserFromApi();
          if (userData && mounted) {
            applyUser(userData);
          }
        } catch (e) {
          console.warn("[AuthContext] onAuthStateChanged error:", e);
        }
      } else {
        await clearToken();
        await clearProfileCache();
        if (mounted) setUser(null);
      }

      if (mounted) setIsLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const refreshUser = useCallback(async () => {
    const token = await getFreshToken();
    if (!token) return;
    const userData = await loadUserFromApi();
    if (userData) applyUser(userData);
  }, [loadUserFromApi, applyUser]);

  const login = useCallback(async (email: string, password: string) => {
    loginFlowActive.current = true;
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await cred.user.getIdToken(true);
      await saveToken(token, cred.user.uid);

      let res = await apiClient.me.get();

      if (!res.success && res.error === "Profil introuvable") {
        const rawName = cred.user.displayName ?? email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
        const name = rawName || "Utilisateur";
        const referralCode = generateReferralCode(name, cred.user.uid);
        await apiClient.auth.register({ name, email: email.trim(), referralCode } as any);
        res = await apiClient.me.get();
      }

      if (res.success && res.data) {
        applyUser(profileToUser(res.data));
        setIsLoading(false);
        return { success: true };
      }
      loginFlowActive.current = false;
      if (!res.success && res.error === "Réseau indisponible") {
        return { success: false, error: "Pas de connexion. Vérifiez votre réseau." };
      }
      return { success: false, error: res.error ?? "Erreur de connexion. Réessayez." };
    } catch (e: unknown) {
      loginFlowActive.current = false;
      const code = (e as { code?: string })?.code ?? "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        return { success: false, error: "Email ou mot de passe incorrect." };
      }
      if (code === "auth/too-many-requests") {
        return { success: false, error: "Trop de tentatives. Réessayez plus tard." };
      }
      if (code === "auth/network-request-failed") {
        return { success: false, error: "Pas de connexion internet. Vérifiez votre réseau." };
      }
      return { success: false, error: "Erreur de connexion. Réessayez." };
    }
  }, [applyUser]);

  const register = useCallback(
    async (name: string, email: string, password: string, phone?: string, referredBy?: string, country?: string) => {
      loginFlowActive.current = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const uid = cred.user.uid;
        const referralCode = generateReferralCode(name, uid);

        const token = await cred.user.getIdToken(false);
        await saveToken(token, uid);

        const registerRes = await apiClient.auth.register({
          name, email: email.trim(),
          phone: phone ?? undefined,
          referralCode,
          referredBy: referredBy ?? undefined,
          country: country ?? undefined,
        } as any);

        if (!registerRes.success) {
          loginFlowActive.current = false;
          try { await cred.user.delete(); } catch { /* ignore */ }
          return { success: false, error: registerRes.error ?? "Erreur lors de la création du profil." };
        }

        const userData = await loadUserFromApi();
        if (userData) {
          applyUser(userData);
          setIsLoading(false);
          return { success: true };
        }
        loginFlowActive.current = false;
        return { success: false, error: "Compte créé mais profil introuvable." };
      } catch (e: unknown) {
        loginFlowActive.current = false;
        const code = (e as { code?: string })?.code ?? "";
        if (code === "auth/email-already-in-use") {
          return { success: false, error: "Cet email est déjà utilisé." };
        }
        if (code === "auth/weak-password") {
          return { success: false, error: "Mot de passe trop faible (6 caractères min)." };
        }
        return { success: false, error: "Erreur lors de l'inscription. Réessayez." };
      }
    },
    [loadUserFromApi, applyUser]
  );

  const loginWithGoogle = useCallback(async () => {
    loginFlowActive.current = true;
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("email");
      provider.addScope("profile");
      const cred = await signInWithPopup(auth, provider);
      const token = await cred.user.getIdToken(false);
      await saveToken(token, cred.user.uid);

      let userData = await loadUserFromApi();
      if (!userData) {
        const name = cred.user.displayName ?? cred.user.email?.split("@")[0] ?? "Utilisateur";
        const email = cred.user.email ?? "";
        const uid = cred.user.uid;
        const referralCode = generateReferralCode(name, uid);
        await apiClient.auth.register({ name, email, referralCode });
        userData = await loadUserFromApi();
      }

      if (userData) {
        applyUser(userData);
        setIsLoading(false);
        return { success: true };
      }
      loginFlowActive.current = false;
      return { success: false, error: "Profil introuvable après connexion Google." };
    } catch (e: unknown) {
      loginFlowActive.current = false;
      const code = (e as { code?: string })?.code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return { success: false, error: "Connexion annulée." };
      }
      return { success: false, error: "Erreur Google Sign-In. Réessayez." };
    }
  }, [loadUserFromApi, applyUser]);

  const logout = useCallback(async () => {
    await signOut(auth);
    await clearToken();
    await clearProfileCache();
    setUser(null);
  }, []);

  const updateUser = useCallback(
    async (updates: Partial<User>) => {
      if (!user) return;
      const allowed: Partial<Pick<UserProfile, "name" | "phone" | "photoURL">> & { country?: string } = {};
      if (updates.name !== undefined) allowed.name = updates.name;
      if (updates.phone !== undefined) allowed.phone = updates.phone ?? null;
      if (updates.photoURL !== undefined) allowed.photoURL = updates.photoURL ?? null;
      if (updates.country !== undefined) (allowed as any).country = updates.country;
      if (Object.keys(allowed).length > 0) {
        await apiClient.me.update(allowed as any);
      }
      const updated = { ...user, ...updates };
      setUser(updated);
      saveProfileToCache(updated);
    },
    [user]
  );

  const addBalance = useCallback(
    async (amount: number) => {
      if (!user) return;
      const updated = { ...user, balance: (user.balance ?? 0) + amount };
      setUser(updated);
      saveProfileToCache(updated);
    },
    [user]
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  deductBalance — CORRIGÉ
  // ══════════════════════════════════════════════════════════════════════════
  //  FIX : le path serveur est `/api/wallet/deduct` (avec préfixe /api),
  //        pas `/wallet/deduct`. Le client mobile tapait sur
  //        `${BASE_URL}wallet/deduct` → 404 systématique → aucun débit.
  // ══════════════════════════════════════════════════════════════════════════
  const deductBalance = useCallback(
    async (amount: number, opts?: { server?: boolean }): Promise<boolean> => {
      if (!user) return false;
      if ((user.balance ?? 0) < amount) return false;

      if (opts?.server) {
        try {
          const res = await apiClient.post<{ newBalance?: number }>("/api/wallet/deduct", {
            amount,
          });
          if (res.success) {
            await refreshUser();
            return true;
          }
          console.warn("[AuthContext] deductBalance(server) refusé:", res.error);
          return false;
        } catch (e) {
          console.warn("[AuthContext] deductBalance(server) erreur réseau:", e);
          return false;
        }
      }

      const updated = { ...user, balance: (user.balance ?? 0) - amount };
      setUser(updated);
      saveProfileToCache(updated);
      return true;
    },
    [user, refreshUser]
  );

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, loginWithGoogle, register, logout, updateUser, addBalance, deductBalance, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}