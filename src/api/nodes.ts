import fetch from "node-fetch";
import {
    MCPConfig,
    GraphNode,
    NodeContent,
    NodeContentType,
    Relation,
} from "../types/node.js";
import { NodeOperationError } from "../types/errors.js";
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
    }

    /**
     * Sets the User ID for the current session.
     * @param userId The Mew User ID
     */
    setCurrentUserId(userId: string): void {
        this.currentUserId = userId;
    }

    /**
     * Gets the currently set User ID.
     * @returns An object containing the current user ID
     */
    getCurrentUser(): { id: string } {
        return { id: this.currentUserId };
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
     * Retrieves the direct child nodes of a given parent node.
     * @param params Object containing parentNodeId
     * @returns An object containing the parent node data and an array of its direct child nodes
     */
    async getChildNodes({
        parentNodeId,
    }: {
        parentNodeId: string;
    }): Promise<{ parentNode: GraphNode; childNodes: GraphNode[] }> {
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
        });

        return {
            parentNode,
            childNodes,
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
            userId: usedAuthorId, // Removed prefix, using raw usedAuthorId
            transactionId: transactionId,
            updates: updates,
        };

        console.error(
            "[NodeService] addNode /sync payload:",
            JSON.stringify(payload, null, 2)
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
        return `${this.config.baseNodeUrl}g/all/global-root-to-users/all/users-to-user-relation-id-${encodeURIComponent(this.currentUserId)}/user-root-id-${encodeURIComponent(this.currentUserId)}/node-${encodeURIComponent(nodeId)}`;
    }

    /**
     * Parses the user root node ID from a specially formatted URL.
     * @param url The user root node URL.
     * @returns The extracted user root node ID.
     * @throws Error if the URL format is invalid.
     */
    private static parseUserRootNodeIdFromUrl(url: string): string {
        // This regex is specific to the known structure of user root node URLs.
        // It expects a format like: https://<base>/g/all/global-root-to-users/all/users-to-user-relation-id-<auth0_id>/user-root-id-<auth0_id>
        const regex = /users-to-user-relation-id-[^\/]+\/user-root-id-[^\/]+$/;
        if (!regex.test(url)) {
            console.error(
                "[NodeService] Invalid user root node URL format for parsing:",
                url
            );
            throw new Error("Invalid user root node URL format for parsing.");
        }
        const urlParts = url.split("/");
        const lastPart = urlParts[urlParts.length - 1]; // Should be "user-root-id-..."

        // The user ID (e.g., auth0|xxxx) can contain '|', which gets URL encoded.
        // We need to decode it properly.
        // Example lastPart: user-root-id-auth0%7C67b00414a18956f5273397da

        let decoded = lastPart;
        try {
            // Full URL decode handles %7C and other potential encodings.
            decoded = decodeURIComponent(lastPart);
        } catch (e) {
            console.error(
                "[NodeService] Error decoding URL part:",
                lastPart,
                e
            );
            // Fallback or re-throw if critical, for now, proceed with potentially partially decoded.
        }

        // Ensure any literal '%7C' or '%7c' that might not have been caught by decodeURIComponent
        // (e.g. if it was double encoded or if decodeURIComponent had issues) are replaced.
        // This is more of a safeguard.
        decoded = decoded.replace(/%7C/gi, "|");

        return decoded;
    }

    /**
     * Gets the current user's root node ID by querying the relation from global root.
     * @returns A promise that resolves to the user's root node ID.
     * @throws NodeOperationError if currentUserId, baseNodeUrl, or relation data is not available.
     */
    async getUserRootNodeId(): Promise<string> {
        if (!this.currentUserId) {
            throw new NodeOperationError(
                "Current User ID is not set. Cannot determine root node ID.",
                "unknown",
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

        // Determine the relation ID for the user's root node under the global root.
        const encodedUserId = encodeURIComponent(this.currentUserId);
        const relationId = `users-to-user-relation-id-${encodedUserId}`;
        // Fetch the relation object from the API
        const layerData = await this.getLayerData([relationId]);
        const relation = layerData.data.relationsById[relationId] as
            | Relation
            | undefined;
        if (!relation || !relation.toId) {
            throw new NodeOperationError(
                `Failed to fetch user root node ID: missing or invalid relation '${relationId}'.`,
                relationId,
                404,
                JSON.stringify(layerData)
            );
        }
        // The toId of this relation is the actual user root node ID in the graph
        return relation.toId;
    }
}
