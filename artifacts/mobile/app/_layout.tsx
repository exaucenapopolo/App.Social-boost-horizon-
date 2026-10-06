import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import UpdateModal from "@/components/UpdateModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { OrdersProvider } from "@/context/OrdersContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { UpdateProvider } from "@/context/UpdateContext";
import { WalletProvider } from "@/context/WalletContext";
import {
  registerForPushNotifications,
  setupNotificationHandlers,
  handleColdStartNotification,
} from "@/services/pushNotifications";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function AppNavigator() {
  const { user, isLoading } = useAuth();
  const lastUserId = useRef<string | null>(null);
  const lastForegroundAttempt = useRef(0);

  useEffect(() => {
    const cleanup = setupNotificationHandlers();
    return cleanup;
  }, []);

  // Registration throttlée pour les retours en foreground (max 1x/60s)
  const attemptPushOnForeground = () => {
    const now = Date.now();
    if (now - lastForegroundAttempt.current < 60_000) return;
    lastForegroundAttempt.current = now;
    registerForPushNotifications()
      .catch((e) => console.warn("[push] foreground registration error:", e));
  };

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace("/auth/login");
        lastUserId.current = null;
        lastForegroundAttempt.current = 0;
      } else {
        router.replace("/(tabs)");
        // Tenter la registration à CHAQUE connexion (nouvel utilisateur ou même utilisateur)
        const isNewLogin = lastUserId.current !== user.id;
        if (isNewLogin) {
          lastUserId.current = user.id;
          // Enregistrement immédiat au login — sans throttle
          registerForPushNotifications()
            .catch((e) => console.warn("[push] login registration error:", e));
          handleColdStartNotification().catch(() => {});
        }
      }
    }
  }, [user, isLoading]);

  // Re-tenter l'enregistrement quand l'app revient au premier plan
  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        attemptPushOnForeground();
      }
    });
    return () => sub.remove();
  }, [user]);

  return (
    <OrdersProvider userId={user?.id ?? ""}>
      <WalletProvider userId={user?.id ?? ""}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="auth/login"
            options={{ headerShown: false, animation: "fade" }}
          />
          <Stack.Screen
            name="auth/register"
            options={{ headerShown: false, animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="order/[serviceId]"
            options={{
              headerShown: false,
              presentation: "modal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="admin-notifications"
            options={{
              headerShown: false,
              animation: "slide_from_right",
            }}
          />
        </Stack>
      </WalletProvider>
    </OrdersProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <UpdateProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    <AppNavigator />
                    <UpdateModal />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </UpdateProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
