import React, { FC } from "react";
import { Briefcase, Building2, Target, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders a placeholder logo for an internet provider.
 * @param providerName - The name of the provider.
 * @param className - Additional CSS classes for styling.
 */
export const ProviderLogo: FC<{ providerName: string; className?: string }> = ({
    providerName,
    className,
}) => {
    let IconComponent: React.ElementType = Building2;
    const lowerProviderName = providerName.toLowerCase();
    if (lowerProviderName.includes("webwunder")) IconComponent = Wifi;
    else if (lowerProviderName.includes("byteme")) IconComponent = Briefcase;
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
