#!/usr/bin/env node
console.error("[Mew MCP] [mcp.ts] Script execution started."); // DEBUG
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NodeService } from "./api/nodes.js";
// Load environment variables
dotenv.config();
console.error("[Mew MCP] [mcp.ts] Environment variables loaded");
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
    console.error("[Mew MCP] [mcp.ts] Missing environment variables:", missing.join(", "));
    process.exit(1);
}
const mcpConfig = {
    baseUrl: process.env.BASE_URL,
    baseNodeUrl: process.env.BASE_NODE_URL,
    auth0Domain: process.env.AUTH0_DOMAIN,
    auth0ClientId: process.env.AUTH0_CLIENT_ID,
    auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET,
    auth0Audience: process.env.AUTH0_AUDIENCE,
};
const currentUserId = process.env.CURRENT_USER_ID;
const nodeService = new NodeService(mcpConfig);
nodeService.setCurrentUserId(currentUserId);
// Create the MCP server
const server = new McpServer({ name: "mew-mcp", version: "1.0.1" });
// Tools
server.tool("getCurrentUser", {}, async () => ({
    content: [
        { type: "text", text: JSON.stringify(nodeService.getCurrentUser()) },
    ],
}));
server.tool("findNodeByText", { parentNodeId: z.string(), nodeText: z.string() }, async ({ parentNodeId, nodeText }) => {
    const result = await nodeService.findNodeByText({
        parentNodeId,
        nodeText,
    });
    return {
        content: [{ type: "text", text: JSON.stringify(result || null) }],
    };
});
server.tool("getChildNodes", { parentNodeId: z.string() }, async ({ parentNodeId }) => {
    const result = await nodeService.getChildNodes({ parentNodeId });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
});
server.tool("getLayerData", { objectIds: z.array(z.string()) }, async ({ objectIds }) => {
    const result = await nodeService.getLayerData(objectIds);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
});
server.tool("updateNode", { nodeId: z.string(), updates: z.record(z.any()) }, async ({ nodeId, updates }) => {
    await nodeService.updateNode(nodeId, updates);
    return {
        content: [
            { type: "text", text: JSON.stringify({ success: true }) },
        ],
    };
});
server.tool("deleteNode", { nodeId: z.string() }, async ({ nodeId }) => {
    await nodeService.deleteNode(nodeId);
    return {
        content: [{ type: "text", text: JSON.stringify({ success: true }) }],
    };
});
server.tool("addNode", {
    content: z.record(z.any()),
    parentNodeId: z.string().optional(),
    relationLabel: z.string().optional(),
    isChecked: z.boolean().optional(),
    authorId: z.string().optional(),
}, async (params) => {
    const result = await nodeService.addNode(params);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
});
server.tool("getNodeUrl", { nodeId: z.string() }, async ({ nodeId }) => {
    const url = nodeService.getNodeUrl(nodeId);
    return { content: [{ type: "text", text: JSON.stringify({ url }) }] };
});
server.tool("getUserRootNodeId", {}, async () => {
    const rootNodeId = nodeService.getUserRootNodeId();
    return {
        content: [{ type: "text", text: JSON.stringify({ rootNodeId }) }],
    };
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
