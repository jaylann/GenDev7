import React, {FC} from "react";
import {Badge} from "@/components/ui/badge";
import {cn} from "@/lib/utils";

export interface DetailBadgeInfo {
    badgeKey: string;
    icon: React.ElementType;
    text: string;
    colorConfig: { bg: string; text: string; border: string; icon: string };
}

export const DetailBadgeComponent: FC<DetailBadgeInfo> = ({icon: Icon, text, colorConfig, badgeKey}) => (
    <Badge key={badgeKey} variant="outline"
           className={cn("gap-1 px-2 py-0.5 text-[0.7rem] font-medium rounded-md leading-tight whitespace-nowrap", colorConfig.bg, colorConfig.text, colorConfig.border)}>
        <Icon size={12} className={cn(colorConfig.icon, "mr-0.5")}/> {text}
    </Badge>);