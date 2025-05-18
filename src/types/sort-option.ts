import React from "react";
import { SortOptionKey } from "@/types/sort-option-key";

export interface SortOption {
    key: SortOptionKey;
    label: string;
    icon?: React.ElementType;
}
