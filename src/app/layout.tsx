import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { GoogleMapsLoader } from "@/components/compare/google-maps-loader";
import { Toaster } from "@/components/ui/sonner";

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
        <html lang="en" className="overscroll-y-contain">
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased overscroll-y-contain`}
            >
                <GoogleMapsLoader />
                <Toaster />
                <div className="safe-area-glass" />
                {children}
            </body>
        </html>
    );
}
