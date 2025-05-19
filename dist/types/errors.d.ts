export declare class MCPError extends Error {
    status?: number | undefined;
    details?: string | undefined;
    constructor(message: string, status?: number | undefined, details?: string | undefined);
}
export declare class AuthenticationError extends MCPError {
    constructor(message: string, status?: number, details?: string);
}
export declare class NodeOperationError extends MCPError {
    nodeId: string;
    constructor(message: string, nodeId: string, status?: number, details?: string);
}
export declare class RelationOperationError extends MCPError {
    relationId: string;
    constructor(message: string, relationId: string, status?: number, details?: string);
}
export declare class BatchOperationError extends MCPError {
    transactionId: string;
    constructor(message: string, transactionId: string, status?: number, details?: string);
}
