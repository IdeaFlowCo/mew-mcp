import { MCPConfig, GraphNode, NodeContent } from "../types/node.js";
import { AuthService } from "./auth.js";
/**
 * Handles operations related to Mew nodes.
 */
export declare class NodeService extends AuthService {
    private requestQueue;
    protected config: MCPConfig;
    private currentUserId;
    constructor(config: MCPConfig);
    /**
     * Sets the User ID for the current session.
     * @param userId The Mew User ID
     */
    setCurrentUserId(userId: string): void;
    /**
     * Gets the currently set User ID.
     * @returns An object containing the current user ID
     */
    getCurrentUser(): {
        id: string;
    };
    /**
     * Finds the first child node under a given parent that has an exact text match.
     * @param params Object containing parentNodeId and nodeText to search for
     * @returns The matching GraphNode or undefined if not found
     */
    findNodeByText({ parentNodeId, nodeText, }: {
        parentNodeId: string;
        nodeText: string;
    }): Promise<GraphNode | undefined>;
    /**
     * Retrieves the direct child nodes of a given parent node.
     * @param params Object containing parentNodeId
     * @returns An object containing the parent node data and an array of its direct child nodes
     */
    getChildNodes({ parentNodeId, }: {
        parentNodeId: string;
    }): Promise<{
        parentNode: GraphNode;
        childNodes: GraphNode[];
    }>;
    /**
     * Fetches detailed data for a list of specified object IDs.
     * @param objectIds An array of node or relation IDs
     * @returns The layer data payload containing details about the requested objects
     */
    getLayerData(objectIds: string[]): Promise<any>;
    /**
     * Updates an existing Mew node with the provided partial data.
     * @param nodeId The ID of the node to update
     * @param updates An object containing the properties to update
     */
    updateNode(nodeId: string, updates: Partial<GraphNode>): Promise<void>;
    /**
     * Deletes a Mew node.
     * @param nodeId The ID of the node to delete
     */
    deleteNode(nodeId: string): Promise<void>;
    /**
     * Adds a single Mew node.
     * @param input Object containing node details
     * @returns An object containing IDs of the created node and relations
     */
    addNode(input: {
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
    }>;
    /**
     * Constructs the web URL for a given Mew node ID.
     * @param nodeId The Mew Node ID
     * @returns The full URL to view the node in the Mew web interface
     */
    getNodeUrl(nodeId: string): string;
}
