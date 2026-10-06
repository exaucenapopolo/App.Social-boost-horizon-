import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { BASE_URL } from "@/services/api";

const DISMISSED_KEY = "@update_dismissed_version";

export interface VersionInfo {
  latestVersion: string;
  minVersion: string;
  downloadUrl: string;
  changelog: string;
  forceUpdate: boolean;
}

interface UpdateContextValue {
  updateAvailable: boolean;
  forceUpdate: boolean;
  info: VersionInfo | null;
  currentVersion: string;
  modalVisible: boolean;
  dismiss: () => void;
  openModal: () => void;
}

const UpdateContext = createContext<UpdateContextValue>({
  updateAvailable: false,
  forceUpdate: false,
  info: null,
  currentVersion: "1.0.0",
  modalVisible: false,
  dismiss: () => {},
  openModal: () => {},
});

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo]               = useState<VersionInfo | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const checkedRef = useRef(false);

  const currentVersion = Constants.expoConfig?.version ?? "1.0.0";

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    // ── COUCHE 1 : EAS OTA Update (silencieux, sans téléchargement) ──────────
    // S'active uniquement dans les builds de production (pas en dev/Expo Go).
    // L'app vérifie s'il y a un nouveau bundle JS, le télécharge et se recharge
    // automatiquement — l'utilisateur ne voit rien, la mise à jour est invisible.
    if (!__DEV__) {
      (async () => {
        try {
          const check = await Updates.checkForUpdateAsync();
          if (check.isAvailable) {
            await Updates.fetchUpdateAsync();
            // Rechargement immédiat avec le nouveau bundle
            await Updates.reloadAsync();
          }
        } catch {
          // Silencieux — pas de panique si Expo Update n'est pas disponible
        }
      })();
    }

    // ── COUCHE 2 : Vérification de version APK (grands changements natifs) ───
    // Affiche la modale de téléchargement uniquement quand un nouveau build
    // natif est nécessaire (nouveau module, changement Android/iOS profond).
    (async () => {
      try {
        const res  = await fetch(`${BASE_URL}api/version`, { signal: AbortSignal.timeout(8_000) });
        const json = await res.json();
        if (!json.success || !json.data) return;

        const v: VersionInfo = json.data;
        setInfo(v);

        const mustUpdate = compareVersions(currentVersion, v.minVersion) < 0;
        const hasNewer   = compareVersions(v.latestVersion, currentVersion) > 0;

        if (mustUpdate || v.forceUpdate) {
          setForceUpdate(true);
          setUpdateAvailable(true);
          setModalVisible(true);
          return;
        }

        if (hasNewer) {
          const dismissed = await AsyncStorage.getItem(DISMISSED_KEY);
          if (dismissed === v.latestVersion) return;
          setUpdateAvailable(true);
          setModalVisible(true);
        }
      } catch {
        // Silencieux — l'app fonctionne normalement sans vérification de version
      }
    })();
  }, [currentVersion]);

  const dismiss = useCallback(async () => {
    if (info && !forceUpdate) {
      await AsyncStorage.setItem(DISMISSED_KEY, info.latestVersion);
    }
    setModalVisible(false);
    setUpdateAvailable(false);
  }, [info, forceUpdate]);

  const openModal = useCallback(() => {
    if (updateAvailable) setModalVisible(true);
  }, [updateAvailable]);

  return (
    <UpdateContext.Provider
      value={{ updateAvailable, forceUpdate, info, currentVersion, modalVisible, dismiss, openModal }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate() {
  return useContext(UpdateContext);
}
