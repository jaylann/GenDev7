/**
 * update-prompt-dialog.tsx
 *
 * Provides a modal dialog prompting the user to view newly fetched or updated real estate offers.
 * Uses the AlertDialog components for consistent modal behavior and styling.
 */
import React, { FC } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UpdatePromptDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    pendingOfferCount: number;
}

// Component to prompt the user when there are new or updated offers available
export const UpdatePromptDialog: FC<UpdatePromptDialogProps> = ({
    isOpen,
    onOpenChange,
    onConfirm,
    pendingOfferCount,
}) => {
    // Root AlertDialog controlling visibility and open state
    return (
        <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
            {/* Container for the dialog content, applies theme styling */}
            <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
                {/* Header section with title and descriptive text */}
                <AlertDialogHeader>
                    <AlertDialogTitle>New Offers Available</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400">
                        The full search has returned additional/updated offers.
                        Would you like to display them?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {/* Footer section containing action buttons for dismissal or confirmation */}
                <AlertDialogFooter>
                    <AlertDialogCancel
                        onClick={() => onOpenChange(false)}
                        className="bg-transparent border-slate-600 hover:bg-slate-700 text-slate-300 hover:text-white"
                    >
                        Later
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            onConfirm();
                            onOpenChange(false);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        Show Offers ({pendingOfferCount})
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
