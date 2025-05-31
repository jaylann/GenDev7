/**
 * Shared constants and helpers for the OfferCard module.
 */

import { DetailBadgeInfo } from "@/components/compare/detail-badge";
import { Tv2, HardHat, Database, ShieldCheck } from "lucide-react";

/**
 * Tailwind color classes for badge variants.
 */
export const BADGE_COLORS: Record<string, DetailBadgeInfo["colorConfig"]> = {
    tv: {
        bg: "bg-purple-600/20",
        text: "text-purple-300",
        border: "border-purple-500/50",
        icon: "text-purple-400",
    },
    install: {
        bg: "bg-sky-600/20",
        text: "text-sky-300",
        border: "border-sky-500/50",
        icon: "text-sky-400",
    },
    dataCap: {
        bg: "bg-amber-600/20",
        text: "text-amber-300",
        border: "border-amber-500/50",
        icon: "text-amber-400",
    },
    youth: {
        bg: "bg-teal-600/20",
        text: "text-teal-300",
        border: "border-teal-500/50",
        icon: "text-teal-400",
    },
    voucherInfo: {
        bg: "bg-pink-600/20",
        text: "text-pink-300",
        border: "border-pink-500/50",
        icon: "text-pink-400",
    },
};

/**
 * Map Lucide icons to badge keys for convenience.
 */
export const BADGE_ICONS = {
    tv: Tv2,
    install: HardHat,
    dataCap: Database,
    youth: ShieldCheck,
} as const;

/**
 * Descriptive text for badges (accessibility helper).
 */
export const getBadgeDescription = (badgeKey: string): string => {
    switch (badgeKey) {
        case "tv":
            return "Television package included with this offer";
        case "install":
            return "Information about installation service";
        case "dataCap":
            return "Data usage limit information";
        case "youth":
            return "Special offer for young customers";
        default:
            return "";
    }
};
