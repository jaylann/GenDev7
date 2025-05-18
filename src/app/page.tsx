// app/page.tsx  (Server Component by default, remove "use client")
import React, { Suspense } from "react";
import ComparePage from "@/components/compare/compare-page";
import ComparePageSkeleton from "@/components/compare/compare-page-skeleton";

export default function Page() {
    return (
        <Suspense fallback={<ComparePageSkeleton></ComparePageSkeleton>}>
            <ComparePage />
        </Suspense>
    );
}
