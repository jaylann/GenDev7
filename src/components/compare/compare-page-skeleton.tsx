// components/ComparePageSkeleton.tsx
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function ComparePageSkeleton() {
    return (
        <div className="container mx-auto max-w-7xl px-4 pt-12 pb-0 flex flex-col space-y-6">
            {/* Page Header Skeleton */}
            <div className="h-8 w-1/3 mb-4">
                <Skeleton className="h-full w-full rounded-md" />
            </div>
            {/* Address Search Section Skeleton */}
            <div className="flex-none mb-6 space-y-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-3/5 rounded-lg" />
            </div>
            {/* Controls Skeleton */}
            <div className="flex gap-4 mb-6">
                <Skeleton className="h-8 w-24 rounded" />
                <Skeleton className="h-8 w-24 rounded" />
                <Skeleton className="h-8 w-24 rounded" />
            </div>
            {/* Grid of Offer Card Skeletons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-[#232740] p-4 rounded-lg space-y-4">
                        <Skeleton className="h-6 w-2/5 rounded" />
                        <Skeleton className="h-4 w-1/2 rounded" />
                        <Skeleton className="h-20 w-full rounded-lg" />
                        <Skeleton className="h-6 w-3/5 rounded" />
                    </div>
                ))}
            </div>
        </div>
    );
}
