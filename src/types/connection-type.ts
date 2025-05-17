/**
 * Specifies the type of internet connection.
 */
export type ConnectionType = 'DSL' | 'Cable' | 'Fiber' | 'Mobile';


/**
 * Helper function to get a user-friendly display name for a connection type.
 * @param connectionType - The connection type.
 * @returns A human-readable string for the connection type.
 */
export const getConnectionTypeDisplayName = (connectionType: ConnectionType): string => {
    switch (connectionType) {
        case "DSL":
            return "DSL";
        case "Cable":
            return "Cable";
        case "Fiber":
            return "Fiber Optic";
        case "Mobile":
            return "Mobile";
        default:
            // This should ideally not be reached if types are correct
            // but provides a fallback for exhaustiveness checking.
            const exhaustiveCheck: never = connectionType;
            return exhaustiveCheck;
    }
};