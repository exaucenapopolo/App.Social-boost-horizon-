import type { ComponentProps } from "react";
import Feather from "@expo/vector-icons/Feather";

export type FeatherIconName = ComponentProps<typeof Feather>["name"];

export const PLATFORM_ICONS: Record<string, FeatherIconName> = {
  instagram: "instagram",
  tiktok: "music",
  youtube: "youtube",
  facebook: "facebook",
  twitter: "twitter",
  telegram: "send",
  whatsapp: "message-circle",
  spotify: "headphones",
};
