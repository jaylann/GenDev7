/**
 * ProviderLogo Module
 *
 * Provides a circular logo/icon for an internet provider based on its name.
 * Selects an appropriate icon component by matching keywords in the provider name.
 */
import React, { FC } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";

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
    const lowerProviderName = providerName.toLowerCase();
    const imageSrc = `/${lowerProviderName}.webp`;
    return (
        <div
            className={cn(
                "relative flex items-center justify-center size-10 rounded-full bg-slate-700 text-white p-2 transition-colors",
                className,
            )}
            title={providerName}
        >
            <Image src={imageSrc} alt={providerName} fill className="object-contain rounded-full" />
        </div>
    );
};
