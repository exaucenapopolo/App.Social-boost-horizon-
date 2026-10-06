import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { apiClient, type RemoteRecharge, type RechargePayload } from "@/services/api";

export type RechargeStatus = "pending" | "confirmed" | "rejected";

export interface Recharge {
  id: string;
  amount: number;
  method: string;
  phone: string;
  transactionId: string;
  status: RechargeStatus;
  createdAt: string;
  userId: string;
}

interface WalletContextType {
  recharges: Recharge[];
  isLoading: boolean;
  submitRecharge: (
    data: Omit<Recharge, "id" | "createdAt" | "status" | "userId">
  ) => Promise<{ success: boolean; error?: string }>;
  refreshRecharges: (userId: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const VALID_STATUSES = new Set<RechargeStatus>(["pending", "confirmed", "rejected"]);

function toRechargeStatus(s: string): RechargeStatus {
  return VALID_STATUSES.has(s as RechargeStatus) ? (s as RechargeStatus) : "pending";
}

function mapRemoteRecharge(r: RemoteRecharge): Recharge {
  return {
    id: r.id,
    amount: r.amount,
    method: r.method,
    phone: r.phone,
    transactionId: r.transactionId,
    status: toRechargeStatus(r.status),
    createdAt: r.createdAt,
    userId: r.userId,
  };
}

const POLL_INTERVAL_MS = 30_000;

export function WalletProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadWallet = useCallback(async () => {
    if (!userId) {
      setRecharges([]);
      setIsLoading(false);
      return;
    }
    const res = await apiClient.wallet.get();
    if (res.success && res.data) {
      setRecharges(res.data.recharges.map(mapRemoteRecharge));
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setRecharges([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void loadWallet();
    intervalRef.current = setInterval(() => { void loadWallet(); }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userId, loadWallet]);

  const refreshRecharges = useCallback(async (_uid: string) => {
    await loadWallet();
  }, [loadWallet]);

  const submitRecharge = useCallback(
    async (data: Omit<Recharge, "id" | "createdAt" | "status" | "userId">) => {
      const payload: RechargePayload = {
        amount: data.amount,
        phone: data.phone,
        transactionId: data.transactionId || undefined,
        method: data.method,
      };
      const res = await apiClient.wallet.recharge(payload);
      if (!res.success) {
        return { success: false, error: res.error ?? "Erreur lors de la soumission" };
      }
      await loadWallet();
      return { success: true };
    },
    [loadWallet]
  );

  return (
    <WalletContext.Provider
      value={{ recharges, isLoading, submitRecharge, refreshRecharges }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
