import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { apiClient, type CreateOrderPayload, type RemoteOrder } from "@/services/api";

export type OrderStatus =
  | "En attente"
  | "en cours"
  | "succès"
  | "annulée"
  | "remboursé"
  | "partiel";

export interface Order {
  id: string;
  serviceId: string;
  serviceName: string;
  platform: string;
  platformColor: string;
  type: string;
  quantity: number;
  price: number;
  link: string;
  status: OrderStatus;
  createdAt: string;
  completedAt?: string;
  userId: string;
  progress?: number;
  orderId?: string;
  providerOrderId?: string;
  provider?: string;
  startCount?: number;
  remains?: number;
}

interface OrdersContextType {
  orders: Order[];
  isLoading: boolean;
  createOrder: (order: Omit<Order, "id" | "createdAt" | "status"> & { orderId?: string; provider?: string; comments?: string; referralDiscountApplied?: boolean }) => Promise<void>;
  cancelOrder: (id: string) => Promise<void>;
  refreshOrders: (userId: string) => Promise<void>;
  refreshOrderStatus: (id: string) => Promise<{ providerStatus?: Record<string, unknown> } | null>;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

const STATUS_MAP: Record<string, OrderStatus> = {
  "En attente":  "En attente",
  "en cours":    "en cours",
  "succès":      "succès",
  "annulée":     "annulée",
  "remboursé":   "remboursé",
  "partiel":     "partiel",
  pending:       "En attente",
  waiting:       "En attente",
  processing:    "en cours",
  in_progress:   "en cours",
  inprogress:    "en cours",
  running:       "en cours",
  active:        "en cours",
  completed:     "succès",
  success:       "succès",
  done:          "succès",
  cancelled:     "annulée",
  canceled:      "annulée",
  refunded:      "remboursé",
  partial:       "partiel",
};

function toOrderStatus(s: string): OrderStatus {
  return STATUS_MAP[s] ?? STATUS_MAP[s?.toLowerCase()] ?? "En attente";
}

function calcRealProgress(
  status: OrderStatus,
  quantity: number,
  remains?: number,
  serverProgress?: number
): number {
  if (status === "succès")    return 100;
  if (status === "annulée")   return 0;
  if (status === "remboursé") return 0;

  // Progress réel calculé depuis les données fournisseur
  if (remains != null && remains >= 0 && quantity > 0) {
    const delivered = Math.max(quantity - remains, 0);
    const pct = Math.floor((delivered / quantity) * 100);
    return Math.min(pct, 99); // jamais 100% sauf si succès
  }
  // Fallback sur la valeur serveur ou une valeur par statut
  if (serverProgress != null && serverProgress > 0) return serverProgress;
  if (status === "en cours") return 5;
  if (status === "partiel")  return 50;
  return 2;
}

function mapRemoteOrder(r: RemoteOrder & { providerOrderId?: string; provider?: string; startCount?: number; remains?: number }): Order {
  const status = toOrderStatus(r.status);
  return {
    id: r.id,
    serviceId: r.serviceId,
    serviceName: r.serviceName,
    platform: r.platform,
    platformColor: r.platformColor,
    type: r.type,
    quantity: r.quantity,
    price: r.price,
    link: r.link,
    status,
    createdAt: r.createdAt,
    userId: r.userId,
    progress: calcRealProgress(status, r.quantity, r.remains, r.progress),
    orderId: r.orderId,
    providerOrderId: r.providerOrderId ?? "",
    provider: r.provider ?? "",
    startCount: r.startCount,
    remains:    r.remains,
  };
}

// 5 minutes — le poller serveur (orderPoller) met à jour le statut toutes les 8 min.
// 30s était trop fréquent et consommait 150 000 reads Firestore/jour/utilisateur.
const POLL_INTERVAL_MS = 5 * 60_000;

export function OrdersProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadOrders = useCallback(async () => {
    if (!userId) {
      setOrders([]);
      setIsLoading(false);
      return;
    }
    const res = await apiClient.orders.list();
    if (res.success && res.data) {
      setOrders(res.data.map(mapRemoteOrder));
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setOrders([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void loadOrders();
    intervalRef.current = setInterval(() => { void loadOrders(); }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userId, loadOrders]);

  const refreshOrders = useCallback(async (_uid: string) => {
    await loadOrders();
  }, [loadOrders]);

  const createOrder = useCallback(
    async (orderData: Omit<Order, "id" | "createdAt" | "status"> & { orderId?: string; provider?: string; comments?: string; referralDiscountApplied?: boolean }) => {
      const payload: CreateOrderPayload = {
        serviceId: orderData.serviceId,
        serviceName: orderData.serviceName,
        platform: orderData.platform,
        platformColor: orderData.platformColor,
        type: orderData.type,
        quantity: orderData.quantity,
        price: orderData.price,
        link: orderData.link,
        ...(orderData.orderId   ? { orderId:   orderData.orderId   } : {}),
        ...(orderData.provider  ? { provider:  orderData.provider  } : {}),
        ...(orderData.comments  ? { comments:  orderData.comments  } : {}),
        ...(orderData.referralDiscountApplied ? { referralDiscountApplied: true } : {}),
      };
      const res = await apiClient.orders.create(payload);
      if (!res.success) {
        throw new Error(res.error ?? "Erreur lors de la création de la commande");
      }
      await loadOrders();
    },
    [loadOrders]
  );

  const cancelOrder = useCallback(async (id: string) => {
    const res = await apiClient.orders.cancel(id);
    if (!res.success) {
      throw new Error(res.error ?? "Erreur lors de l'annulation");
    }
    await loadOrders();
  }, [loadOrders]);

  const refreshOrderStatus = useCallback(async (id: string) => {
    const res = await apiClient.orders.refreshStatus(id);
    if (res.success && res.data) {
      const updated = mapRemoteOrder(res.data as RemoteOrder & { providerOrderId?: string; provider?: string });
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? updated : o))
      );
      return { providerStatus: (res as any).providerStatus };
    }
    return null;
  }, []);

  return (
    <OrdersContext.Provider
      value={{ orders, isLoading, createOrder, cancelOrder, refreshOrders, refreshOrderStatus }}
    >
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrders must be used within OrdersProvider");
  return ctx;
}
