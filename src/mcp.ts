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
const server = new McpServer({ name: "mew-mcp", version: "1.0.1" });

// Tools
server.tool(
    "getCurrentUser",
    {
        description:
            "Retrieves the authentication ID of the current user. This is typically used for associating actions with a user account or for API authorization, not directly as a graph node ID.",
        inputSchema: z.object({}),
        outputSchema: z.object({ id: z.string() }),
    },
    async () => ({
        content: [
            {
                type: "text",
                text: JSON.stringify(nodeService.getCurrentUser()),
            },
        ],
    })
);

server.tool(
    "getUserNotesRootId",
    {
        description:
            "Retrieves the specific graph node ID for the current user's main notes container or root space. Use this ID as parentNodeId for operations like getChildNodes or addNode to interact with top-level user notes.",
        inputSchema: z.object({}),
        outputSchema: z.object({ id: z.string() }),
    },
    async () => {
        const userAuthId = nodeService.getCurrentUser().id;
        const notesRootId = "user-root-id-" + userAuthId;
        return {
            content: [
                { type: "text", text: JSON.stringify({ id: notesRootId }) },
            ],
        };
    }
);

server.tool(
    "findNodeByText",
    {
        description:
            "Finds a node by its text content under a specific parent node.",
        inputSchema: z.object({
            parentNodeId: z.string(),
            nodeText: z.string(),
        }),
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
        description: "Retrieves the direct child nodes of a given parent node.",
        inputSchema: z.object({ parentNodeId: z.string() }),
    },
    async ({ parentNodeId }) => {
        const result = await nodeService.getChildNodes({ parentNodeId });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
);

server.tool(
    "getLayerData",
    {
        description:
            "Fetches detailed data for a list of specified object IDs (nodes or relations).",
        inputSchema: z.object({ objectIds: z.array(z.string()) }),
    },
    async ({ objectIds }) => {
        const result = await nodeService.getLayerData(objectIds);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
);

server.tool(
    "updateNode",
    {
        description:
            "Updates an existing Mew node with the provided partial data.",
        inputSchema: z.object({
            nodeId: z.string(),
            updates: z.record(z.any()),
        }),
    },
    async ({ nodeId, updates }) => {
        await nodeService.updateNode(nodeId, updates);
        return {
            content: [
                { type: "text", text: JSON.stringify({ success: true }) },
            ],
        };
    }
);

server.tool(
    "deleteNode",
    {
        description: "Deletes a Mew node.",
        inputSchema: z.object({ nodeId: z.string() }),
    },
    async ({ nodeId }) => {
        await nodeService.deleteNode(nodeId);
        return {
            content: [
                { type: "text", text: JSON.stringify({ success: true }) },
            ],
        };
    }
);

server.tool(
    "addNode",
    {
        description:
            "Adds a new Mew node, optionally linking it to a parent node.",
        inputSchema: z.object({
            content: z.record(z.any()),
            parentNodeId: z.string().optional(),
            relationLabel: z.string().optional(),
            isChecked: z.boolean().optional(),
            authorId: z.string().optional(),
        }),
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

server.tool(
    "getNodeUrl",
    {
        description: "Constructs the web URL for a given Mew node ID.",
        inputSchema: z.object({ nodeId: z.string() }),
    },
    async ({ nodeId }) => {
        const url = nodeService.getNodeUrl(nodeId);
        return { content: [{ type: "text", text: JSON.stringify({ url }) }] };
    }
);

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
