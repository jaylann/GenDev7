"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = "system" } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps["theme"]}
            className="toaster group"
            style={
                {
                    "--normal-bg": "#1C203C",
                    "--normal-text": "#D1D5DB",
                    "--normal-border": "#303558",
                    "--title-font-weight": "700",
                } as React.CSSProperties
            }
            {...props}
        />
    );
};

export { Toaster };
