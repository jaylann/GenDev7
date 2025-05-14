// app/compare/components/UpdatePromptDialog.tsx
import React, { FC } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface UpdatePromptDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    pendingOfferCount: number;
}

/**
 * Dialog component to prompt the user when new/updated offers are available.
 * @param isOpen - Controls the visibility of the dialog.
 * @param onOpenChange - Callback for when the dialog's open state changes.
 * @param onConfirm - Callback executed when the user confirms to show new offers.
 * @param pendingOfferCount - The number of new/updated offers pending.
 */
export const UpdatePromptDialog: FC<UpdatePromptDialogProps> = ({
                                                                    isOpen,
                                                                    onOpenChange,
                                                                    onConfirm,
                                                                    pendingOfferCount,
                                                                }) => {
    return (
        <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
            <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
                <AlertDialogHeader>
                    <AlertDialogTitle>New Offers Available</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400">
                        The full search has returned additional/updated offers. Would you like to display them?
                    </AlertDialogDescription>
                </AlertDialogHeader>
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