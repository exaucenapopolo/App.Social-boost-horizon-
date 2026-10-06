import { getFreshToken } from "./tokenStore";

const _rawBaseUrl: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "");
// Always ensure BASE_URL ends with "/" so that `${BASE_URL}api/...` produces a valid URL
export const BASE_URL: string = _rawBaseUrl.endsWith("/") ? _rawBaseUrl : _rawBaseUrl + "/";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  balance: number;
  referralBalance: number;
  totalOrders: number;
  referralCode: string;
  referredBy: string | null;
  photoURL: string | null;
  joinedAt: string | null;
  isAdmin?: boolean;
  country?: string | null;
  withdrawalBalance?: number;
}

export interface CreateOrderPayload {
  serviceId: string;
  serviceName: string;
  platform: string;
  platformColor?: string;
  type?: string;
  quantity: number;
  price: number;
  link: string;
  orderId?: string;
  provider?: string;
  comments?: string;
  referralDiscountApplied?: boolean;
}

export interface RemoteOrder {
  id: string;
  serviceId: string;
  serviceName: string;
  platform: string;
  platformColor: string;
  type: string;
  quantity: number;
  price: number;
  link: string;
  status: string;
  createdAt: string;
  orderId?: string;
  progress?: number;
  userId: string;
}

export interface RechargePayload {
  amount: number;
  phone: string;
  transactionId?: string;
  method?: string;
}

export interface RemoteRecharge {
  id: string;
  amount: number;
  method: string;
  phone: string;
  transactionId: string;
  status: string;
  createdAt: string;
  userId: string;
  verified?: boolean;
}

export interface WalletData {
  balance: number;
  referralBalance: number;
  recharges: RemoteRecharge[];
}

async function authedRequest<T>(
  path: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const token = await getFreshToken();
    if (!token) {
      return { success: false, error: "Non authentifié" };
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers as Record<string, string> | undefined),
    };
    // Strip leading slash from path to avoid double-slash when BASE_URL ends with "/"
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    const res = await fetch(`${BASE_URL}${normalizedPath}`, {
      ...options,
      headers,
    });
    const json = (await res.json()) as ApiResponse<T>;
    return json;
  } catch {
    return { success: false, error: "Réseau indisponible" };
  }
}

export interface RegisterPayload {
  name: string;
  email: string;
  phone?: string;
  referralCode?: string;
  referredBy?: string;
}

export const apiClient = {
  auth: {
    register: (payload: RegisterPayload) =>
      authedRequest<UserProfile>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },
  me: {
    get: () => authedRequest<UserProfile>("/api/me"),
    update: (payload: Partial<Pick<UserProfile, "name" | "phone" | "photoURL">>) =>
      authedRequest<void>("/api/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
  },

  orders: {
    list: () => authedRequest<RemoteOrder[]>("/api/orders"),
    create: (payload: CreateOrderPayload) =>
      authedRequest<RemoteOrder>("/api/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    cancel: (orderId: string) =>
      authedRequest<void>(`/api/orders/${orderId}/cancel`, {
        method: "POST",
      }),
    refreshStatus: (orderId: string) =>
      authedRequest<RemoteOrder>(`/api/orders/${orderId}/refresh-status`),
  },

  wallet: {
    get: () => authedRequest<WalletData>("/api/wallet"),
    recharge: (payload: RechargePayload) =>
      authedRequest<RemoteRecharge>("/api/wallet/recharge", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    transfer: (target: "main" | "withdrawal") =>
      authedRequest<void>("/api/wallet/transfer", {
        method: "POST",
        body: JSON.stringify({ target }),
      }),
    activities: () => authedRequest<any[]>("/api/wallet/activities"),
    fapshiConfirm: (transId: string, amount: number) =>
      authedRequest<{ credited?: number; newBalance?: number }>("/api/wallet/fapshi-confirm", {
        method: "POST",
        body: JSON.stringify({ transId, amount }),
      }),
    withdraw: (payload: { amount: number; phone: string; country: string; countryName: string; method: string; feeSource?: "main" | "withdrawal" }) =>
      authedRequest<{ newWithdrawalBalance?: number; fee?: number }>("/api/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },

  notifications: {
    registerPushToken: (token: string) =>
      authedRequest<void>("/api/notifications/push-token", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    unregisterPushToken: () =>
      authedRequest<void>("/api/notifications/push-token", {
        method: "DELETE",
      }),
  },

  request: <T = unknown>(path: string, options?: RequestInit) =>
    authedRequest<T>(`/api${path}`, options),

  post: <T = unknown>(path: string, body: unknown) =>
    authedRequest<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
