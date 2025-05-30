"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCcw } from "lucide-react";
import React, { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "@/utils/logger";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error Boundary component that catches JavaScript errors in its child component tree.
 * Displays a fallback UI instead of crashing the entire application.
 */
class ErrorBoundary extends Component<Props, State> {
    public state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        logger.error("ErrorBoundary", "Error caught by ErrorBoundary", error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="p-6 flex items-center justify-center min-h-[400px]">
                    <Alert variant="destructive" className="max-w-lg">
                        <AlertCircle className="h-5 w-5" />
                        <AlertTitle>Something went wrong</AlertTitle>
                        <AlertDescription className="mt-2">
                            <p className="mb-4">
                                We encountered an error while displaying this
                                content. This is likely a temporary issue.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-2"
                                onClick={() => {
                                    this.handleReset();
                                    window.location.reload();
                                }}
                            >
                                <RefreshCcw className="h-4 w-4" /> Try Again
                            </Button>
                        </AlertDescription>
                    </Alert>
                </div>
            );
        }

        return this.props.children;
    }
}

export { ErrorBoundary };
