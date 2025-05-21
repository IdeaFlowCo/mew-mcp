export class MCPError extends Error {
    constructor(message, status, details) {
        super(message);
        this.status = status;
        this.details = details;
        this.name = 'MCPError';
    }
}
export class AuthenticationError extends MCPError {
    constructor(message, status, details) {
        super(message, status, details);
        this.name = 'AuthenticationError';
    }
}
export class NodeOperationError extends MCPError {
    constructor(message, nodeId, status, details) {
        super(message, status, details);
        this.nodeId = nodeId;
        this.name = 'NodeOperationError';
    }
}
export class RelationOperationError extends MCPError {
    constructor(message, relationId, status, details) {
        super(message, status, details);
        this.relationId = relationId;
        this.name = 'RelationOperationError';
    }
}
export class BatchOperationError extends MCPError {
    constructor(message, transactionId, status, details) {
        super(message, status, details);
        this.transactionId = transactionId;
        this.name = 'BatchOperationError';
    }
}
