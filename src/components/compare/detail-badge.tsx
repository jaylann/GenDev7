/**
 * DetailBadgeComponent Module
 *
 * Provides a reusable badge component with an icon and text,
 * supporting dynamic color configurations for background, text, border, and icon.
 * Delegates styling composition to the cn utility.
 */
import React, { FC } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * DetailBadgeInfo defines the props for DetailBadgeComponent.
 *
 * @property badgeKey   - Unique key for React list rendering.
 * @property icon       - Icon component to display inside the badge.
 * @property text       - Label text to show beside the icon.
 * @property colorConfig - Object containing CSS class names:
 *                          bg    for background color,
 *                          text  for text color,
 *                          border for border color,
 *                          icon  for icon color.
 */
export interface DetailBadgeInfo {
    badgeKey: string;
    icon: React.ElementType;
    text: string;
    colorConfig: { bg: string; text: string; border: string; icon: string };
    /** Optional description for accessibility purposes */
    description?: string;
}

/**
 * DetailBadgeComponent renders a styled Badge containing an icon and text.
 *
 * It applies outline variant and merges base styles with dynamic color classes.
 *
 * @param icon        - React ElementType for the icon.
 * @param text        - String label to display.
 * @param colorConfig - Color configuration object for styling.
 * @param badgeKey    - Unique key prop for React rendering.
 * @returns JSX.Element
 */
export const DetailBadgeComponent: FC<DetailBadgeInfo> = ({
    icon: Icon,
    text,
    colorConfig,
    badgeKey,
    description,
}) => (
    <Badge
        key={badgeKey}
        variant="outline"
        // Compose class names: spacing, typography, rounded corners, and dynamic color classes.
        className={cn(
            "gap-1 px-2 py-0.5 text-[0.7rem] font-medium rounded-md leading-tight whitespace-nowrap",
            colorConfig.bg,
            colorConfig.text,
            colorConfig.border,
        )}
        // Add accessibility attributes
        aria-label={description ? `${text} - ${description}` : text}
        title={description || text}
        role="status"
    >
        {/* Render the icon with specified size and dynamic color class. */}
        <Icon size={12} className={cn(colorConfig.icon, "mr-0.5")} aria-hidden="true" /> {text}
    </Badge>
);
