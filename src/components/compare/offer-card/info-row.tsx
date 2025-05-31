import { FC } from "react";

/**
 * Info row used in contract & connection type section.
 */
export interface InfoRowProps {
    Icon: React.ElementType;
    label: string;
    value: string;
}

export const InfoRow: FC<InfoRowProps> = ({ Icon, label, value }) => (
    <div className="flex items-center gap-1">
        <Icon size={13} className="text-slate-500 shrink-0" />
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-200">{value}</span>
    </div>
);
