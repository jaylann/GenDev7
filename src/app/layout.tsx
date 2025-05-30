import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { GoogleMapsLoader } from "@/components/compare/google-maps-loader";
import { Toaster } from "@/components/ui/sonner";
import React from "react";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "BetterSurf",
    description:
        "Compare internet service providers side-by-side by speed, price, and customer reviews to find the perfect plan for your needs.",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: "#0C0B2E",
    colorScheme: "dark",
};

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html
            lang="en"
            className="overscroll-y-contain  bg-gradient-to-br
    from-[#0B0B2D]
    via-[#1C1044]
    to-[#3C0E4C]
    bg-fixed"
        >
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased overscroll-y-contain`}
            >
                <GoogleMapsLoader />
                <Toaster />
                {children}
            </body>
        </html>
    );
}
