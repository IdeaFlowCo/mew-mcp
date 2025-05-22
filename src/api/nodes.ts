import fetch from "node-fetch";
import {
    MCPConfig,
    GraphNode,
    NodeContent,
    NodeContentType,
    Relation,
} from "../types/node.js";
import {
    NodeOperationError,
    InvalidUserIdFormatError,
} from "../types/errors.js";
import { createNodeContent, uuid } from "../utils/content.js";
import { RequestQueue } from "../utils/queue.js";
import { AuthService } from "./auth.js";

/**
 * Handles operations related to Mew nodes.
 */

export class NodeService extends AuthService {
    private requestQueue: RequestQueue;
    protected config: MCPConfig;
    private currentUserId: string = "";

    constructor(config: MCPConfig) {
        super(config);
        this.config = config;
        this.requestQueue = new RequestQueue(10, 100, 50); // 10 batch size, 100ms max delay, 50 req/s rate limit
        if (!config.userRootNodeId) {
            throw new Error(
                "[NodeService] userRootNodeId is not provided in the configuration."
            );
        }
    }

    /**
     * Sets the User ID for the current session.
     * @param userId The Mew User ID. Must include an auth provider prefix (e.g., "auth0|..." or "google-oauth2|...").
     * @throws {InvalidUserIdFormatError} If the userId format is invalid.
     */
    setCurrentUserId(userId: string): void {
        if (!userId || !userId.includes("|")) {
            throw new InvalidUserIdFormatError(userId);
        }
        this.currentUserId = userId;
        console.error(
            `[NodeService] Current User ID set to: ${this.currentUserId}`
        ); // Clearer log to stderr
    }

    /**
     * Gets the currently set User ID.
     * @returns An object containing the current user ID
     */
    getCurrentUser(): { id: string } {
        return { id: this.currentUserId };
    }

    /**
     * Gets the configured User Root Node ID.
     * @returns The user root node ID from the configuration.
     */
    getCurrentUserRootNodeId(): string {
        return this.config.userRootNodeId;
    }

    /**
     * Finds the first child node under a given parent that has an exact text match.
     * @param params Object containing parentNodeId and nodeText to search for
     * @returns The matching GraphNode or undefined if not found
     */
    async findNodeByText({
        parentNodeId,
        nodeText,
    }: {
        parentNodeId: string;
        nodeText: string;
    }): Promise<GraphNode | undefined> {
        const { childNodes } = await this.getChildNodes({ parentNodeId });
        return childNodes.find(
            (node) =>
                node &&
                node.content &&
                node.content.length > 0 &&
                node.content[0].value === nodeText
        );
    }

    /**
     * Retrieves the direct child nodes of a given parent node with hierarchy metadata.
     * @param params Object containing parentNodeId
     * @returns An object containing the parent node data and an array of its direct child nodes with exploration metadata
     */
    async getChildNodes({
        parentNodeId,
    }: {
        parentNodeId: string;
    }): Promise<{ 
        parentNode: GraphNode; 
        childNodes: Array<GraphNode & {
            hasChildren: boolean;
            childCount: number;
            explorationRecommended: boolean;
        }>;
    }> {
        const layerData = await this.getLayerData([parentNodeId]);
        const parentNode = layerData.data.nodesById[parentNodeId];

        const childRelations = Object.values(
            layerData.data.relationsById
        ).filter(
            (relation): relation is Relation =>
                relation !== null &&
                typeof relation === "object" &&
                "fromId" in relation &&
                "toId" in relation &&
                "relationTypeId" in relation &&
                relation.fromId === parentNodeId &&
                relation.relationTypeId === "child"
        );

        const childNodes = childRelations.map((relation) => {
            const nodeData = layerData.data.nodesById[relation.toId];
            return nodeData;
        }).filter(node => node && node.id); // Filter out undefined nodes

        // If we have child nodes, fetch their child counts in bulk
        if (childNodes.length > 0) {
            const childNodeIds = childNodes.map(node => node.id);
            const childLayerData = await this.getLayerData(childNodeIds);
            
            // Count children for each child node by parsing relationships
            const childCounts = new Map<string, number>();
            
            Object.values(childLayerData.data.relationsById || {}).forEach((relation: any) => {
                if (relation && 
                    relation.relationTypeId === "child" && 
                    relation.fromId && 
                    relation.toId &&
                    childNodeIds.includes(relation.fromId)) {
                    
                    const currentCount = childCounts.get(relation.fromId) || 0;
                    childCounts.set(relation.fromId, currentCount + 1);
                }
            });

            // Build enhanced child nodes with metadata
            const enhancedChildNodes = childNodes.map(node => {
                const childCount = childCounts.get(node.id) || 0;
                
                return {
                    ...node,
                    hasChildren: childCount > 0,
                    childCount: childCount,
                    explorationRecommended: childCount > 0
                };
            });

            return {
                parentNode,
                childNodes: enhancedChildNodes,
            };
        }

        // No children case - return empty array with metadata structure
        return {
            parentNode,
            childNodes: [],
        };
    }

    /**
     * Fetches detailed data for a list of specified object IDs.
     * @param objectIds An array of node or relation IDs
     * @returns The layer data payload containing details about the requested objects
     */
    async getLayerData(objectIds: string[]): Promise<any> {
        return this.requestQueue.enqueue(async () => {
            const token = await this.getAccessToken();
            const response = await fetch(`${this.config.baseUrl}/layer`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ objectIds }),
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
    async updateNode(
        nodeId: string,
        updates: Partial<GraphNode>
    ): Promise<void> {
        const startTime = Date.now();
        try {
            const token = await this.getAccessToken();
            const transactionId = uuid();
            const timestamp = Date.now();
            const authorId = this.currentUserId;

            const layerData = await this.getLayerData([nodeId]);
            const existingNode = layerData.data.nodesById[nodeId] as GraphNode;

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
                    updatedAt: existingNode.updatedAt,
                },
                newProps: {
                    ...existingNode,
                    ...updates,
                    content: updates.content
                        ? createNodeContent(updates.content)
                        : createNodeContent(existingNode.content),
                    id: nodeId,
                    authorId: existingNode.authorId,
                    createdAt: existingNode.createdAt,
                    updatedAt: new Date(timestamp).toISOString(),
                },
            };

            const payload = {
                clientId: this.config.auth0ClientId,
                userId: authorId,
                transactionId: transactionId,
                updates: [updatePayload],
            };

            await this.requestQueue.enqueue(async () => {
                const response = await fetch(`${this.config.baseUrl}/sync`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
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
                error: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }

    /**
     * Deletes a Mew node.
     * @param nodeId The ID of the node to delete
     */
    async deleteNode(nodeId: string): Promise<void> {
        const token = await this.getAccessToken();
        const transactionId = uuid();
        const authorId = this.currentUserId;

        const layerData = await this.getLayerData([nodeId]);
        const existingNode = layerData.data.nodesById[nodeId] as GraphNode;

        if (!existingNode) {
            console.warn(
                `[NodeService] Node with ID ${nodeId} not found for deletion. Skipping.`
            );
            return;
        }

        const deletePayload = {
            operation: "deleteNode",
            node: {
                id: nodeId,
            },
        };

        const payload = {
            clientId: this.config.auth0ClientId,
            userId: authorId,
            transactionId: transactionId,
            updates: [deletePayload],
        };

        await this.requestQueue.enqueue(async () => {
            const response = await fetch(`${this.config.baseUrl}/sync`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
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
    async addNode(input: {
        content: NodeContent;
        parentNodeId?: string;
        relationLabel?: string;
        isChecked?: boolean;
        authorId?: string;
    }): Promise<{
        newNodeId: string;
        newRelationLabelNodeId: string;
        parentChildRelationId: string;
        referenceNodeId: string;
        referenceCanonicalRelationId: string;
        isChecked?: boolean;
    }> {
        // Log entry into addNode with full input
        console.error(
            `[NodeService] addNode called with input: ${JSON.stringify(input)}`
        );
        const { content, parentNodeId, relationLabel, isChecked, authorId } =
            input;
        const nodeContent = createNodeContent(content);
        const usedAuthorId = authorId ?? this.currentUserId;
        const newNodeId = uuid();
        const parentChildRelationId = uuid();
        const transactionId = uuid();
        const timestamp = Date.now();
        let relationLabelNodeId = "";

        const updates: any[] = [];

        // Add the new node
        updates.push({
            operation: "addNode",
            node: {
                version: 1,
                id: newNodeId,
                authorId: usedAuthorId,
                createdAt: new Date(timestamp).toISOString(), // Using ISO string for z.coerce.date()
                updatedAt: new Date(timestamp).toISOString(), // Using ISO string for z.coerce.date()
                content: nodeContent,
                isPublic: true, // Default in schema is false, but example sends true
                isNewRelatedObjectsPublic: false, // Default in schema is false, example sends false
                canonicalRelationId: parentNodeId
                    ? parentChildRelationId
                    : null, // Matches schema default
                isChecked: isChecked ?? null, // Matches schema default
                accessMode: 0, // Added, default from schema
                attributes: {}, // Added, default from schema (empty object for optional sub-fields)
                // relationId is still omitted as it's not in SerializedNodeSchema and not in example's addNode node object
            },
        });

        // Add parent-child relation if parent is provided
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
                    canonicalRelationId: null,
                },
                fromPos: { int: timestamp, frac: "a0" },
                toPos: { int: timestamp, frac: "a0" },
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
                relatedNodeId: newNodeId,
            });
        }

        // Add relation label if provided
        if (relationLabel) {
            relationLabelNodeId = uuid();
            updates.push({
                operation: "addNode",
                node: {
                    version: 1,
                    id: relationLabelNodeId,
                    authorId: usedAuthorId,
                    createdAt: new Date(timestamp).toISOString(), // Using ISO string
                    updatedAt: new Date(timestamp).toISOString(), // Using ISO string
                    content: [
                        { type: "text", value: relationLabel, styles: 0 }, // styles:0 is fine as per SerializedChipSchema
                    ],
                    isPublic: true,
                    isNewRelatedObjectsPublic: false,
                    canonicalRelationId: null,
                    isChecked: null,
                    accessMode: 0, // Added
                    attributes: {}, // Added
                },
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
                    canonicalRelationId: null,
                },
                fromPos: { int: timestamp, frac: "a0" },
                toPos: { int: timestamp, frac: "a0" },
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
                relatedNodeId: relationLabelNodeId,
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
                    canonicalRelationId: null,
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
                    canonicalRelationId: newRelationTypeId,
                },
            });
        }

        // Handle replacement type content
        if (
            content.type === NodeContentType.Replacement &&
            content.replacementNodeData
        ) {
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
                    canonicalRelationId: null,
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
                    canonicalRelationId:
                        content.replacementNodeData
                            .referenceCanonicalRelationId,
                },
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
                relatedNodeId: content.replacementNodeData.referenceNodeId,
            });
        }

        const token = await this.getAccessToken();
        const payload = {
            clientId: this.config.auth0ClientId,
            userId: usedAuthorId, // This is the authorId for the transaction
            transactionId: transactionId,
            updates: updates,
        };

        // Detailed logging of payload and computed identifiers
        const effectiveParentNodeId =
            parentNodeId ?? this.config.userRootNodeId; // Determine the parent ID being used
        console.error(
            "[NodeService] Attempting to add node via /sync with payload (raw):",
            payload
        );
        console.error(
            `[NodeService] addNode Details: newNodeId: ${newNodeId}, effectiveParentNodeId: ${effectiveParentNodeId}, usedAuthorId: ${usedAuthorId} (this is the author of the node & transaction). Node content type: ${content.type}`
        );
        console.error(
            `[NodeService] Target Parent Node for new node '${newNodeId}': ${effectiveParentNodeId}. Configured User Root Node ID is: ${this.config.userRootNodeId}. Specified parentNodeId in call was: ${parentNodeId || "not specified (will use default)"}.`
        );
        console.error(
            `[NodeService] Generated URL for new node (if successful) would be: ${this.getNodeUrl(newNodeId)}`
        );

        await this.requestQueue.enqueue(async () => {
            const response = await fetch(`${this.config.baseUrl}/sync`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
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
            referenceNodeId:
                content.type === NodeContentType.Replacement &&
                content.replacementNodeData
                    ? content.replacementNodeData.referenceNodeId
                    : "",
            referenceCanonicalRelationId:
                content.type === NodeContentType.Replacement &&
                content.replacementNodeData
                    ? content.replacementNodeData.referenceCanonicalRelationId
                    : "",
            isChecked: isChecked ?? undefined,
        };
    }

    /**
     * Constructs the web URL for a given Mew node ID.
     * @param nodeId The Mew Node ID
     * @returns The full URL to view the node in the Mew web interface
     */
    getNodeUrl(nodeId: string): string {
        if (!this.currentUserId) {
            console.warn(
                "[NodeService] getNodeUrl called before currentUserId is set. URL might be incorrect."
            );
            return `${this.config.baseNodeUrl}g/all/global-root-to-users/all/users-to-user-relation-id-unknown/user-root-id-unknown`;
        }
        return `${this.config.baseNodeUrl}g/all/global-root-to-users/all/users-to-user-relation-id-${encodeURIComponent(this.currentUserId)}/user-root-id-${encodeURIComponent(this.config.userRootNodeId)}/node-${encodeURIComponent(nodeId)}`;
    }

    /**
     * Parses the node ID from a Mew node URL.
     * @param url The Mew node URL.
     * @returns The extracted node ID.
     * @throws Error if the URL format is invalid or nodeId is not found.
     */
    static parseNodeIdFromUrl(url: string): string {
        // Example URL: https://mew-edge.ideaflow.app/g/all/global-root-to-users/all/users-to-user-relation-id-auth0%7Cxxx/user-root-id-auth0%7Cxxx/node-nodeId123
        const regex = /\/node-([^\/]+)$/; // Matches '/node-' followed by any characters until the end of the string or a slash
        const match = url.match(regex);

        if (match && match[1]) {
            // The nodeId is in the first capturing group
            let decodedNodeId = match[1];
            try {
                // Decode URI component to handle any special characters in the nodeId
                decodedNodeId = decodeURIComponent(decodedNodeId);
            } catch (e) {
                console.error(
                    "[NodeService] Error decoding node ID from URL part:",
                    match[1],
                    e
                );
                // Fallback to using the raw match if decoding fails, or re-throw
                // For now, we'll use the raw match as a best effort.
            }
            // Additional safety for pipe characters if they were not handled by decodeURIComponent
            decodedNodeId = decodedNodeId.replace(/%7C/gi, "|");
            return decodedNodeId;
        } else {
            console.error(
                "[NodeService] Invalid node URL format or nodeId not found in URL:",
                url
            );
            throw new Error(
                "Invalid node URL format or nodeId not found in URL."
            );
        }
    }
}
