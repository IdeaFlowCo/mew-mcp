#!/usr/bin/env node

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

console.error(`[Mew MCP] [mcp.ts] Running version: ${packageJson.version}`); // Log version
console.error("[Mew MCP] [mcp.ts] Script execution started."); // DEBUG

import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NodeService } from "./api/nodes.js";
import {
    InvalidUserIdFormatError,
    NodeOperationError,
} from "./types/errors.js";
import { NodeContentType, type MCPConfig } from "./types/node.js";

// Load environment variables
dotenv.config();
console.error("[Mew MCP] [mcp.ts] Environment variables loaded");

// Cache for the user's root node ID
// let cachedUserRootNodeId: string | null = null; // Removed, no longer needed

const requiredEnvVars = [
    "BASE_URL",
    "BASE_NODE_URL",
    "AUTH0_DOMAIN",
    "AUTH0_CLIENT_ID",
    "AUTH0_CLIENT_SECRET",
    "AUTH0_AUDIENCE",
    "CURRENT_USER_ID",
];
const missing = requiredEnvVars.filter((v) => !process.env[v]);
if (missing.length) {
    console.error(
        "[Mew MCP] [mcp.ts] Missing environment variables:",
        missing.join(", ")
    );
    process.exit(1);
}

const mcpConfig: MCPConfig = {
    baseUrl: process.env.BASE_URL!,
    baseNodeUrl: process.env.BASE_NODE_URL!,
    auth0Domain: process.env.AUTH0_DOMAIN!,
    auth0ClientId: process.env.AUTH0_CLIENT_ID!,
    auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET!,
    auth0Audience: process.env.AUTH0_AUDIENCE!,
    userRootNodeId: "user-root-id-" + process.env.CURRENT_USER_ID!,
};
const currentUserId = process.env.CURRENT_USER_ID!;

const nodeService = new NodeService(mcpConfig);

try {
    nodeService.setCurrentUserId(currentUserId);
} catch (error: any) {
    if (error instanceof InvalidUserIdFormatError) {
        console.error(
            `[Mew MCP] [mcp.ts] CRITICAL STARTUP ERROR: ${error.message}`
        );
        console.error(
            "[Mew MCP] [mcp.ts] Please ensure the CURRENT_USER_ID environment variable is correctly set with an auth provider prefix (e.g., 'auth0|xxx' or 'google-oauth2|yyy')."
        );
        process.exit(1);
    } else {
        // For any other unexpected errors during setCurrentUserId
        console.error(
            "[Mew MCP] [mcp.ts] CRITICAL STARTUP ERROR: Unexpected error setting user ID:",
            error
        );
        process.exit(1);
    }
}

// Log configured IDs for debugging
console.error(
    `[Mew MCP] [mcp.ts] Configured userRootNodeId: ${mcpConfig.userRootNodeId}`
);
console.error(`[Mew MCP] [mcp.ts] currentUserId: ${currentUserId}`);

// Create the MCP server
const server = new McpServer({ 
    name: "mew-mcp", 
    version: "1.1.17",
    description: "Mew Knowledge Base - We're creating an ecosystem for humans and machines to work together through a unified tree-structured knowledge graph. Each node can have children, creating hierarchical thought structures. Key collections under user root: My Stream (quick capture repository for loose thoughts that may need sorting into other places, like an infinitely long text file), My Templates (reusable structures), My Favorites (references), My Highlights (content clipped from across the web), My Hashtags (user's tags for organizing related notes). Use respondInMew to add insights directly into the knowledge tree - this creates searchable, linkable knowledge that persists and connects, unlike ephemeral chat responses."
});

// Tools
server.tool("getCurrentUser", {}, async () => ({
    content: [
        { type: "text", text: JSON.stringify(nodeService.getCurrentUser()) },
    ],
}));

server.tool("getUserNotesRootId", {}, async () => ({
    content: [
        {
            type: "text",
            text: JSON.stringify({
                rootNodeId: nodeService.getCurrentUserRootNodeId(),
            }),
        },
    ],
}));

server.tool(
    "findNodeByText",
    { 
        parentNodeId: z.string().describe("The ID of the parent node to search within"), 
        nodeText: z.string().describe("The exact text to search for")
    },
    {
        description: "Find a child node with exact text match under a parent. The found node may have its own children that are only visible via getChildNodes calls."
    },
    async ({ parentNodeId, nodeText }) => {
        const result = await nodeService.findNodeByText({
            parentNodeId,
            nodeText,
        });
        return {
            content: [{ type: "text", text: JSON.stringify(result || null) }],
        };
    }
);

server.tool(
    "getChildNodes",
    { 
        parentNodeId: z.string().describe("The ID of the parent node to get children for")
    },
    {
        description: "Get direct child nodes of a parent node with hierarchy metadata. Each child includes hasChildren and childCount to help you understand which nodes have deeper structure. Use this to efficiently navigate the knowledge base hierarchy."
    },
    async ({ parentNodeId }) => {
        const result = await nodeService.getChildNodes({ parentNodeId });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
);


server.tool(
    "updateNode",
    { nodeId: z.string(), updates: z.record(z.any()) },
    async ({ nodeId, updates }) => {
        await nodeService.updateNode(nodeId, updates);
        return {
            content: [
                { type: "text", text: JSON.stringify({ success: true }) },
            ],
        };
    }
);

server.tool("deleteNode", { nodeId: z.string() }, async ({ nodeId }) => {
    await nodeService.deleteNode(nodeId);
    return {
        content: [{ type: "text", text: JSON.stringify({ success: true }) }],
    };
});

server.tool(
    "addNode",
    {
        content: z.record(z.any()),
        parentNodeId: z.string().optional(),
        relationLabel: z.string().optional(),
        isChecked: z.boolean().optional(),
        authorId: z.string().optional(),
    },
    async (params) => {
        const { content, parentNodeId, relationLabel, isChecked, authorId } =
            params;
        // Log raw incoming parameters for addNode
        console.error(
            `[Mew MCP] [addNode] Incoming params: ${JSON.stringify(params)}`
        );
        let effectiveParentNodeId = parentNodeId;

        if (!effectiveParentNodeId) {
            console.error(
                "[Mew MCP] [addNode] parentNodeId not provided by client. Using currentUserId as root node."
            );
            try {
                effectiveParentNodeId = nodeService.getCurrentUserRootNodeId();

                if (!effectiveParentNodeId) {
                    console.error(
                        "[Mew MCP] [addNode] CRITICAL: Configured user root node ID is unexpectedly missing or empty from nodeService.getCurrentUserRootNodeId()."
                    );
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    error: "Failed to determine user root node ID from configuration. It seems to be empty or null.",
                                }),
                            },
                        ],
                        isError: true,
                    };
                }
                console.error(
                    `[Mew MCP] [addNode] Using currentUserId as root node ID: ${effectiveParentNodeId}`
                );
            } catch (error: any) {
                console.error(
                    "[Mew MCP] [addNode] Error calling nodeService.getCurrentUserRootNodeId():",
                    error.message || error
                );
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: "Error obtaining user root node ID from configuration via nodeService.getCurrentUserRootNodeId().",
                                details: error.message,
                            }),
                        },
                    ],
                    isError: true,
                };
            }
        }

        if (!effectiveParentNodeId) {
            console.error(
                "[Mew MCP] [addNode] CRITICAL: effectiveParentNodeId could not be determined (either not provided or failed to retrieve from config). Cannot add node."
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: "Failed to establish a parent node ID for the new node. Parent ID was not provided and could not be retrieved from configuration.",
                        }),
                    },
                ],
                isError: true,
            };
        }

        console.error(
            `[Mew MCP] [addNode] Proceeding to call nodeService.addNode with effectiveParentNodeId: ${effectiveParentNodeId}, authorId: ${authorId ?? "default (currentUserId)"}`
        );

        try {
            // Pass content directly if it matches NodeContent, otherwise wrap it if it's just text like in the log example
            const nodeContentForService =
                typeof content.text === "string" &&
                Object.keys(content).length === 1
                    ? { type: NodeContentType.Text, text: content.text }
                    : (content as any); // Cast if `content` is already expected to be NodeContent

            const result = await nodeService.addNode({
                content: nodeContentForService,
                parentNodeId: effectiveParentNodeId,
                relationLabel,
                isChecked,
                authorId, // Pass along authorId if provided, NodeService will default to currentUserId if undefined
            });
            return {
                content: [{ type: "text", text: JSON.stringify(result) }],
            };
        } catch (error: any) {
            console.error(
                "[Mew MCP] [addNode] Error during nodeService.addNode call:",
                error.message || error,
                error.stack
            );
            const errorDetails =
                error instanceof NodeOperationError
                    ? error.details
                    : error.message || "Unknown error";
            const errorStatus =
                error instanceof NodeOperationError ? error.status : 500;
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: `Failed to add node: ${error.message}`,
                            details: errorDetails,
                            status: errorStatus,
                            nodeIdAttempted:
                                error instanceof NodeOperationError &&
                                error.nodeId
                                    ? error.nodeId
                                    : undefined,
                        }),
                    },
                ],
                isError: true,
            };
        }
    }
);

server.tool("getNodeUrl", { nodeId: z.string() }, async ({ nodeId }) => {
    const url = nodeService.getNodeUrl(nodeId);
    return { content: [{ type: "text", text: JSON.stringify({ url }) }] };
});

server.tool(
    "respondInMew",
    {
        noteNodeId: z.string().describe("The ID of the note you're responding to in the knowledge base"),
        responseText: z.string().describe("Your response to save directly in the user's knowledge base. Use this as your primary response method when analyzing notes - it preserves context and creates permanent value in their Mew system."),
        relationLabel: z.string().optional().describe("Optional label for the relationship (defaults to 'response')"),
    },
    async ({ noteNodeId, responseText, relationLabel }) => {
        try {
            const result = await nodeService.addNode({
                content: { type: NodeContentType.Text, text: responseText },
                parentNodeId: noteNodeId,
                relationLabel: relationLabel || "response",
            });
            
            // Generate URL for the created response
            const responseUrl = nodeService.getNodeUrl(result.newNodeId);
            
            return {
                content: [{ 
                    type: "text", 
                    text: JSON.stringify({
                        ...result,
                        responseUrl,
                        message: "Response permanently added to the note in your knowledge base. Consider sharing the responseUrl with the user so they can view it directly in Mew."
                    })
                }],
            };
        } catch (error: any) {
            console.error(
                "[Mew MCP] [respondInMew] Error creating response:",
                error.message || error
            );
            const errorDetails =
                error instanceof NodeOperationError
                    ? error.details
                    : error.message || "Unknown error";
            const errorStatus =
                error instanceof NodeOperationError ? error.status : 500;
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: `Failed to add response to note: ${error.message}`,
                            details: errorDetails,
                            status: errorStatus,
                        }),
                    },
                ],
                isError: true,
            };
        }
    }
);

server.tool(
    "getUserNotes", 
    {}, 
    {
        description: "Get all top-level notes from the user's knowledge base. Each note may have children (sub-notes, responses, etc.) that are only visible via additional getChildNodes calls. Consider exploring interesting notes deeper before responding."
    },
    async () => {
    try {
        const rootId = nodeService.getCurrentUserRootNodeId();
        const { childNodes } = await nodeService.getChildNodes({ parentNodeId: rootId });
        
        const validNodes = childNodes.filter(node => node && node.id);
        
        if (validNodes.length === 0) {
            return {
                content: [{ 
                    type: "text", 
                    text: JSON.stringify({
                        rootNodeId: rootId,
                        notes: [],
                        totalCount: 0,
                        message: "No notes found in your knowledge base."
                    })
                }],
            };
        }
        
        // Bulk fetch all node data and their relationships in one call
        const allNodeIds = validNodes.map(node => node.id);
        const layerData = await nodeService.getLayerData(allNodeIds);
        
        // Count children for each node by parsing relationships
        const childCounts = new Map<string, number>();
        
        // Iterate through all relations to count children
        Object.values(layerData.data.relationsById || {}).forEach((relation: any) => {
            if (relation && 
                relation.relationTypeId === "child" && 
                relation.fromId && 
                relation.toId &&
                allNodeIds.includes(relation.fromId)) {
                
                const currentCount = childCounts.get(relation.fromId) || 0;
                childCounts.set(relation.fromId, currentCount + 1);
            }
        });
        
        // Build enhanced notes with child metadata
        const notesWithMetadata = validNodes.map(node => {
            const childCount = childCounts.get(node.id) || 0;
            
            return {
                id: node.id,
                text: node?.content?.[0]?.value || 'No text content',
                createdAt: node.createdAt,
                updatedAt: node.updatedAt,
                hasChildren: childCount > 0,
                childCount: childCount,
                explorationRecommended: childCount > 0
            };
        });
        
        return {
            content: [{ 
                type: "text", 
                text: JSON.stringify({
                    rootNodeId: rootId,
                    notes: notesWithMetadata,
                    totalCount: notesWithMetadata.length,
                    message: "Each note may have children (sub-notes, responses, etc.). Use getChildNodes to explore notes with hasChildren=true before responding."
                })
            }],
        };
    } catch (error: any) {
        console.error(
            "[Mew MCP] [getUserNotes] Error:",
            error.message || error
        );
        const errorDetails =
            error instanceof NodeOperationError
                ? error.details
                : error.message || "Unknown error";
        const errorStatus =
            error instanceof NodeOperationError ? error.status : 500;
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        error: `Failed to get user notes: ${error.message}`,
                        details: errorDetails,
                        status: errorStatus,
                    }),
                },
            ],
            isError: true,
        };
    }
});

// Start stdio transport
const transport = new StdioServerTransport();
console.error("[Mew MCP] [mcp.ts] Connecting stdio transport...");
server.connect(transport).catch((err) => {
    console.error("[Mew MCP] [mcp.ts] Transport error:", err);
    process.exit(1);
});

// Global error handlers
process.on("uncaughtException", (e) => {
    console.error("[Mew MCP] uncaughtException:", e);
    process.exit(1);
});
process.on("unhandledRejection", (r) => {
    console.error("[Mew MCP] unhandledRejection:", r);
    process.exit(1);
});
