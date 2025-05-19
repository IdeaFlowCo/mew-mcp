export class MCPError extends Error {
  constructor(message: string, public status?: number, public details?: string) {
    super(message);
    this.name = 'MCPError';
  }
}

export class AuthenticationError extends MCPError {
  constructor(message: string, status?: number, details?: string) {
    super(message, status, details);
    this.name = 'AuthenticationError';
  }
}

export class NodeOperationError extends MCPError {
  constructor(
    message: string,
    public nodeId: string,
    status?: number,
    details?: string
  ) {
    super(message, status, details);
    this.name = 'NodeOperationError';
  }
}

export class RelationOperationError extends MCPError {
  constructor(
    message: string,
    public relationId: string,
    status?: number,
    details?: string
  ) {
    super(message, status, details);
    this.name = 'RelationOperationError';
  }
}

export class BatchOperationError extends MCPError {
  constructor(
    message: string,
    public transactionId: string,
    status?: number,
    details?: string
  ) {
    super(message, status, details);
    this.name = 'BatchOperationError';
  }
} 