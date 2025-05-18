/**
 * ConnectionType Module
 *
 * Defines the available internet connection types and provides utilities
 * for presenting them in a user-friendly format.
 */
/**
 * ConnectionType
 *
 * Union type representing supported internet connection standards.
 *
 * Possible values:
 *  - "DSL": Digital Subscriber Line
 *  - "Cable": Cable internet service
 *  - "Fiber": Fiber-optic broadband
 *  - "Mobile": Cellular data connection
 */
export type ConnectionType = "DSL" | "Cable" | "Fiber" | "Mobile";

/**
 * Helper function to get a user-friendly display name for a connection type.
 * @param connectionType - The connection type.
 * @returns A human-readable string for the connection type.
 */
export const getConnectionTypeDisplayName = (
    connectionType: ConnectionType,
): string => {
    // Map each ConnectionType value to its user-friendly label
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
            // Exhaustive type check: should never occur if all cases are handled
            const exhaustiveCheck: never = connectionType;
            return exhaustiveCheck;
    }
};
