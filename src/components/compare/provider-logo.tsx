/**
 * ProviderLogo Module
 *
 * Provides a circular logo/icon for an internet provider based on its name.
 * Selects an appropriate icon component by matching keywords in the provider name.
 */
import React, { FC } from "react";
import { Briefcase, Building2, Target, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ProviderLogo component displays a provider-specific icon inside a styled container.
 *
 * Chooses the icon based on keywords found in the providerName:
 *  - "webwunder" → Wifi icon
 *  - "byteme" → Briefcase icon
 *  - "ping perfect" → Target icon
 *  - default → Building2 icon
 *
 * @param providerName - The name of the internet provider to determine the icon.
 * @param className - Optional additional CSS classes for styling the container.
 * @returns JSX.Element containing the provider icon.
 */
export const ProviderLogo: FC<{ providerName: string; className?: string }> = ({
    providerName,
    className,
}) => {
    // Default icon if no provider-specific keyword matches
    let IconComponent: React.ElementType = Building2;
    const lowerProviderName = providerName.toLowerCase();
    // Use Wifi icon for providers matching "webwunder"
    if (lowerProviderName.includes("webwunder")) IconComponent = Wifi;
    // Use Briefcase icon for providers matching "byteme"
    else if (lowerProviderName.includes("byteme")) IconComponent = Briefcase;
    // Use Target icon for providers matching "ping perfect"
    else if (lowerProviderName.includes("ping perfect")) IconComponent = Target;
    return (
        <div
            className={cn(
                "flex items-center justify-center size-10 rounded-full bg-slate-700 text-white p-2 transition-colors",
                className,
            )}
            title={providerName}
        >
            <IconComponent className="size-5" />
        </div>
    );
};
