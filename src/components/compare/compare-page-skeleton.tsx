"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A full‑page skeleton that mirrors the actual ComparePage layout as closely
 * as possible, so the shift from loading → loaded feels minimal.
 */
export default function ComparePageSkeleton() {
    return (
        <div className="flex flex-col h-screen bg-gradient-to-br from-[#0B0B2D] via-[#1C1044] to-[#3C0E4C] text-slate-100">
            <main className="container mx-auto max-w-7xl px-4 pt-12 pb-0 flex-1 flex flex-col space-y-2 sm:space-y-6 overflow-hidden">
                {/* ───────────────────────── Header ───────────────────────── */}
                <header className="flex flex-col items-center space-y-2 sm:space-y-3">
                    <Skeleton className="h-8 w-56 sm:h-10 sm:w-72 md:h-12 md:w-96 rounded-md" />
                    {/* status / warning line */}
                    <Skeleton className="h-4 w-2/3 sm:w-1/3 max-w-xs rounded" />
                </header>

                {/* ─────────────── Address input + Search button ─────────────── */}
                <section className="max-w-2xl mx-auto w-full flex flex-col sm:flex-row items-stretch gap-2 sm:gap-3 md:gap-4">
                    <Skeleton className="flex-grow h-12 sm:h-12 rounded-lg" />
                    <Skeleton className="h-12 w-full sm:w-36 md:w-40 lg:w-48 rounded-lg flex-shrink-0" />
                </section>

                {/* ─────────────────────── Controls row ─────────────────────── */}
                <section className="flex items-center justify-between overflow-x-auto gap-2 sm:gap-4 px-2 py-2 border-y border-slate-700/50 text-xs sm:text-sm">
                    {/* Sort */}
                    <Skeleton className="h-8 w-24 rounded-md flex-shrink-0" />
                    {/* Filter */}
                    <Skeleton className="h-8 w-24 rounded-md flex-shrink-0" />
                    {/* Share */}
                    <Skeleton className="h-8 w-24 rounded-md flex-shrink-0" />
                    {/* View Toggle (shown ≥ sm) */}
                    <div className="hidden sm:flex items-center gap-2">
                        <Skeleton className="h-8 w-20 rounded-md" />
                    </div>
                </section>

                {/* ─────────────────────── Offers grid ─────────────────────── */}
                <div className="flex-1 overflow-y-auto scrollbar-none py-4">
                    <div className="grid gap-5 sm:gap-6 px-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton
                                key={i}
                                className="h-96 w-full rounded-xl bg-slate-700/50"
                            />
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
