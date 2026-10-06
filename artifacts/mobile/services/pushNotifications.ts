import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform, Linking } from "react-native";
import { router } from "expo-router";
import { apiClient } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function navigateFromNotificationData(
  data: Record<string, unknown> | undefined | null
): void {
  if (!data) return;

  // External URL takes priority — open in device browser
  const externalUrl = typeof data.externalUrl === "string" ? data.externalUrl.trim() : "";
  if (externalUrl) {
    Linking.openURL(externalUrl).catch((e) =>
      console.warn("[push] Linking.openURL error:", e)
    );
    return;
  }

  const screen = String(data.screen ?? "");
  try {
    switch (screen) {
      case "home":
        router.push("/(tabs)");
        break;
      case "orders":
        router.push("/(tabs)/orders");
        break;
      case "wallet":
        router.push("/(tabs)/wallet");
        break;
      case "notifications":
        router.push("/(tabs)/notifications");
        break;
      case "profile":
        router.push("/(tabs)/profile");
        break;
      case "parrainage":
        router.push("/parrainage");
        break;
      case "new-order":
        router.push("/(tabs)/new-order");
        break;
      // default: no navigation, just open the app
    }
  } catch (e) {
    console.warn("[push] navigation error:", e);
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("[push] Skipping: not a physical device");
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[push] Permission refused by user");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Social Boost Horizon",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6C3AF5",
      sound: "default",
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Commandes",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4CAF50",
      sound: "default",
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync("wallet", {
      name: "Portefeuille",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2196F3",
      sound: "default",
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync("parrainage", {
      name: "Parrainage",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FFD700",
      sound: "default",
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  try {
    const projectId = "4c729449-8668-490a-a10c-a31e8e00b50b";
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    console.log("[push] Token obtenu:", token);

    // Retry automatique si l'enregistrement côté serveur échoue
    let saved = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await apiClient.notifications.registerPushToken(token);
        if (res.success) { saved = true; break; }
      } catch {
        // continue
      }
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 2000)); // 2s, 4s
      }
    }
    if (!saved) {
      console.warn("[push] Token non sauvegardé après 3 tentatives");
    }

    return token;
  } catch (e) {
    console.warn("[push] getExpoPushTokenAsync error:", e);
    return null;
  }
}

export function setupNotificationHandlers(): () => void {
  const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
    console.log("[push] Foreground received:", notification.request.content.title);
  });

  const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    navigateFromNotificationData(data);
  });

  return () => {
    foregroundSub.remove();
    tapSub.remove();
  };
}

export async function handleColdStartNotification(): Promise<void> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (response) {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      setTimeout(() => navigateFromNotificationData(data), 1500);
    }
  } catch (e) {
    console.warn("[push] getLastNotificationResponseAsync error:", e);
  }
}
