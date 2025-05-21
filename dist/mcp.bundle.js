// src/core/start.ts
import express from "express";
import dotenv from "dotenv";

// src/api/nodes.ts
import fetch2 from "node-fetch";

// src/types/errors.ts
var MCPError = class extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = "MCPError";
  }
};
var AuthenticationError = class extends MCPError {
  constructor(message, status, details) {
    super(message, status, details);
    this.name = "AuthenticationError";
  }
};
var NodeOperationError = class extends MCPError {
  constructor(message, nodeId, status, details) {
    super(message, status, details);
    this.nodeId = nodeId;
    this.name = "NodeOperationError";
  }
};

// src/utils/content.ts
import crypto from "crypto";
function createNodeContent(content) {
  if (Array.isArray(content)) {
    return content;
  }
  if (content.type === "text" /* Text */) {
    return [{ type: "text", value: content.text }];
  } else if (content.type === "text" && content.text) {
    return [{ type: "text", value: content.text }];
  } else if (content.type === "mention" /* Mention */) {
    return [
      {
        type: "text",
        value: content.mentionData.preMentionText
      },
      {
        type: "mention",
        value: content.mentionData.mentionNodeId,
        mentionTrigger: "@"
      },
      {
        type: "text",
        value: content.mentionData.postMentionText
      }
    ];
  } else if (content.type === "replacement" /* Replacement */) {
    return [{ type: "text", value: "replacement" }];
  }
  return [{ type: "text", value: "" }];
}
function uuid() {
  return crypto.randomUUID();
}

// src/utils/queue.ts
var RequestQueue = class {
  constructor(batchSize, maxDelay, rateLimit) {
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = 0;
    this.batchSize = batchSize;
    this.maxDelay = maxDelay;
    this.rateLimit = rateLimit;
  }
  /**
   * Adds a request to the queue and processes it according to the configured rules.
   * @param request A function that returns a Promise for the API request
   * @returns A Promise that resolves with the request result
   */
  async enqueue(request) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          const minTimeBetweenRequests = 1e3 / this.rateLimit;
          if (timeSinceLastRequest < minTimeBetweenRequests) {
            await new Promise(
              (resolve2) => setTimeout(
                resolve2,
                minTimeBetweenRequests - timeSinceLastRequest
              )
            );
          }
          const result = await request();
          this.lastRequestTime = Date.now();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }
  /**
   * Processes the queue according to the configured batch size and delay.
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.batchSize);
        const results = await Promise.allSettled(
          batch.map((req) => req())
        );
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            console.error(
              `[Mew MCP] [RequestQueue] Request in batch (index ${index}) settled as rejected:`,
              result.reason
            );
          }
        });
        if (this.queue.length > 0) {
          await new Promise(
            (resolve) => setTimeout(resolve, this.maxDelay)
          );
        }
      }
    } catch (error) {
      console.error(
        "[Mew MCP] [RequestQueue] Critical error in processQueue loop:",
        error
      );
    } finally {
      this.processing = false;
    }
  }
  /**
   * Clears the queue and cancels any pending processing.
   */
  clear() {
    this.queue = [];
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = void 0;
    }
    this.processing = false;
  }
  /**
   * Gets the current number of requests in the queue.
   */
  get length() {
    return this.queue.length;
  }
};

// src/api/auth.ts
import fetch from "node-fetch";

// src/utils/cache.ts
var Cache = class {
  constructor(ttlMs) {
    this.cache = /* @__PURE__ */ new Map();
    this.ttl = ttlMs;
  }
  /**
   * Sets a value in the cache with the configured TTL.
   * @param key The cache key
   * @param value The value to cache
   */
  set(key, value) {
    const expiry = Date.now() + this.ttl;
    this.cache.set(key, { value, expiry });
  }
  /**
   * Gets a value from the cache if it exists and hasn't expired.
   * @param key The cache key
   * @returns The cached value or undefined if not found/expired
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return void 0;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return void 0;
    }
    return item.value;
  }
  /**
   * Removes a value from the cache.
   * @param key The cache key
   */
  delete(key) {
    this.cache.delete(key);
  }
  /**
   * Clears all values from the cache.
   */
  clear() {
    this.cache.clear();
  }
  /**
   * Checks if a key exists in the cache and hasn't expired.
   * @param key The cache key
   * @returns boolean indicating if the key exists and is valid
   */
  has(key) {
    const item = this.cache.get(key);
    if (!item) return false;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
};

// src/api/auth.ts
var AuthService = class {
  constructor(config) {
    this.config = config;
    this.tokenCache = new Cache(4 * 60 * 1e3);
  }
  /**
   * Retrieves or refreshes the Auth0 access token using client credentials.
   * @returns The fetched access token
   * @throws {AuthenticationError} If authentication fails
   */
  async getAccessToken() {
    const cachedToken = this.tokenCache.get("auth_token");
    if (cachedToken) {
      return cachedToken;
    }
    try {
      const response = await fetch(
        `https://${this.config.auth0Domain}/oauth/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            client_id: this.config.auth0ClientId,
            client_secret: this.config.auth0ClientSecret,
            audience: this.config.auth0Audience,
            grant_type: "client_credentials"
          })
        }
      );
      if (!response.ok) {
        throw new AuthenticationError(
          `Auth failed: ${response.statusText}`,
          response.status,
          await response.text()
        );
      }
      const data = await response.json();
      this.tokenCache.set("auth_token", data.access_token);
      return data.access_token;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(
        `Failed to get access token: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
  /**
   * Clears the token cache, forcing a new token to be fetched on the next request.
   */
  clearTokenCache() {
    this.tokenCache.clear();
  }
};

// src/api/nodes.ts
var NodeService = class _NodeService extends AuthService {
  constructor(config) {
    super(config);
    this.currentUserId = "";
    this.config = config;
    this.requestQueue = new RequestQueue(10, 100, 50);
  }
  /**
   * Sets the User ID for the current session.
   * @param userId The Mew User ID
   */
  setCurrentUserId(userId) {
    this.currentUserId = userId;
  }
  /**
   * Gets the currently set User ID.
   * @returns An object containing the current user ID
   */
  getCurrentUser() {
    return { id: this.currentUserId };
  }
  /**
   * Finds the first child node under a given parent that has an exact text match.
   * @param params Object containing parentNodeId and nodeText to search for
   * @returns The matching GraphNode or undefined if not found
   */
  async findNodeByText({
    parentNodeId,
    nodeText
  }) {
    const { childNodes } = await this.getChildNodes({ parentNodeId });
    return childNodes.find(
      (node) => node && node.content && node.content.length > 0 && node.content[0].value === nodeText
    );
  }
  /**
   * Retrieves the direct child nodes of a given parent node.
   * @param params Object containing parentNodeId
   * @returns An object containing the parent node data and an array of its direct child nodes
   */
  async getChildNodes({
    parentNodeId
  }) {
    const layerData = await this.getLayerData([parentNodeId]);
    const parentNode = layerData.data.nodesById[parentNodeId];
    const childRelations = Object.values(
      layerData.data.relationsById
    ).filter(
      (relation) => relation !== null && typeof relation === "object" && "fromId" in relation && "toId" in relation && "relationTypeId" in relation && relation.fromId === parentNodeId && relation.relationTypeId === "child"
    );
    const childNodes = childRelations.map((relation) => {
      const nodeData = layerData.data.nodesById[relation.toId];
      return nodeData;
    });
    return {
      parentNode,
      childNodes
    };
  }
  /**
   * Fetches detailed data for a list of specified object IDs.
   * @param objectIds An array of node or relation IDs
   * @returns The layer data payload containing details about the requested objects
   */
  async getLayerData(objectIds) {
    return this.requestQueue.enqueue(async () => {
      const token = await this.getAccessToken();
      const response = await fetch2(`${this.config.baseUrl}/layer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ objectIds })
      });
      if (!response.ok) {
        throw new NodeOperationError(
          `Failed to fetch layer data: ${response.statusText}`,
          objectIds[0],
          response.status,
          await response.text()
        );
      }
      return response.json();
    });
  }
  /**
   * Updates an existing Mew node with the provided partial data.
   * @param nodeId The ID of the node to update
   * @param updates An object containing the properties to update
   */
  async updateNode(nodeId, updates) {
    const startTime = Date.now();
    try {
      const token = await this.getAccessToken();
      const transactionId = uuid();
      const timestamp = Date.now();
      const authorId = this.currentUserId;
      const layerData = await this.getLayerData([nodeId]);
      const existingNode = layerData.data.nodesById[nodeId];
      if (!existingNode) {
        throw new NodeOperationError(
          `Node with ID ${nodeId} not found.`,
          nodeId
        );
      }
      const updatePayload = {
        operation: "updateNode",
        oldProps: {
          ...existingNode,
          content: createNodeContent(existingNode.content),
          updatedAt: existingNode.updatedAt
        },
        newProps: {
          ...existingNode,
          ...updates,
          content: updates.content ? createNodeContent(updates.content) : createNodeContent(existingNode.content),
          id: nodeId,
          authorId: existingNode.authorId,
          createdAt: existingNode.createdAt,
          updatedAt: new Date(timestamp).toISOString()
        }
      };
      const payload = {
        clientId: this.config.auth0ClientId,
        userId: authorId,
        transactionId,
        updates: [updatePayload]
      };
      await this.requestQueue.enqueue(async () => {
        const response = await fetch2(`${this.config.baseUrl}/sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const responseText = await response.text();
          throw new NodeOperationError(
            `Failed to update node ${nodeId}: ${response.statusText}`,
            nodeId,
            response.status,
            responseText
          );
        }
      });
    } catch (error) {
      console.error("Failed to update node", {
        nodeId,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      throw error;
    }
  }
  /**
   * Deletes a Mew node.
   * @param nodeId The ID of the node to delete
   */
  async deleteNode(nodeId) {
    const token = await this.getAccessToken();
    const transactionId = uuid();
    const authorId = this.currentUserId;
    const layerData = await this.getLayerData([nodeId]);
    const existingNode = layerData.data.nodesById[nodeId];
    if (!existingNode) {
      console.warn(
        `[NodeService] Node with ID ${nodeId} not found for deletion. Skipping.`
      );
      return;
    }
    const deletePayload = {
      operation: "deleteNode",
      node: {
        id: nodeId
      }
    };
    const payload = {
      clientId: this.config.auth0ClientId,
      userId: authorId,
      transactionId,
      updates: [deletePayload]
    };
    await this.requestQueue.enqueue(async () => {
      const response = await fetch2(`${this.config.baseUrl}/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const responseText = await response.text();
        throw new NodeOperationError(
          `Failed to delete node ${nodeId}: ${response.statusText}`,
          nodeId,
          response.status,
          responseText
        );
      }
    });
  }
  /**
   * Adds a single Mew node.
   * @param input Object containing node details
   * @returns An object containing IDs of the created node and relations
   */
  async addNode(input) {
    const { content, parentNodeId, relationLabel, isChecked, authorId } = input;
    const nodeContent = createNodeContent(content);
    const usedAuthorId = authorId ?? this.currentUserId;
    const newNodeId = uuid();
    const parentChildRelationId = uuid();
    const transactionId = uuid();
    const timestamp = Date.now();
    let relationLabelNodeId = "";
    const updates = [];
    updates.push({
      operation: "addNode",
      node: {
        version: 1,
        id: newNodeId,
        authorId: usedAuthorId,
        createdAt: new Date(timestamp).toISOString(),
        // Using ISO string for z.coerce.date()
        updatedAt: new Date(timestamp).toISOString(),
        // Using ISO string for z.coerce.date()
        content: nodeContent,
        isPublic: true,
        // Default in schema is false, but example sends true
        isNewRelatedObjectsPublic: false,
        // Default in schema is false, example sends false
        canonicalRelationId: parentNodeId ? parentChildRelationId : null,
        // Matches schema default
        isChecked: isChecked ?? null,
        // Matches schema default
        accessMode: 0,
        // Added, default from schema
        attributes: {}
        // Added, default from schema (empty object for optional sub-fields)
        // relationId is still omitted as it's not in SerializedNodeSchema and not in example's addNode node object
      }
    });
    if (parentNodeId) {
      updates.push({
        operation: "addRelation",
        relation: {
          version: 1,
          id: parentChildRelationId,
          authorId: usedAuthorId,
          createdAt: timestamp,
          updatedAt: timestamp,
          fromId: parentNodeId,
          toId: newNodeId,
          relationTypeId: "child",
          isPublic: true,
          canonicalRelationId: null
        },
        fromPos: { int: timestamp, frac: "a0" },
        toPos: { int: timestamp, frac: "a0" }
      });
      updates.push({
        operation: "updateRelationList",
        relationId: parentChildRelationId,
        oldPosition: null,
        newPosition: { int: timestamp, frac: "a0" },
        authorId: usedAuthorId,
        type: "all",
        oldIsPublic: true,
        newIsPublic: true,
        nodeId: parentNodeId,
        relatedNodeId: newNodeId
      });
    }
    if (relationLabel) {
      relationLabelNodeId = uuid();
      updates.push({
        operation: "addNode",
        node: {
          version: 1,
          id: relationLabelNodeId,
          authorId: usedAuthorId,
          createdAt: new Date(timestamp).toISOString(),
          // Using ISO string
          updatedAt: new Date(timestamp).toISOString(),
          // Using ISO string
          content: [
            { type: "text", value: relationLabel, styles: 0 }
            // styles:0 is fine as per SerializedChipSchema
          ],
          isPublic: true,
          isNewRelatedObjectsPublic: false,
          canonicalRelationId: null,
          isChecked: null,
          accessMode: 0,
          // Added
          attributes: {}
          // Added
        }
      });
      const newRelationTypeId = uuid();
      updates.push({
        operation: "addRelation",
        relation: {
          version: 1,
          id: newRelationTypeId,
          authorId: usedAuthorId,
          createdAt: timestamp,
          updatedAt: timestamp,
          fromId: parentChildRelationId,
          toId: relationLabelNodeId,
          relationTypeId: "__type__",
          isPublic: true,
          canonicalRelationId: null
        },
        fromPos: { int: timestamp, frac: "a0" },
        toPos: { int: timestamp, frac: "a0" }
      });
      updates.push({
        operation: "updateRelationList",
        relationId: newRelationTypeId,
        oldPosition: null,
        newPosition: { int: timestamp, frac: "a0" },
        authorId: usedAuthorId,
        type: "all",
        oldIsPublic: true,
        newIsPublic: true,
        nodeId: parentChildRelationId,
        relatedNodeId: relationLabelNodeId
      });
      updates.push({
        operation: "updateRelation",
        oldProps: {
          version: 1,
          id: parentChildRelationId,
          authorId: usedAuthorId,
          createdAt: timestamp,
          updatedAt: timestamp,
          fromId: parentNodeId,
          toId: newNodeId,
          relationTypeId: "child",
          isPublic: true,
          canonicalRelationId: null
        },
        newProps: {
          version: 1,
          id: parentChildRelationId,
          authorId: usedAuthorId,
          createdAt: timestamp,
          updatedAt: timestamp,
          fromId: parentNodeId,
          toId: newNodeId,
          relationTypeId: "child",
          isPublic: true,
          canonicalRelationId: newRelationTypeId
        }
      });
    }
    if (content.type === "replacement" /* Replacement */ && content.replacementNodeData) {
      updates.push({
        operation: "updateRelation",
        oldProps: {
          version: 1,
          id: parentChildRelationId,
          authorId: usedAuthorId,
          createdAt: timestamp,
          updatedAt: timestamp,
          fromId: parentNodeId,
          toId: newNodeId,
          relationTypeId: "child",
          isPublic: true,
          canonicalRelationId: null
        },
        newProps: {
          version: 1,
          id: parentChildRelationId,
          authorId: usedAuthorId,
          createdAt: timestamp,
          updatedAt: timestamp,
          fromId: parentNodeId,
          toId: content.replacementNodeData.referenceNodeId,
          relationTypeId: "child",
          isPublic: true,
          canonicalRelationId: content.replacementNodeData.referenceCanonicalRelationId
        }
      });
      updates.push({
        operation: "updateRelationList",
        relationId: parentChildRelationId,
        oldPosition: null,
        newPosition: { int: timestamp, frac: "a0" },
        authorId: usedAuthorId,
        type: "all",
        oldIsPublic: true,
        newIsPublic: true,
        nodeId: parentNodeId,
        relatedNodeId: content.replacementNodeData.referenceNodeId
      });
    }
    const token = await this.getAccessToken();
    const payload = {
      clientId: this.config.auth0ClientId,
      userId: usedAuthorId,
      // Removed prefix, using raw usedAuthorId
      transactionId,
      updates
    };
    console.log(
      "[NodeService] addNode /sync payload:",
      JSON.stringify(payload, null, 2)
    );
    await this.requestQueue.enqueue(async () => {
      const response = await fetch2(`${this.config.baseUrl}/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const responseText = await response.text();
        throw new NodeOperationError(
          `Failed to add node: ${response.statusText}`,
          newNodeId,
          response.status,
          responseText
        );
      }
    });
    return {
      newNodeId,
      newRelationLabelNodeId: relationLabelNodeId,
      parentChildRelationId,
      referenceNodeId: content.type === "replacement" /* Replacement */ && content.replacementNodeData ? content.replacementNodeData.referenceNodeId : "",
      referenceCanonicalRelationId: content.type === "replacement" /* Replacement */ && content.replacementNodeData ? content.replacementNodeData.referenceCanonicalRelationId : "",
      isChecked: isChecked ?? void 0
    };
  }
  /**
   * Constructs the web URL for a given Mew node ID.
   * @param nodeId The Mew Node ID
   * @returns The full URL to view the node in the Mew web interface
   */
  getNodeUrl(nodeId) {
    if (!this.currentUserId) {
      console.warn(
        "[NodeService] getNodeUrl called before currentUserId is set. URL might be incorrect."
      );
      return `${this.config.baseNodeUrl}g/all/global-root-to-users/all/users-to-user-relation-id-unknown/user-root-id-unknown`;
    }
    return `${this.config.baseNodeUrl}g/all/global-root-to-users/all/users-to-user-relation-id-${this.currentUserId}/user-root-id-${this.currentUserId}/node-${nodeId}`;
  }
  /**
   * Parses the user root node ID from a specially formatted URL.
   * @param url The user root node URL.
   * @returns The extracted user root node ID.
   * @throws Error if the URL format is invalid.
   */
  static parseUserRootNodeIdFromUrl(url) {
    const regex = /users-to-user-relation-id-[^\/]+\/user-root-id-[^\/]+$/;
    if (!regex.test(url)) {
      console.error(
        "[NodeService] Invalid user root node URL format for parsing:",
        url
      );
      throw new Error("Invalid user root node URL format for parsing.");
    }
    const urlParts = url.split("/");
    const lastPart = urlParts[urlParts.length - 1];
    let decoded = lastPart;
    try {
      decoded = decodeURIComponent(lastPart);
    } catch (e) {
      console.error(
        "[NodeService] Error decoding URL part:",
        lastPart,
        e
      );
    }
    decoded = decoded.replace(/%7C/gi, "|");
    return decoded;
  }
  /**
   * Gets the current user's root node ID.
   * This ID is derived from a conventional URL structure.
   * @returns The user's root node ID string.
   * @throws Error if currentUserId or baseNodeUrl is not set.
   */
  getUserRootNodeId() {
    if (!this.currentUserId) {
      throw new NodeOperationError(
        "Current User ID is not set. Cannot determine root node ID.",
        "unknown",
        // No specific node ID applies here
        500,
        "User ID not available"
      );
    }
    if (!this.config.baseNodeUrl) {
      throw new NodeOperationError(
        "Base Node URL is not configured. Cannot determine root node ID.",
        "unknown",
        500,
        "Base Node URL not available"
      );
    }
    const userRootNodeUrl = `${this.config.baseNodeUrl}g/all/global-root-to-users/all/users-to-user-relation-id-${this.currentUserId}/user-root-id-${this.currentUserId}`;
    console.error(
      "[NodeService] Constructed userRootNodeUrl:",
      userRootNodeUrl
    );
    try {
      return _NodeService.parseUserRootNodeIdFromUrl(userRootNodeUrl);
    } catch (error) {
      console.error(
        "[NodeService] Failed to parse user root node ID from URL:",
        userRootNodeUrl,
        error
      );
      throw new NodeOperationError(
        `Failed to parse user root node ID from URL: ${error instanceof Error ? error.message : String(error)}`,
        "unknown",
        500,
        `URL: ${userRootNodeUrl}`
      );
    }
  }
};

// src/core/start.ts
dotenv.config();
console.error(
  "[Mew MCP] [core/start] Environment variables loaded (content omitted for brevity)."
);
var asyncHandler = (fn) => (req, res, next) => {
  console.error(
    `[Mew MCP] [core/start] Request to ${req.originalUrl} with body:`,
    req.body
  );
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(
      `[Mew MCP] [core/start] Error in asyncHandler for ${req.originalUrl}:`,
      err,
      "Error details:",
      err.stack
    );
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error from asyncHandler",
        details: err.message
      });
    }
  });
};
function startMCP({ port: port2 }) {
  console.error("[Mew MCP] [core/start.ts] startMCP() function: Entered");
  console.error(
    "[Mew MCP] [core/start] Initializing MCP server core function called..."
  );
  console.error("[Mew MCP] [core/start] Initializing MCP server core...");
  const requiredEnvVars = [
    "BASE_URL",
    "BASE_NODE_URL",
    "AUTH0_DOMAIN",
    "AUTH0_CLIENT_ID",
    "AUTH0_CLIENT_SECRET",
    "AUTH0_AUDIENCE",
    "CURRENT_USER_ID"
  ];
  const missingEnvVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );
  if (missingEnvVars.length > 0) {
    console.error(
      "[Mew MCP] [core/start] CRITICAL: Missing required environment variables:",
      missingEnvVars.join(", ")
    );
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(", ")}`
    );
  }
  console.error(
    "[Mew MCP] [core/start] All required environment variables are present."
  );
  const mcpConfigFromEnv = {
    baseUrl: process.env.BASE_URL,
    baseNodeUrl: process.env.BASE_NODE_URL,
    auth0Domain: process.env.AUTH0_DOMAIN,
    auth0ClientId: process.env.AUTH0_CLIENT_ID,
    auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET,
    auth0Audience: process.env.AUTH0_AUDIENCE
  };
  const currentUserIdFromEnv = process.env.CURRENT_USER_ID;
  console.error(
    "[Mew MCP] [core/start.ts] startMCP() function: Initializing NodeService..."
  );
  const nodeService = new NodeService(mcpConfigFromEnv);
  nodeService.setCurrentUserId(currentUserIdFromEnv);
  console.error(
    "[Mew MCP] [core/start.ts] startMCP() function: NodeService initialized."
  );
  console.error(
    `[Mew MCP] [core/start] NodeService initialized and currentUserId set to: ${process.env.CURRENT_USER_ID}`
  );
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => {
    console.error("[Mew MCP] [core/start] Health check endpoint hit.");
    res.status(200).json({
      status: "ok",
      currentUserId: nodeService.getCurrentUser().id
    });
  });
  app.post(
    "/initialize",
    asyncHandler(async (_req, res) => {
      console.error(
        "[Mew MCP] [core/start] /initialize handler: Entered"
      );
      try {
        console.error("[Mew MCP] [core/start] /initialize called.");
        res.json({
          success: true,
          currentUserId: nodeService.getCurrentUser().id
        });
        console.error(
          "[Mew MCP] [core/start] /initialize handler: Successfully processed and response sent."
        );
      } catch (error) {
        console.error(
          "[Mew MCP] [core/start] /initialize handler: CRITICAL ERROR caught:",
          error
        );
        console.error(
          "[Mew MCP] [core/start] /initialize handler: Error message:",
          error.message
        );
        console.error(
          "[Mew MCP] [core/start] /initialize handler: Error stack:",
          error.stack
        );
        if (!res.headersSent) {
          res.status(500).json({
            error: "Critical error during initialize",
            details: error.message
          });
        }
      }
    })
  );
  app.post(
    "/getCurrentUser",
    asyncHandler(async (_req, res) => {
      console.error("[Mew MCP] [core/start] /getCurrentUser called.");
      res.json(nodeService.getCurrentUser());
    })
  );
  app.post(
    "/findNodeByText",
    asyncHandler(async (req, res) => {
      const { parentNodeId, nodeText } = req.body;
      if (typeof parentNodeId !== "string" || typeof nodeText !== "string") {
        res.status(400).json({
          error: "parentNodeId and nodeText must be strings"
        });
        return;
      }
      const result = await nodeService.findNodeByText({
        parentNodeId,
        nodeText
      });
      res.json(result || null);
    })
  );
  app.post(
    "/getChildNodes",
    asyncHandler(async (req, res) => {
      const { parentNodeId } = req.body;
      if (typeof parentNodeId !== "string") {
        res.status(400).json({
          error: "parentNodeId must be a string"
        });
        return;
      }
      const result = await nodeService.getChildNodes({ parentNodeId });
      res.json(result);
    })
  );
  app.post(
    "/getLayerData",
    asyncHandler(async (req, res) => {
      const { objectIds } = req.body;
      if (!Array.isArray(objectIds) || !objectIds.every((id) => typeof id === "string")) {
        res.status(400).json({
          error: "objectIds must be an array of strings"
        });
        return;
      }
      const result = await nodeService.getLayerData(objectIds);
      res.json(result);
    })
  );
  app.post(
    "/updateNode",
    asyncHandler(async (req, res) => {
      const { nodeId, updates } = req.body;
      if (typeof nodeId !== "string" || typeof updates !== "object" || updates === null) {
        res.status(400).json({
          error: "nodeId must be a string and updates must be an object"
        });
        return;
      }
      await nodeService.updateNode(nodeId, updates);
      res.json({ success: true });
    })
  );
  app.post(
    "/deleteNode",
    asyncHandler(async (req, res) => {
      const { nodeId } = req.body;
      if (typeof nodeId !== "string") {
        res.status(400).json({ error: "nodeId must be a string" });
        return;
      }
      await nodeService.deleteNode(nodeId);
      res.json({ success: true });
    })
  );
  app.post(
    "/addNode",
    asyncHandler(async (req, res) => {
      const {
        content,
        parentNodeId,
        relationLabel,
        isChecked,
        authorId
      } = req.body;
      if (typeof content !== "object" || content === null) {
        res.status(400).json({ error: "content must be an object" });
        return;
      }
      const result = await nodeService.addNode({
        content,
        parentNodeId,
        relationLabel,
        isChecked,
        authorId
      });
      res.json(result);
    })
  );
  app.post(
    "/getNodeUrl",
    asyncHandler(async (req, res) => {
      const { nodeId } = req.body;
      if (typeof nodeId !== "string") {
        res.status(400).json({ error: "nodeId must be a string" });
        return;
      }
      const url = nodeService.getNodeUrl(nodeId);
      res.json({ url });
    })
  );
  app.post(
    "/getUserRootNodeId",
    asyncHandler(async (_req, res) => {
      console.error("[Mew MCP] [core/start] /getUserRootNodeId called.");
      try {
        const rootNodeId = nodeService.getUserRootNodeId();
        res.json({ rootNodeId });
      } catch (error) {
        console.error(
          "[Mew MCP] [core/start] Error in /getUserRootNodeId:",
          error.message
        );
        res.status(500).json({
          error: "Failed to get user root node ID",
          details: error.message
        });
      }
    })
  );
  app.use((_req, res) => {
    console.error(
      `[Mew MCP] [core/start] Unhandled route: ${_req.originalUrl}`
    );
    res.status(404).json({ error: "Not Found" });
  });
  app.use((err, _req, res, _next) => {
    console.error("[Mew MCP] [core/start] Unhandled Express error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal Server Error",
        details: err.message
      });
    }
  });
  console.error(
    "[Mew MCP] [core/start.ts] startMCP() function: About to call app.listen()."
  );
  app.listen(port2, () => {
    console.error(
      "[Mew MCP] [core/start.ts] app.listen() callback: Server started successfully on port",
      port2
    );
    console.error(
      `[Mew MCP] [core/start] Server listening on http://localhost:${port2}`
    );
    console.error(
      `Configuration loaded from .env file (or system environment variables).`
    );
    console.error(
      `Current User ID for MCP operations: ${currentUserIdFromEnv}`
    );
    console.error("Available endpoints:");
    console.error("  POST /findNodeByText { parentNodeId, nodeText }");
    console.error("  POST /getChildNodes { parentNodeId }");
    console.error("  POST /getLayerData { objectIds }");
    console.error("  POST /updateNode { nodeId, updates }");
    console.error("  POST /deleteNode { nodeId }");
    console.error(
      "  POST /addNode { content, parentNodeId?, relationLabel?, isChecked?, authorId? }"
    );
    console.error("  POST /getNodeUrl { nodeId }");
    console.error("  POST /getUserRootNodeId");
    console.error("  GET  /health");
  }).on("error", (err) => {
    console.error(
      "[Mew MCP] [core/start.ts] CRITICAL: Express server app.listen() emitted error event."
    );
    console.error(
      "[Mew MCP] [core/start] CRITICAL: Express server failed to start or crashed. Error details:",
      err,
      err.stack
    );
    console.error(
      "[Mew MCP] [core/start.ts] CRITICAL: Error Name:",
      err.name
    );
    console.error(
      "[Mew MCP] [core/start.ts] CRITICAL: Error Message:",
      err.message
    );
    throw err;
  });
  console.error(
    "[Mew MCP] [core/start.ts] startMCP() function: app.listen() called, setup supposedly complete."
  );
  console.error(
    "[Mew MCP] [core/start] MCP server core initialization complete. Waiting for requests..."
  );
  console.error(
    "[Mew MCP] [core/start] MCP server core initialization complete."
  );
}

// src/mcp.ts
console.error("[Mew MCP] [mcp.ts] Script execution started.");
var port = parseInt(process.env.PORT || "8080", 10);
console.error(`[Mew MCP] [mcp.ts] Port configured: ${port}`);
function main() {
  console.error("[Mew MCP] [mcp.ts] main() function: Entered");
  console.error("[Mew MCP] Executing main function...");
  console.error("[Mew MCP] Starting MCP server...");
  try {
    console.error(
      "[Mew MCP] [mcp.ts] main() function: Calling startMCP..."
    );
    startMCP({
      port
      // configPath is no longer passed
    });
    console.error(
      `[Mew MCP] Server init function called, listening on port ${port}`
    );
    console.error(
      "[Mew MCP] [mcp.ts] main() function: startMCP call completed."
    );
  } catch (error) {
    console.error(
      "[Mew MCP] CRITICAL: Failed to start MCP server in main():",
      error
    );
    console.error("[Mew MCP] CRITICAL: Error Name:", error.name);
    console.error("[Mew MCP] CRITICAL: Error Message:", error.message);
    console.error("[Mew MCP] CRITICAL: Error Stack:", error.stack);
    process.exit(1);
  }
}
console.error("[Mew MCP] [mcp.ts] Calling main()...");
try {
  main();
  console.error(
    "[Mew MCP] [mcp.ts] main() call completed successfully (synchronous part)."
  );
} catch (e) {
  console.error(
    "[Mew MCP] [mcp.ts] CRITICAL SYNCHRONOUS ERROR IN MAIN EXECUTION:",
    e
  );
  if (e instanceof Error) {
    console.error("[Mew MCP] [mcp.ts] Main Exec Error Name:", e.name);
    console.error("[Mew MCP] [mcp.ts] Main Exec Error Message:", e.message);
    console.error("[Mew MCP] [mcp.ts] Main Exec Error Stack:", e.stack);
  }
  process.exit(1);
}
console.error("[Mew MCP] [mcp.ts] main() call completed (after try-catch).");
process.on("uncaughtException", (error) => {
  console.error("[Mew MCP] [mcp.ts] uncaughtException HANDLER ENTERED.");
  console.error("[Mew MCP] [mcp.ts] Uncaught Exception object:", error);
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "N/A";
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "N/A";
  const stack = error && typeof error === "object" && "stack" in error ? String(error.stack) : "N/A";
  console.error(
    `[Mew MCP] [mcp.ts] Uncaught Exception Details: Name: ${name}, Message: ${message}`
  );
  console.error("[Mew MCP] [mcp.ts] Uncaught Exception Stack:", stack);
  process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Mew MCP] [mcp.ts] unhandledRejection HANDLER ENTERED.");
  console.error("[Mew MCP] [mcp.ts] Unhandled Rejection Reason:", reason);
  console.error("[Mew MCP] [mcp.ts] Unhandled Rejection Promise:", promise);
  if (reason instanceof Error) {
    console.error(
      "[Mew MCP] [mcp.ts] Unhandled Rejection Reason Stack:",
      reason.stack
    );
  } else {
    console.error(
      "[Mew MCP] [mcp.ts] Unhandled Rejection Reason (not an Error instance):",
      String(reason)
    );
  }
  process.exit(1);
});
