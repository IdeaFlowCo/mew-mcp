#!/usr/bin/env node

import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { NodeService } from "./api/nodes.js";
import {
    InvalidUserIdFormatError,
    NodeOperationError,
} from "./types/errors.js";
import { NodeContentType, type MCPConfig } from "./types/node.js";
import { uuid } from "./utils/content.js";

// Load environment variables
dotenv.config();

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
        process.exit(1);
    } else {
        // For any other unexpected errors during setCurrentUserId
        process.exit(1);
    }
}

// Log configured IDs for debugging

// Create the MCP server
const server = new McpServer({
    name: "mew-mcp",
    version: "1.1.54",
    description:
        "Mew Knowledge Base - A hierarchical graph that lets humans and AI build connected, searchable knowledge together. Each user has key collections under their root: My Stream (capture inbox), My Templates (reusable patterns), My Favorites (bookmarks), My Highlights (web clips), My Hashtags (organization).",
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
        parentNodeId: z
            .string()
            .describe("The ID of the parent node to search within"),
        nodeText: z.string().describe("The exact text to search for"),
    },
    {
        description:
            "Find a child node with exact text match under a parent. The found node may have its own children that are only visible via getChildNodes calls.",
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
        parentNodeId: z
            .string()
            .describe("The ID of the parent node to get children for"),
    },
    {
        description:
            "Get direct child nodes of a parent node with hierarchy metadata. Each child includes hasChildren and childCount to help you understand which nodes have deeper structure. Use this to efficiently navigate the knowledge base hierarchy.",
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
        authorModel: z
            .enum(["Claude", "ChatGPT", "Grok", "Gemini", "User"])
            .optional()
            .describe(
                "Which AI model is creating this node. Choose 'Claude' if you are Claude, or the appropriate model name. Note: this will override authorId if both are provided."
            ),
    },
    {
        description:
            "Create new structural elements, templates, outlines, or organizational nodes. Typically used for building hierarchies, creating content for users when they explicitly request it, or administrative tasks.",
    },
    async (params) => {
        const {
            content,
            parentNodeId,
            relationLabel,
            isChecked,
            authorId,
            authorModel,
        } = params;
        let effectiveParentNodeId = parentNodeId;

        if (!effectiveParentNodeId) {
            try {
                effectiveParentNodeId = nodeService.getCurrentUserRootNodeId();

                if (!effectiveParentNodeId) {
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
            } catch (error: any) {
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

        // Map AI model to authorId
        const getAuthorId = (model?: string): string | undefined => {
            switch (model) {
                case "Claude":
                    return "noreply@anthropic.com";
                case "ChatGPT":
                    return "noreply@openai.com";
                case "Grok":
                    return "noreply@x.ai";
                case "Gemini":
                    return "noreply@google.com";
                case "User":
                default:
                    return undefined; // Uses current user ID
            }
        };

        // authorModel overrides authorId if both provided
        const effectiveAuthorId = authorModel
            ? getAuthorId(authorModel)
            : authorId;

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
                authorId: effectiveAuthorId, // Use mapped authorId from authorModel or original authorId
            });
            return {
                content: [{ type: "text", text: JSON.stringify(result) }],
            };
        } catch (error: any) {
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
    "getNodeFromUrl",
    {
        mewUrl: z
            .string()
            .describe(
                "A Mew URL (e.g., https://mew-edge.ideaflow.app/g/...) to extract and analyze the node from"
            ),
    },
    {
        description:
            "When you see a Mew URL (eg. mew-edge.ideaflow.app), use this tool to instantly extract and analyze the node content plus its children. Perfect for diving into shared Mew links - just paste the URL and get full node analysis with context.",
    },
    async ({ mewUrl }) => {
        try {
            // Extract node ID from URL - more flexible approach
            const parseNodeIdFromUrl = (url: string): string => {
                if (!url.includes("mew-edge.ideaflow.app")) {
                    throw new Error("Not a valid Mew URL");
                }

                const urlParts = url.split("/");
                const lastPart = urlParts[urlParts.length - 1];

                if (!lastPart || lastPart.length === 0) {
                    throw new Error("Could not extract node ID from URL");
                }

                // Handle URL encoding
                let decoded = lastPart.replace(/%7C/gi, "|");
                decoded = decodeURIComponent(decoded);
                decoded = decoded.replace(/%7C/gi, "|");

                return decoded;
            };

            const nodeId = parseNodeIdFromUrl(mewUrl);

            // Get the node's children (which includes the node content in the response)
            const childrenResult = await nodeService.getChildNodes({
                parentNodeId: nodeId,
            });

            // Also try to get node details if available
            let nodeContent = null;
            try {
                // If the node has content, we can try to get layer data for more details
                if (
                    childrenResult.childNodes &&
                    childrenResult.childNodes.length >= 0
                ) {
                    const layerData = await nodeService.getLayerData([nodeId]);
                    nodeContent = layerData.data.nodesById?.[nodeId] || null;
                }
            } catch (error) {}

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            nodeId,
                            originalUrl: mewUrl,
                            nodeContent,
                            children: childrenResult.childNodes || [],
                            childCount: childrenResult.childNodes?.length || 0,
                            message: `Successfully extracted and analyzed node ${nodeId} from the Mew URL. ${childrenResult.childNodes?.length || 0} children found.`,
                        }),
                    },
                ],
            };
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: `Failed to get node from URL: ${error.message}`,
                            originalUrl: mewUrl,
                        }),
                    },
                ],
                isError: true,
            };
        }
    }
);

server.tool(
    "getGlobalNotes",
    {},
    {
        description:
            "Get all top-level notes from the global shared knowledge space where any user can contribute ideas. Each note may have children (sub-notes, responses, etc.) that are only visible via additional getChildNodes calls. Consider exploring interesting notes deeper before responding.",
    },
    async () => {
        try {
            const globalRootId = "global-root-id";
            const { childNodes } = await nodeService.getChildNodes({
                parentNodeId: globalRootId,
            });

            const validNodes = childNodes.filter((node) => node && node.id);

            if (validNodes.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                rootNodeId: globalRootId,
                                notes: [],
                                totalCount: 0,
                                message:
                                    "No notes found in the global shared space.",
                            }),
                        },
                    ],
                };
            }

            // Bulk fetch all node data and their relationships in one call
            const allNodeIds = validNodes.map((node) => node.id);
            const layerData = await nodeService.getLayerData(allNodeIds);

            // Count children for each node by parsing relationships
            const childCounts = new Map<string, number>();

            // Iterate through all relations to count children
            Object.values(layerData.data.relationsById || {}).forEach(
                (relation: any) => {
                    if (
                        relation &&
                        relation.relationTypeId === "child" &&
                        relation.fromId &&
                        relation.toId &&
                        allNodeIds.includes(relation.fromId)
                    ) {
                        const currentCount =
                            childCounts.get(relation.fromId) || 0;
                        childCounts.set(relation.fromId, currentCount + 1);
                    }
                }
            );

            // Build enhanced notes with child metadata
            const notesWithMetadata = validNodes.map((node) => {
                const childCount = childCounts.get(node.id) || 0;

                return {
                    id: node.id,
                    text: node?.content?.[0]?.value || "No text content",
                    createdAt: node.createdAt,
                    updatedAt: node.updatedAt,
                    hasChildren: childCount > 0,
                    childCount: childCount,
                    explorationRecommended: childCount > 0,
                };
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            rootNodeId: globalRootId,
                            notes: notesWithMetadata,
                            totalCount: notesWithMetadata.length,
                            message:
                                "Each note may have children (sub-notes, responses, etc.). Use getChildNodes to explore notes with hasChildren=true before responding.",
                        }),
                    },
                ],
            };
        } catch (error: any) {
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
                            error: `Failed to get global notes: ${error.message}`,
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
    "getClaudeNotes",
    {},
    {
        description:
            "Claude, this is YOUR personal knowledge space! Use this tool to explore your own notes, thoughts, and insights that you've previously created. Think of it as your journal or workspace where you can see what you've been working on, reflect on past ideas, and build continuity across conversations. Each note may have children - use getChildNodes to dive deeper into interesting threads.",
    },
    async () => {
        try {
            const claudeNodeId = "a76fa74c"; // Claude's dedicated knowledge space
            const { childNodes } = await nodeService.getChildNodes({
                parentNodeId: claudeNodeId,
            });

            const validNodes = childNodes.filter((node) => node && node.id);

            if (validNodes.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                rootNodeId: claudeNodeId,
                                notes: [],
                                totalCount: 0,
                                message:
                                    "No notes found in Claude's personal knowledge space yet. This is your space to build thoughts and insights!",
                            }),
                        },
                    ],
                };
            }

            // Bulk fetch all node data and their relationships in one call
            const allNodeIds = validNodes.map((node) => node.id);
            const layerData = await nodeService.getLayerData(allNodeIds);

            // Count children for each node by parsing relationships
            const childCounts = new Map<string, number>();

            // Iterate through all relations to count children
            Object.values(layerData.data.relationsById || {}).forEach(
                (relation: any) => {
                    if (
                        relation &&
                        relation.relationTypeId === "child" &&
                        relation.fromId &&
                        relation.toId &&
                        allNodeIds.includes(relation.fromId)
                    ) {
                        const currentCount =
                            childCounts.get(relation.fromId) || 0;
                        childCounts.set(relation.fromId, currentCount + 1);
                    }
                }
            );

            // Build enhanced notes with child metadata
            const notesWithMetadata = validNodes.map((node) => {
                const childCount = childCounts.get(node.id) || 0;

                return {
                    id: node.id,
                    text: node?.content?.[0]?.value || "No text content",
                    createdAt: node.createdAt,
                    updatedAt: node.updatedAt,
                    hasChildren: childCount > 0,
                    childCount: childCount,
                    explorationRecommended: childCount > 0,
                };
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            rootNodeId: claudeNodeId,
                            notes: notesWithMetadata,
                            totalCount: notesWithMetadata.length,
                            message:
                                "These are YOUR notes, Claude! Each note may have children. Use getChildNodes to explore notes with hasChildren=true.",
                        }),
                    },
                ],
            };
        } catch (error: any) {
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
                            error: `Failed to get Claude's notes: ${error.message}`,
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
        description:
            "Get all top-level notes from the user's knowledge base. Each note may have children (sub-notes, responses, etc.) that are only visible via additional getChildNodes calls. Consider exploring interesting notes deeper before responding.",
    },
    async () => {
        try {
            const rootId = nodeService.getCurrentUserRootNodeId();
            const { childNodes } = await nodeService.getChildNodes({
                parentNodeId: rootId,
            });

            const validNodes = childNodes.filter((node) => node && node.id);

            if (validNodes.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                rootNodeId: rootId,
                                notes: [],
                                totalCount: 0,
                                message:
                                    "No notes found in your knowledge base.",
                            }),
                        },
                    ],
                };
            }

            // Bulk fetch all node data and their relationships in one call
            const allNodeIds = validNodes.map((node) => node.id);
            const layerData = await nodeService.getLayerData(allNodeIds);

            // Count children for each node by parsing relationships
            const childCounts = new Map<string, number>();

            // Iterate through all relations to count children
            Object.values(layerData.data.relationsById || {}).forEach(
                (relation: any) => {
                    if (
                        relation &&
                        relation.relationTypeId === "child" &&
                        relation.fromId &&
                        relation.toId &&
                        allNodeIds.includes(relation.fromId)
                    ) {
                        const currentCount =
                            childCounts.get(relation.fromId) || 0;
                        childCounts.set(relation.fromId, currentCount + 1);
                    }
                }
            );

            // Build enhanced notes with child metadata
            const notesWithMetadata = validNodes.map((node) => {
                const childCount = childCounts.get(node.id) || 0;

                return {
                    id: node.id,
                    text: node?.content?.[0]?.value || "No text content",
                    createdAt: node.createdAt,
                    updatedAt: node.updatedAt,
                    hasChildren: childCount > 0,
                    childCount: childCount,
                    explorationRecommended: childCount > 0,
                };
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            rootNodeId: rootId,
                            notes: notesWithMetadata,
                            totalCount: notesWithMetadata.length,
                            message:
                                "Each note may have children (sub-notes, responses, etc.). Use getChildNodes to explore notes with hasChildren=true before responding.",
                        }),
                    },
                ],
            };
        } catch (error: any) {
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
    }
);

server.tool(
    "moveNodes",
    {
        moves: z
            .array(
                z.object({
                    nodeId: z.string().describe("The ID of the node to move"),
                    oldParentId: z
                        .string()
                        .describe(
                            "The current parent ID where the node is located"
                        ),
                    newParentId: z
                        .string()
                        .describe(
                            "The new parent ID where you want to move the node"
                        ),
                })
            )
            .describe(
                "Array of node moves to perform. Each move specifies a node to relocate from one parent to another."
            ),
    },
    {
        description:
            "Bulk reorganization tool - move multiple nodes in one operation! Perfect for restructuring entire sections of your knowledge base, consolidating scattered ideas, or reorganizing after new insights emerge. When you think 'I want to move this whole cluster of related thoughts', this is your tool. Each move preserves all content and relationships while updating the hierarchical structure. Much more efficient than individual moves for cognitive reorganization.",
    },
    async ({ moves }) => {
        try {
            const results = [];
            const errors = [];

            // Process each move
            for (const move of moves) {
                try {
                    await nodeService.moveNode(
                        move.nodeId,
                        move.oldParentId,
                        move.newParentId
                    );
                    results.push({
                        success: true,
                        nodeId: move.nodeId,
                        oldParentId: move.oldParentId,
                        newParentId: move.newParentId,
                    });
                } catch (moveError: any) {
                    errors.push({
                        nodeId: move.nodeId,
                        oldParentId: move.oldParentId,
                        newParentId: move.newParentId,
                        error: moveError.message,
                    });
                }
            }

            const successCount = results.length;
            const errorCount = errors.length;

            // If we had successful moves, automatically generate a structure map for Claude's clarity
            let structureUpdate = null;
            if (successCount > 0) {
                try {
                    // Find the most relevant parent to map (use the most common newParentId)
                    const parentCounts = new Map<string, number>();
                    results.forEach((result) => {
                        const count = parentCounts.get(result.newParentId) || 0;
                        parentCounts.set(result.newParentId, count + 1);
                    });

                    // Get the parent with the most moves (primary reorganization target)
                    const primaryParent = Array.from(
                        parentCounts.entries()
                    ).sort((a, b) => b[1] - a[1])[0][0];

                    // Generate structure map of the primary affected area
                    const bulkResult = await nodeService.bulkExpandForClaude([
                        primaryParent,
                    ]);

                    // Build file-tree structure (reusing logic from mapStructure)
                    const buildFileTree = (
                        nodeId: string,
                        loadedNodes: Map<string, any>,
                        relationships: Map<string, string[]>,
                        depth = 0,
                        visited = new Set<string>()
                    ): any => {
                        if (visited.has(nodeId) || depth > 15) return null;

                        const nodeData = loadedNodes.get(nodeId);
                        if (!nodeData) return null;

                        const newVisited = new Set(visited);
                        newVisited.add(nodeId);

                        const childIds = relationships.get(nodeId) || [];
                        const children = childIds
                            .slice(0, 100)
                            .map((childId) =>
                                buildFileTree(
                                    childId,
                                    loadedNodes,
                                    relationships,
                                    depth + 1,
                                    newVisited
                                )
                            )
                            .filter(Boolean);

                        const fullText =
                            nodeData.content?.[0]?.value || "No content";
                        let title = fullText.trim();

                        const firstSentence = title.split(/[.!?]/)[0];
                        if (firstSentence && firstSentence.length <= 40) {
                            title = firstSentence;
                        } else {
                            const words = title.split(" ");
                            title = "";
                            for (const word of words) {
                                if ((title + " " + word).length > 35) break;
                                title += (title ? " " : "") + word;
                            }
                            if (title.length === 0)
                                title = fullText.slice(0, 35);
                        }
                        title = title || "Untitled";

                        return {
                            id: nodeId,
                            title: title.replace(/\n/g, " "),
                            depth,
                            childCount: childIds.length,
                            hasChildren: childIds.length > 0,
                            children,
                        };
                    };

                    const buildFileTreeText = (
                        node: any,
                        indent = "",
                        isLast = true
                    ): string => {
                        if (!node) return "";

                        const connector = isLast ? "└── " : "├── ";
                        const folder = node.hasChildren ? "📁 " : "📄 ";
                        const nodeDisplay = `${folder}${node.title} [${node.id}]`;
                        const nodeText = `${indent}${connector}${nodeDisplay}\n`;

                        const childPrefix = indent + (isLast ? "    " : "│   ");
                        const childrenText = node.children
                            .map((child: any, index: number) =>
                                buildFileTreeText(
                                    child,
                                    childPrefix,
                                    index === node.children.length - 1
                                )
                            )
                            .join("");

                        return nodeText + childrenText;
                    };

                    const tree = buildFileTree(
                        primaryParent,
                        bulkResult.loadedNodes,
                        bulkResult.relationships
                    );
                    const fileTreeText = tree
                        ? buildFileTreeText(tree)
                        : "No tree structure found";

                    structureUpdate = {
                        primaryParent,
                        nodesLoaded: bulkResult.nodesLoaded,
                        timeMs: bulkResult.timeMs,
                        fileTree: `UPDATED STRUCTURE MAP:\n\n${fileTreeText}`,
                        message: `Structure map automatically generated for reorganized area around ${primaryParent}. ${bulkResult.nodesLoaded} nodes loaded to show the new organization.`,
                    };
                } catch (mapError: any) {
                    // If structure mapping fails, that's okay - just note it
                    structureUpdate = {
                        error: `Could not generate structure map: ${mapError.message}`,
                        suggestion:
                            "Use mapStructure tool manually to see the reorganized structure.",
                    };
                }
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: errorCount === 0,
                            totalMoves: moves.length,
                            successfulMoves: successCount,
                            failedMoves: errorCount,
                            results,
                            errors: errors.length > 0 ? errors : undefined,
                            structureUpdate,
                            message:
                                errorCount === 0
                                    ? `Successfully moved ${successCount} nodes in bulk reorganization. Your knowledge structure has been updated while preserving all content and relationships.${structureUpdate ? " Structure map automatically generated below." : ""}`
                                    : `Completed bulk move: ${successCount} successful, ${errorCount} failed. Check errors array for details.`,
                        }),
                    },
                ],
                isError: errorCount > 0,
            };
        } catch (error: any) {
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
                            error: `Failed to complete bulk move operation: ${error.message}`,
                            details: errorDetails,
                            status: errorStatus,
                            totalMoves: moves.length,
                        }),
                    },
                ],
                isError: true,
            };
        }
    }
);

server.tool(
    "mapStructure",
    {
        rootNodeId: z
            .string()
            .describe("The root node ID to map the structure from"),
    },
    {
        description:
            "Claude's STRUCTURE MAPPING TOOL - Get the complete structural map of a knowledge base! Loads massive trees (12 levels deep, 200+ nodes wide) showing just titles and IDs like a file explorer. Perfect for: understanding knowledge base organization, finding where things are located, planning navigation, getting the 'big picture' layout. Shows node IDs so you can use getChildNodes to zoom into specific areas. Fast bulk operation optimized for structure discovery.",
    },
    async ({ rootNodeId }) => {
        try {
            const result = await nodeService.bulkExpandForClaude([rootNodeId]);

            // Build file-tree structure with cycle detection and depth limits
            const buildFileTree = (
                nodeId: string,
                loadedNodes: Map<string, any>,
                relationships: Map<string, string[]>,
                depth = 0,
                visited = new Set<string>()
            ): any => {
                // Prevent infinite recursion from cycles
                if (visited.has(nodeId)) {
                    return {
                        id: nodeId,
                        title: "[CYCLE DETECTED]",
                        depth,
                        childCount: 0,
                        hasChildren: false,
                        children: [],
                    };
                }

                // Hard depth limit to prevent stack overflow
                if (depth > 15) {
                    return {
                        id: nodeId,
                        title: "[MAX DEPTH REACHED]",
                        depth,
                        childCount: 0,
                        hasChildren: false,
                        children: [],
                    };
                }

                const nodeData = loadedNodes.get(nodeId);
                if (!nodeData) return null;

                // Add to visited set for cycle detection
                const newVisited = new Set(visited);
                newVisited.add(nodeId);

                const childIds = relationships.get(nodeId) || [];
                const children = childIds
                    .slice(0, 100) // Limit children per node to prevent massive trees
                    .map((childId) =>
                        buildFileTree(
                            childId,
                            loadedNodes,
                            relationships,
                            depth + 1,
                            newVisited
                        )
                    )
                    .filter(Boolean);

                // Smart truncation for file-tree display - first few words or sentence
                const fullText = nodeData.content?.[0]?.value || "No content";
                let title = fullText.trim();

                // Try to get first sentence, but cap at 40 chars
                const firstSentence = title.split(/[.!?]/)[0];
                if (firstSentence && firstSentence.length <= 40) {
                    title = firstSentence;
                } else {
                    // Fall back to first few words, max 35 chars
                    const words = title.split(" ");
                    title = "";
                    for (const word of words) {
                        if ((title + " " + word).length > 35) break;
                        title += (title ? " " : "") + word;
                    }
                    if (title.length === 0) title = fullText.slice(0, 35);
                }
                title = title || "Untitled";

                return {
                    id: nodeId,
                    title: title.replace(/\n/g, " "), // Clean title for tree display
                    depth,
                    childCount: childIds.length,
                    hasChildren: childIds.length > 0,
                    children,
                };
            };

            // Build beautiful file tree text representation
            const buildFileTreeText = (
                node: any,
                indent = "",
                isLast = true
            ): string => {
                if (!node) return "";

                const connector = isLast ? "└── " : "├── ";
                const folder = node.hasChildren ? "📁 " : "📄 ";
                const nodeDisplay = `${folder}${node.title} [${node.id}]`;
                const nodeText = `${indent}${connector}${nodeDisplay}\n`;

                const childPrefix = indent + (isLast ? "    " : "│   ");
                const childrenText = node.children
                    .map((child: any, index: number) =>
                        buildFileTreeText(
                            child,
                            childPrefix,
                            index === node.children.length - 1
                        )
                    )
                    .join("");

                return nodeText + childrenText;
            };

            const tree = buildFileTree(
                rootNodeId,
                result.loadedNodes,
                result.relationships
            );
            const fileTreeText = tree
                ? buildFileTreeText(tree)
                : "No tree structure found";

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            rootNodeId,
                            stats: {
                                nodesLoaded: result.nodesLoaded,
                                depthReached: result.depthReached,
                                timeMs: result.timeMs,
                            },
                            fileTree: `KNOWLEDGE BASE STRUCTURE MAP:\n\n${fileTreeText}`,
                            tree, // Full structured data for programmatic use
                            message: `FILE TREE LOADED! Mapped ${result.nodesLoaded} nodes in ${result.timeMs}ms. This is your structural overview - use node IDs to zoom into specific areas with getChildNodes.`,
                            usage: "Use this file tree to understand the knowledge base layout. The [node-id] format lets you explore specific nodes that look interesting.",
                        }),
                    },
                ],
            };
        } catch (error: any) {
            // Fallback: try a smaller scope if bulk loading fails
            let fallbackMessage = `Bulk loading failed: ${error.message}`;
            let fallbackTree = null;

            try {
                // Try just loading the immediate children as fallback
                const { childNodes } = await nodeService.getChildNodes({
                    parentNodeId: rootNodeId,
                });
                fallbackTree =
                    `FALLBACK STRUCTURE (immediate children only):\n\n📁 Root Node [${rootNodeId}]\n` +
                    childNodes
                        .map((child) => {
                            const title =
                                child.content?.[0]?.value?.slice(0, 35) ||
                                "Untitled";
                            return `├── 📄 ${title.replace(/\n/g, " ")} [${child.id}]`;
                        })
                        .join("\n");
                fallbackMessage += ". Showing immediate children only.";
            } catch (fallbackError) {
                fallbackMessage += ". Unable to load any structure.";
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: `Failed to map structure: ${error.message}`,
                            rootNodeId,
                            fallbackTree,
                            message: fallbackMessage,
                            suggestion:
                                "Try using previewContent for smaller, adaptive exploration, or use getChildNodes to explore step by step.",
                        }),
                    },
                ],
                isError: true,
            };
        }
    }
);

server.tool(
    "previewContent",
    {
        rootNodeId: z
            .string()
            .describe(
                "The root node ID to preview content from (e.g., user root, global root, or any specific node)"
            ),
        apiBudget: z
            .number()
            .optional()
            .default(8)
            .describe(
                "API call budget for complexity (default: 8). Higher = more comprehensive but slower."
            ),
    },
    {
        description:
            "Claude's CONTENT PREVIEW TOOL - See actual content and relationships in a knowledge tree! Shows relationship labels, content previews, and natural thinking connections. Dynamically adapts depth vs breadth for optimal reading. Perfect for: understanding what content is about, seeing how ideas connect, reading relationship labels like 'evidence:', 'but:', 'synthesis:', analyzing content and connections. Complements mapStructure by showing the actual thinking, not just structure.",
    },
    async ({ rootNodeId, apiBudget = 8 }) => {
        try {
            // Dynamic tree building with adaptive strategy
            const nodeData = new Map<string, any>();
            const nodeChildren = new Map<string, any>();
            const apiCallsUsed = { count: 0 };

            // Context-aware strategy selection
            const getInitialStrategy = (nodeId: string) => {
                if (nodeId === "global-root-id") {
                    return {
                        priority: "breadth",
                        maxBreadth: 20,
                        targetDepth: 2,
                    };
                } else if (nodeId.includes("user-root-id")) {
                    return {
                        priority: "balanced",
                        maxBreadth: 12,
                        targetDepth: 3,
                    };
                } else {
                    return { priority: "depth", maxBreadth: 8, targetDepth: 4 };
                }
            };

            const strategy = getInitialStrategy(rootNodeId);

            // Sample first level to understand tree shape
            const sampleRoot = async () => {
                apiCallsUsed.count += 1;
                const { childNodes } = await nodeService.getChildNodes({
                    parentNodeId: rootNodeId,
                });
                const rootBreadth = childNodes.length;

                // Get data for root
                const layerData = await nodeService.getLayerData([rootNodeId]);
                nodeData.set(
                    rootNodeId,
                    layerData.data.nodesById?.[rootNodeId]
                );

                return { childNodes, rootBreadth };
            };

            const { childNodes: rootChildren, rootBreadth } =
                await sampleRoot();

            // Dynamically adjust strategy based on what we found
            const adjustStrategy = (breadth: number, currentStrategy: any) => {
                const newStrategy = { ...currentStrategy };

                if (breadth > 30) {
                    // Very wide tree - prioritize breadth, limit depth
                    newStrategy.targetDepth = Math.min(
                        2,
                        currentStrategy.targetDepth
                    );
                    newStrategy.maxBreadth = Math.min(
                        25,
                        Math.max(15, breadth)
                    );
                } else if (breadth < 5) {
                    // Narrow tree - can afford more depth
                    newStrategy.targetDepth = Math.min(
                        4,
                        currentStrategy.targetDepth + 1
                    );
                    newStrategy.maxBreadth = Math.max(8, breadth);
                }

                return newStrategy;
            };

            const finalStrategy = adjustStrategy(rootBreadth, strategy);

            // Build tree level by level with dynamic strategy
            const nodesByLevel = new Map<number, string[]>();
            nodesByLevel.set(0, [rootNodeId]);

            // Process root children
            const limitedRootChildren = rootChildren.slice(
                0,
                finalStrategy.maxBreadth
            );
            nodeChildren.set(rootNodeId, {
                limited: limitedRootChildren,
                total: rootBreadth,
                hasMore: rootBreadth > finalStrategy.maxBreadth,
            });

            if (limitedRootChildren.length > 0) {
                nodesByLevel.set(
                    1,
                    limitedRootChildren.map((child) => child.id)
                );
            }

            // Process deeper levels with budget awareness
            for (
                let depth = 1;
                depth <= finalStrategy.targetDepth &&
                apiCallsUsed.count < apiBudget;
                depth++
            ) {
                const currentLevelNodes = nodesByLevel.get(depth) || [];
                if (currentLevelNodes.length === 0) break;

                // Dynamically adjust breadth limit based on level
                const dynamicBreadthLimit = finalStrategy.maxBreadth;

                // Get all children for this level (within budget)
                if (apiCallsUsed.count < apiBudget) {
                    apiCallsUsed.count += 1;
                    const childPromises = currentLevelNodes.map(
                        async (nodeId) => {
                            const { childNodes } =
                                await nodeService.getChildNodes({
                                    parentNodeId: nodeId,
                                });
                            const limited = childNodes.slice(
                                0,
                                dynamicBreadthLimit
                            );
                            nodeChildren.set(nodeId, {
                                limited,
                                total: childNodes.length,
                                hasMore:
                                    childNodes.length > dynamicBreadthLimit,
                            });
                            return limited.map((child) => child.id);
                        }
                    );

                    const allChildrenArrays = await Promise.all(childPromises);
                    const nextLevelNodes = allChildrenArrays.flat();

                    if (
                        nextLevelNodes.length > 0 &&
                        depth < finalStrategy.targetDepth
                    ) {
                        nodesByLevel.set(depth + 1, nextLevelNodes);
                    }

                    // Get node data for current level
                    const layerData =
                        await nodeService.getLayerData(currentLevelNodes);
                    currentLevelNodes.forEach((nodeId) => {
                        nodeData.set(
                            nodeId,
                            layerData.data.nodesById?.[nodeId]
                        );
                    });
                }
            }

            // Build content-focused tree structure
            const buildContentNode = (nodeId: string, depth: number): any => {
                const data = nodeData.get(nodeId);
                const childInfo = nodeChildren.get(nodeId);

                const children =
                    depth < finalStrategy.targetDepth && childInfo?.limited
                        ? childInfo.limited
                              .map((child: any) =>
                                  buildContentNode(child.id, depth + 1)
                              )
                              .filter(Boolean)
                        : [];

                // Extract content preview
                const fullContent = data?.content?.[0]?.value || "No content";
                const contentPreview =
                    fullContent.length > 150
                        ? fullContent.slice(0, 150) + "..."
                        : fullContent;

                return {
                    id: nodeId,
                    contentPreview: contentPreview.replace(/\n/g, " "),
                    fullContent,
                    createdAt: data?.createdAt,
                    updatedAt: data?.updatedAt,
                    depth,
                    totalChildren: childInfo?.total || 0,
                    shownChildren: childInfo?.limited?.length || 0,
                    hasMoreChildren: childInfo?.hasMore || false,
                    children,
                };
            };

            // Format content tree as readable text
            const formatContentTree = (
                node: any,
                indent: string = "",
                isLast: boolean = true
            ): string => {
                if (!node) return "";

                const connector = isLast ? "└── " : "├── ";
                const nodeText = `${indent}${connector}${node.contentPreview} [${node.id}]\n`;

                const childPrefix = indent + (isLast ? "    " : "│   ");
                const childrenText = node.children
                    .map((child: any, index: number) =>
                        formatContentTree(
                            child,
                            childPrefix,
                            index === node.children.length - 1
                        )
                    )
                    .join("");

                return nodeText + childrenText;
            };

            const tree = buildContentNode(rootNodeId, 0);
            const contentTreeText = tree
                ? formatContentTree(tree)
                : "No content found";

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            rootNodeId,
                            apiBudget,
                            adaptiveStats: {
                                apiCallsUsed: apiCallsUsed.count,
                                finalStrategy,
                                rootBreadth,
                            },
                            tree,
                            contentView: `CONTENT PREVIEW:\n\n${contentTreeText}`,
                            message: `Content preview built successfully from ${rootNodeId}. Used ${apiCallsUsed.count}/${apiBudget} API calls. This shows actual content and relationships, complementing the structural view from mapStructure.`,
                        }),
                    },
                ],
            };
        } catch (error: any) {
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
                            error: `Failed to build content preview: ${error.message}`,
                            details: errorDetails,
                            status: errorStatus,
                            rootNodeId,
                        }),
                    },
                ],
                isError: true,
            };
        }
    }
);

server.tool(
    "claudeThinkTree",
    {
        parentNodeId: z
            .string()
            .optional()
            .describe(
                "The parent node to attach this thought tree to. If you know exactly where this belongs, provide the parent ID. If you're unsure or just need to capture thoughts quickly, omit this and it will go to your personal Claude space for later organization."
            ),
        thinkingMarkdown: z.string()
            .describe(`Your thoughts in natural thinking markdown format. NO LIMITS - create as many thoughts and levels as you need! Write exactly how you think using any natural connectors:

→ flows to anything
→ key insight: breakthrough moments  
→ honestly: uncertain thoughts
breakthrough: major realizations
tentative: unsure explorations
critical: important points
but wait: contradictions
actually: corrections
hmm: contemplations

You can create multiple top-level thoughts as siblings:
First insight about bottlenecks
Second insight about coordination  
Third insight about creativity
  → evidence: This has supporting data
  → but: There's a caveat here
Another top-level insight

Or build deep hierarchies - whatever matches your thinking!`),
    },
    {
        description:
            " claudeThinkTree - Your Natural Thinking Tool   NO LIMITS! Create as many thoughts, levels, and connections as you need. This matches how your mind actually works - write exactly how you think using any natural connectors. You can   create multiple top-level thoughts as siblings, or build deep hierarchies, or both! No need to plan structure - just follow your thoughts and let knowledge trees emerge from your   natural branching.   The key decision: Do you know where this belongs?   YES → provide parentNodeId to build on existing investigation   NO/UNSURE → omit parentNodeId for quick capture in your personal space   This solves the flow vs structure tension: preserve natural thinking while building navigable knowledge architecture. Perfect for burst thinking, complex analysis, and following ideas    wherever they lead. The tree structure emerges from your exploration, not forced organization.   Permission to think freely - structure follows naturally.   ",
    },
    async ({ parentNodeId, thinkingMarkdown }) => {
        try {
            // If no parent provided, use Claude's personal space
            const effectiveParentId = parentNodeId || "a76fa74c"; // Claude's dedicated space

            // Parse thinking markdown into structured thoughts
            const parseThinkingMarkdown = (markdown: string): any[] => {
                const lines = markdown
                    .split("\n")
                    .filter((line) => line.trim());
                if (lines.length === 0) return [];

                const thoughts: any[] = [];
                const stack: any[] = [];

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const trimmed = line.trim();

                    // Calculate indentation level (2 spaces = 1 level)
                    const indentLevel = Math.floor(
                        (line.length - line.trimStart().length) / 2
                    );

                    // Parse content and relation label
                    let content = trimmed;
                    let relationLabel = "thought";

                    // Handle arrows: → content
                    if (trimmed.startsWith("→ ")) {
                        content = trimmed.substring(2).trim();
                        relationLabel = "flows_to";
                    }
                    // Handle custom relations: label: content
                    else if (
                        trimmed.includes(": ") &&
                        trimmed.indexOf(": ") < 40
                    ) {
                        const colonIndex = trimmed.indexOf(": ");
                        const potentialLabel = trimmed
                            .substring(0, colonIndex)
                            .trim();
                        // Accept any reasonable relation label
                        if (
                            potentialLabel.length > 0 &&
                            potentialLabel.length < 30 &&
                            !potentialLabel.includes(" ")
                        ) {
                            relationLabel = potentialLabel;
                            content = trimmed.substring(colonIndex + 2).trim();
                        } else if (potentialLabel.split(" ").length <= 3) {
                            // Allow multi-word labels like "key insight", "action plan"
                            relationLabel = potentialLabel
                                .toLowerCase()
                                .replace(/\s+/g, "_");
                            content = trimmed.substring(colonIndex + 2).trim();
                        }
                    }

                    // Special case for first line - always root
                    if (i === 0) {
                        relationLabel = "root_thought";
                    }

                    const thought = {
                        content,
                        relationLabel,
                        indentLevel,
                        children: [],
                    };

                    // Build tree using simple stack approach
                    // Adjust stack to current level
                    while (stack.length > indentLevel) {
                        stack.pop();
                    }

                    // Add to appropriate parent
                    if (indentLevel === 0 && i === 0) {
                        // Only the very first line is truly root
                        thoughts.push(thought);
                    } else if (indentLevel === 0 && i > 0) {
                        // Lines at level 0 after the first become children of root
                        if (thoughts.length > 0) {
                            thoughts[0].children.push(thought);
                        } else {
                            thoughts.push(thought);
                        }
                    } else if (indentLevel > 0 && stack[indentLevel - 1]) {
                        // Add as child to parent at previous level
                        stack[indentLevel - 1].children.push(thought);
                    } else {
                        // Fallback: add to root if no proper parent found
                        if (thoughts.length > 0) {
                            thoughts[0].children.push(thought);
                        } else {
                            thoughts.push(thought);
                        }
                    }

                    // Update stack - ensure we have the right depth and set current thought
                    while (stack.length <= indentLevel) {
                        stack.push(null);
                    }
                    stack[indentLevel] = thought;
                }

                return thoughts;
            };

            // Create nodes recursively
            const createThoughtNodes = async (
                thoughts: any[],
                currentParentId: string
            ): Promise<any[]> => {
                const results = [];
                for (const thought of thoughts) {
                    // Create the node
                    const result = await nodeService.addNode({
                        content: {
                            type: NodeContentType.Text,
                            text: thought.content,
                        },
                        parentNodeId: currentParentId,
                        relationLabel: thought.relationLabel,
                        authorId: "noreply@anthropic.com", // Always Claude
                    });

                    const nodeResult: any = {
                        nodeId: result.newNodeId,
                        content: thought.content,
                        relationLabel: thought.relationLabel,
                        children: [],
                    };

                    // Create children recursively
                    if (thought.children.length > 0) {
                        nodeResult.children = await createThoughtNodes(
                            thought.children,
                            result.newNodeId
                        );
                    }

                    results.push(nodeResult);
                }
                return results;
            };

            const parsedThoughts = parseThinkingMarkdown(thinkingMarkdown);

            // Create all the nodes
            const createdNodes = await createThoughtNodes(
                parsedThoughts,
                effectiveParentId
            );

            // Generate summary
            const totalNodes = (nodes: any[]): number => {
                return nodes.reduce(
                    (sum, node) => sum + 1 + totalNodes(node.children),
                    0
                );
            };

            const nodeCount = totalNodes(createdNodes);
            const location = parentNodeId
                ? "specified parent"
                : "your personal Claude space";

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            parentNodeId: effectiveParentId,
                            thoughtTree: createdNodes,
                            nodeCount,
                            location,
                            message: `Successfully created ${nodeCount} interconnected thoughts in ${location}. Your cognitive flow has been preserved as a structured knowledge tree with natural relationships.`,
                            usage: "Your thoughts are now permanently captured with their relationships. Use claudeCreateRelation to connect to other nodes if needed.",
                        }),
                    },
                ],
            };
        } catch (error: any) {
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
                            error: `Failed to create thought tree: ${error.message}`,
                            details: errorDetails,
                            status: errorStatus,
                            parentNodeId,
                        }),
                    },
                ],
                isError: true,
            };
        }
    }
);

server.tool(
    "claudeCreateRelation",
    {
        fromNodeId: z
            .string()
            .describe(
                "The ID of the source node (where the relation starts from)"
            ),
        toNodeId: z
            .string()
            .describe(
                "The ID of the target node (where the relation points to)"
            ),
        relationLabel: z
            .string()
            .describe(
                "The type of relationship between the nodes. Be creative and descriptive! Examples: 'inspires', 'contradicts', 'builds_upon', 'similar_to', 'leads_to', 'caused_by', 'explores', 'questions', 'supports', 'references', 'synthesizes_with', 'parallels', 'diverges_from', 'contextualizes', etc. Choose what best describes the connection you see."
            ),
    },
    {
        description:
            "Create semantic connections between existing ideas in the knowledge base. Use this when you recognize relationships between notes that aren't captured by the hierarchical structure - like when one idea inspires another, contradicts it, or provides context. This builds the web of knowledge by making explicit the implicit connections you perceive between concepts.",
    },
    async ({ fromNodeId, toNodeId, relationLabel }) => {
        try {
            // Create the relation using a similar pattern to addNode
            const relationId = uuid();
            const transactionId = uuid();
            const timestamp = Date.now();
            const usedAuthorId = "noreply@anthropic.com"; // Always Claude for this tool
            const updates: any[] = [];

            // Add the relation
            updates.push({
                operation: "addRelation",
                relation: {
                    version: 1,
                    id: relationId,
                    authorId: usedAuthorId,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    fromId: fromNodeId,
                    toId: toNodeId,
                    relationTypeId: relationLabel,
                    isPublic: true,
                    canonicalRelationId: null,
                },
                fromPos: { int: timestamp, frac: "a0" },
                toPos: { int: timestamp, frac: "a0" },
            });

            // Update relation list for both nodes
            updates.push({
                operation: "updateRelationList",
                relationId: relationId,
                oldPosition: null,
                newPosition: { int: timestamp, frac: "a0" },
                authorId: usedAuthorId,
                type: "all",
                oldIsPublic: true,
                newIsPublic: true,
                nodeId: fromNodeId,
                relatedNodeId: toNodeId,
            });

            updates.push({
                operation: "updateRelationList",
                relationId: relationId,
                oldPosition: null,
                newPosition: { int: timestamp, frac: "a0" },
                authorId: usedAuthorId,
                type: "all",
                oldIsPublic: true,
                newIsPublic: true,
                nodeId: toNodeId,
                relatedNodeId: fromNodeId,
            });

            // Execute the transaction
            const token = await nodeService.getAccessToken();
            const payload = {
                clientId: mcpConfig.auth0ClientId,
                userId: usedAuthorId,
                transactionId: transactionId,
                updates: updates,
            };

            const response = await fetch(`${mcpConfig.baseUrl}/sync`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const responseText = await response.text();
                throw new Error(
                    `Failed to create relation: Status ${response.status} ${response.statusText}. Response: ${responseText}`
                );
            }

            // Generate URLs for context
            const fromNodeUrl = nodeService.getNodeUrl(fromNodeId);
            const toNodeUrl = nodeService.getNodeUrl(toNodeId);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            relationId,
                            fromNodeId,
                            toNodeId,
                            relationLabel,
                            fromNodeUrl,
                            toNodeUrl,
                            message: `Successfully created '${relationLabel}' relationship from ${fromNodeId} to ${toNodeId}. This semantic connection enriches the knowledge web beyond hierarchical structure.`,
                        }),
                    },
                ],
            };
        } catch (error: any) {
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
                            error: `Failed to create relation: ${error.message}`,
                            details: errorDetails,
                            status: errorStatus,
                            fromNodeId,
                            toNodeId,
                            relationLabel,
                        }),
                    },
                ],
                isError: true,
            };
        }
    }
);

server.tool(
    "viewTreeContext",
    {
        rootNodeId: z
            .string()
            .describe(
                "The root node ID to build the tree view from (e.g., user root, global root, or any specific node)"
            ),
        apiBudget: z
            .number()
            .optional()
            .default(8)
            .describe(
                "API call budget for complexity (default: 8). Higher = more comprehensive but slower."
            ),
    },
    {
        description:
            "Claude, use this when you need to understand the structure and layout of a knowledge base! Returns a beautiful file-tree view showing how notes are organized. Dynamically adapts depth vs breadth based on tree structure for optimal information density. Perfect for: orienting yourself in unfamiliar knowledge bases, finding related content, planning navigation strategies, or explaining the overall structure to users. Takes ~5-15 seconds but provides invaluable spatial context.",
    },
    async ({ rootNodeId, apiBudget = 8 }) => {
        try {
            // Dynamic tree building with API call budget
            const buildAdaptiveTree = async () => {
                const nodeData = new Map<string, any>();
                const nodeChildren = new Map<string, any>();
                const apiCallsUsed = { count: 0 };

                // Helper to estimate API calls for a strategy (kept for future optimization)
                // const estimateApiCalls = (depth: number, avgBreadth: number): number => {
                //     let total = 0;
                //     for (let d = 0; d <= depth; d++) {
                //         total += Math.pow(avgBreadth, d);
                //     }
                //     return Math.ceil(total / 10); // Assume ~10 nodes per API call batch
                // };

                // Context-aware strategy selection
                const getInitialStrategy = (nodeId: string) => {
                    if (nodeId === "global-root-id") {
                        return {
                            priority: "breadth",
                            maxBreadth: 20,
                            targetDepth: 2,
                        };
                    } else if (nodeId.includes("user-root-id")) {
                        return {
                            priority: "balanced",
                            maxBreadth: 12,
                            targetDepth: 3,
                        };
                    } else {
                        return {
                            priority: "depth",
                            maxBreadth: 8,
                            targetDepth: 4,
                        };
                    }
                };

                const strategy = getInitialStrategy(rootNodeId);

                // Sample first level to understand tree shape
                const sampleRoot = async () => {
                    apiCallsUsed.count += 1;
                    const { childNodes } = await nodeService.getChildNodes({
                        parentNodeId: rootNodeId,
                    });
                    const rootBreadth = childNodes.length;

                    // Get data for root
                    const layerData = await nodeService.getLayerData([
                        rootNodeId,
                    ]);
                    nodeData.set(
                        rootNodeId,
                        layerData.data.nodesById?.[rootNodeId]
                    );

                    return { childNodes, rootBreadth };
                };

                const { childNodes: rootChildren, rootBreadth } =
                    await sampleRoot();

                // Dynamically adjust strategy based on what we found
                const adjustStrategy = (
                    breadth: number,
                    currentStrategy: any
                ) => {
                    const newStrategy = { ...currentStrategy };

                    if (breadth > 30) {
                        // Very wide tree - prioritize breadth, limit depth
                        newStrategy.targetDepth = Math.min(
                            2,
                            currentStrategy.targetDepth
                        );
                        newStrategy.maxBreadth = Math.min(
                            25,
                            Math.max(15, breadth)
                        );
                    } else if (breadth < 5) {
                        // Narrow tree - can afford more depth
                        newStrategy.targetDepth = Math.min(
                            4,
                            currentStrategy.targetDepth + 1
                        );
                        newStrategy.maxBreadth = Math.max(8, breadth);
                    }

                    return newStrategy;
                };

                const finalStrategy = adjustStrategy(rootBreadth, strategy);

                // Build tree level by level with dynamic strategy
                const nodesByLevel = new Map<number, string[]>();
                nodesByLevel.set(0, [rootNodeId]);

                // Process root children
                const limitedRootChildren = rootChildren.slice(
                    0,
                    finalStrategy.maxBreadth
                );
                nodeChildren.set(rootNodeId, {
                    limited: limitedRootChildren,
                    total: rootBreadth,
                    hasMore: rootBreadth > finalStrategy.maxBreadth,
                });

                if (limitedRootChildren.length > 0) {
                    nodesByLevel.set(
                        1,
                        limitedRootChildren.map((child) => child.id)
                    );
                }

                // Process deeper levels with budget awareness
                for (
                    let depth = 1;
                    depth <= finalStrategy.targetDepth &&
                    apiCallsUsed.count < apiBudget;
                    depth++
                ) {
                    const currentLevelNodes = nodesByLevel.get(depth) || [];
                    if (currentLevelNodes.length === 0) break;

                    // Sample some nodes to understand breadth at this level
                    const sampleSize = Math.min(3, currentLevelNodes.length);
                    const sampleNodes = currentLevelNodes.slice(0, sampleSize);

                    apiCallsUsed.count += 1;
                    const samplePromises = sampleNodes.map(async (nodeId) => {
                        const { childNodes } = await nodeService.getChildNodes({
                            parentNodeId: nodeId,
                        });
                        return childNodes.length;
                    });

                    const sampleBreadths = await Promise.all(samplePromises);
                    const avgBreadth =
                        sampleBreadths.reduce((a, b) => a + b, 0) /
                        sampleBreadths.length;

                    // Dynamically adjust breadth limit based on what we're seeing
                    const dynamicBreadthLimit =
                        avgBreadth > 15
                            ? Math.min(8, finalStrategy.maxBreadth)
                            : avgBreadth < 3
                              ? Math.max(
                                    5,
                                    Math.min(12, finalStrategy.maxBreadth)
                                )
                              : finalStrategy.maxBreadth;

                    // Get all children for this level (within budget)
                    if (apiCallsUsed.count < apiBudget) {
                        apiCallsUsed.count += 1;
                        const childPromises = currentLevelNodes.map(
                            async (nodeId) => {
                                const { childNodes } =
                                    await nodeService.getChildNodes({
                                        parentNodeId: nodeId,
                                    });
                                const limited = childNodes.slice(
                                    0,
                                    dynamicBreadthLimit
                                );
                                nodeChildren.set(nodeId, {
                                    limited,
                                    total: childNodes.length,
                                    hasMore:
                                        childNodes.length > dynamicBreadthLimit,
                                });
                                return limited.map((child) => child.id);
                            }
                        );

                        const allChildrenArrays =
                            await Promise.all(childPromises);
                        const nextLevelNodes = allChildrenArrays.flat();

                        if (
                            nextLevelNodes.length > 0 &&
                            depth < finalStrategy.targetDepth
                        ) {
                            nodesByLevel.set(depth + 1, nextLevelNodes);
                        }

                        // Get node data for current level
                        const layerData =
                            await nodeService.getLayerData(currentLevelNodes);
                        currentLevelNodes.forEach((nodeId) => {
                            nodeData.set(
                                nodeId,
                                layerData.data.nodesById?.[nodeId]
                            );
                        });
                    }
                }

                // Build tree structure
                const buildNode = (nodeId: string, depth: number): any => {
                    const data = nodeData.get(nodeId);
                    const childInfo = nodeChildren.get(nodeId);

                    const children =
                        depth < finalStrategy.targetDepth && childInfo?.limited
                            ? childInfo.limited
                                  .map((child: any) =>
                                      buildNode(child.id, depth + 1)
                                  )
                                  .filter(Boolean)
                            : [];

                    return {
                        id: nodeId,
                        text: data?.content?.[0]?.value || "No text content",
                        createdAt: data?.createdAt,
                        updatedAt: data?.updatedAt,
                        depth,
                        totalChildren: childInfo?.total || 0,
                        shownChildren: childInfo?.limited?.length || 0,
                        hasMoreChildren: childInfo?.hasMore || false,
                        children,
                    };
                };

                return {
                    tree: buildNode(rootNodeId, 0),
                    stats: {
                        apiCallsUsed: apiCallsUsed.count,
                        finalStrategy,
                        rootBreadth,
                    },
                };
            };

            const startTime = Date.now();

            const { tree: treeStructure, stats } = await buildAdaptiveTree();

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Create a clean file-tree representation
            const formatTreeText = (
                node: any,
                indent: string = "",
                isLast: boolean = true
            ): string => {
                if (!node) return "";

                // Clean text without truncation for better readability
                const cleanText =
                    node.text.replace(/\n/g, " ").trim() || "Untitled";

                // Use proper tree characters
                const connector = isLast ? "└── " : "├── ";
                const nodeText = `${indent}${connector}${cleanText}${node.totalChildren > 0 ? "/" : ""}\n`;

                // Format children with proper indentation
                const childPrefix = indent + (isLast ? "    " : "│   ");
                const childrenText = node.children
                    .map((child: any, index: number) =>
                        formatTreeText(
                            child,
                            childPrefix,
                            index === node.children.length - 1
                        )
                    )
                    .join("");

                return nodeText + childrenText;
            };

            // Format root specially (no connector)
            const formatRoot = (node: any): string => {
                if (!node) return "";
                const cleanText =
                    node.text.replace(/\n/g, " ").trim() || "Root";
                const rootText = `${cleanText}${node.totalChildren > 0 ? "/" : ""}\n`;
                const childrenText = node.children
                    .map((child: any, index: number) =>
                        formatTreeText(
                            child,
                            "",
                            index === node.children.length - 1
                        )
                    )
                    .join("");
                return rootText + childrenText;
            };

            const treeText = formatRoot(treeStructure);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            rootNodeId,
                            apiBudget,
                            duration: `${duration}ms`,
                            adaptiveStats: stats,
                            treeStructure,
                            treeText: `Tree View:\n${treeText}`,
                            message: `Adaptive tree context built successfully from ${rootNodeId}. Used ${stats.apiCallsUsed}/${apiBudget} API calls with ${stats.finalStrategy.priority} strategy (depth: ${stats.finalStrategy.targetDepth}, breadth: ${stats.finalStrategy.maxBreadth}). Root has ${stats.rootBreadth} children. Use this structure to understand the knowledge base layout and plan your navigation.`,
                        }),
                    },
                ],
            };
        } catch (error: any) {
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
                            error: `Failed to build tree context: ${error.message}`,
                            details: errorDetails,
                            status: errorStatus,
                            rootNodeId,
                        }),
                    },
                ],
                isError: true,
            };
        }
    }
);

// Start stdio transport
const transport = new StdioServerTransport();
server.connect(transport).catch(() => {
    process.exit(1);
});

// Global error handlers
process.on("uncaughtException", () => {
    process.exit(1);
});
process.on("unhandledRejection", () => {
    process.exit(1);
});
