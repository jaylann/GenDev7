/**
 * Module handling the definition of sorting options for lists of items.
 *
 * Provides a type-safe interface to represent a sorting criterion,
 * including a unique key, display label, and optional icon component.
 */
import React from "react";
import { SortOptionKey } from "@/types/sort-option-key";

/**
 * SortOption describes a single sorting criterion for lists.
 *
 * @property key - A unique identifier for the sort option (e.g., "priceAsc").
 * @property label - Human-readable text to display for this sort option.
 * @property icon - Optional React component to render alongside the label.
 */
export interface SortOption {
    key: SortOptionKey;
    label: string;
    icon?: React.ElementType;
}
