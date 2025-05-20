import express from "express";
import dotenv from "dotenv";
import { NodeService } from "../api/nodes.js";
// Load environment variables from .env file in the project root
dotenv.config();
console.log("[Mew MCP] [core/start] Environment variables loaded:", process.env);
// This interface helps ensure `currentUserId` is expected from the config file.
// interface ExtendedMCPConfig extends MCPConfig {
//     currentUserId: string;
// }
// Utility to handle async route handlers and catch errors
const asyncHandler = (fn) => (req, res, next) => {
    console.log(`[Mew MCP] [core/start] Request to ${req.originalUrl} with body:`, req.body);
    Promise.resolve(fn(req, res, next)).catch((err) => {
        console.error(`[Mew MCP] [core/start] Error in asyncHandler for ${req.originalUrl}:`, err, "Error details:", err.stack);
        // Ensure a response is sent for unhandled errors within async handlers
        if (!res.headersSent) {
            res.status(500).json({
                error: "Internal server error from asyncHandler",
                details: err.message,
            });
        }
        // next(err); // Optionally pass to a more generic Express error handler if you have one
    });
};
export function startMCP({ port }) {
    console.log("[Mew MCP] [core/start] Initializing MCP server core function called...");
    console.log("[Mew MCP] [core/start] Initializing MCP server core...");
    const requiredEnvVars = [
        "BASE_URL",
        "BASE_NODE_URL",
        "AUTH0_DOMAIN",
        "AUTH0_CLIENT_ID",
        "AUTH0_CLIENT_SECRET",
        "AUTH0_AUDIENCE",
        "CURRENT_USER_ID",
    ];
    const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);
    if (missingEnvVars.length > 0) {
        console.error("[Mew MCP] [core/start] CRITICAL: Missing required environment variables:", missingEnvVars.join(", "));
        throw new Error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
    }
    console.log("[Mew MCP] [core/start] All required environment variables are present.");
    const mcpConfigFromEnv = {
        baseUrl: process.env.BASE_URL,
        baseNodeUrl: process.env.BASE_NODE_URL,
        auth0Domain: process.env.AUTH0_DOMAIN,
        auth0ClientId: process.env.AUTH0_CLIENT_ID,
        auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET,
        auth0Audience: process.env.AUTH0_AUDIENCE,
    };
    const currentUserIdFromEnv = process.env.CURRENT_USER_ID;
    const nodeService = new NodeService(mcpConfigFromEnv);
    nodeService.setCurrentUserId(currentUserIdFromEnv);
    console.log(`[Mew MCP] [core/start] NodeService initialized and currentUserId set to: ${process.env.CURRENT_USER_ID}`);
    const app = express();
    app.use(express.json());
    // MCP Endpoints
    app.get("/health", (_req, res) => {
        console.log("[Mew MCP] [core/start] Health check endpoint hit.");
        res.status(200).json({
            status: "ok",
            currentUserId: nodeService.getCurrentUser().id,
        });
    });
    app.post("/initialize", asyncHandler(async (_req, res) => {
        console.log("[Mew MCP] [core/start] /initialize called.");
        // For now, just acknowledge. Implement actual initialization if needed.
        res.json({
            success: true,
            currentUserId: nodeService.getCurrentUser().id,
        });
    }));
    app.post("/getCurrentUser", asyncHandler(async (_req, res) => {
        console.log("[Mew MCP] [core/start] /getCurrentUser called.");
        res.json(nodeService.getCurrentUser());
    }));
    app.post("/findNodeByText", asyncHandler(async (req, res) => {
        const { parentNodeId, nodeText } = req.body;
        if (typeof parentNodeId !== "string" ||
            typeof nodeText !== "string") {
            res.status(400).json({
                error: "parentNodeId and nodeText must be strings",
            });
            return;
        }
        const result = await nodeService.findNodeByText({
            parentNodeId,
            nodeText,
        });
        res.json(result || null);
    }));
    app.post("/getChildNodes", asyncHandler(async (req, res) => {
        const { parentNodeId } = req.body;
        if (typeof parentNodeId !== "string") {
            res.status(400).json({
                error: "parentNodeId must be a string",
            });
            return;
        }
        const result = await nodeService.getChildNodes({ parentNodeId });
        res.json(result);
    }));
    app.post("/getLayerData", asyncHandler(async (req, res) => {
        const { objectIds } = req.body;
        if (!Array.isArray(objectIds) ||
            !objectIds.every((id) => typeof id === "string")) {
            res.status(400).json({
                error: "objectIds must be an array of strings",
            });
            return;
        }
        const result = await nodeService.getLayerData(objectIds);
        res.json(result);
    }));
    app.post("/updateNode", asyncHandler(async (req, res) => {
        const { nodeId, updates } = req.body;
        if (typeof nodeId !== "string" ||
            typeof updates !== "object" ||
            updates === null) {
            res.status(400).json({
                error: "nodeId must be a string and updates must be an object",
            });
            return;
        }
        await nodeService.updateNode(nodeId, updates);
        res.json({ success: true });
    }));
    app.post("/deleteNode", asyncHandler(async (req, res) => {
        const { nodeId } = req.body;
        if (typeof nodeId !== "string") {
            res.status(400).json({ error: "nodeId must be a string" });
            return;
        }
        await nodeService.deleteNode(nodeId);
        res.json({ success: true });
    }));
    app.post("/addNode", asyncHandler(async (req, res) => {
        const { content, parentNodeId, relationLabel, isChecked, authorId, } = req.body;
        // Basic validation - extend as needed
        if (typeof content !== "object" || content === null) {
            res.status(400).json({ error: "content must be an object" });
            return;
        }
        const result = await nodeService.addNode({
            content,
            parentNodeId,
            relationLabel,
            isChecked,
            authorId,
        });
        res.json(result);
    }));
    app.post("/getNodeUrl", asyncHandler(async (req, res) => {
        const { nodeId } = req.body;
        if (typeof nodeId !== "string") {
            res.status(400).json({ error: "nodeId must be a string" });
            return;
        }
        const url = nodeService.getNodeUrl(nodeId);
        res.json({ url });
    }));
    // Catch-all for unhandled routes - must be after all other routes
    app.use((_req, res) => {
        console.error(`[Mew MCP] [core/start] Unhandled route: ${_req.originalUrl}`);
        res.status(404).json({ error: "Not Found" });
    });
    // Generic error handler - must be last middleware
    app.use((err, _req, res, _next) => {
        console.error("[Mew MCP] [core/start] Unhandled Express error:", err);
        if (!res.headersSent) {
            res.status(500).json({
                error: "Internal Server Error",
                details: err.message,
            });
        }
    });
    app.listen(port, () => {
        console.log(`[Mew MCP] [core/start] Server listening on http://localhost:${port}`);
        console.log(`Configuration loaded from .env file (or system environment variables).`);
        console.log(`Current User ID for MCP operations: ${currentUserIdFromEnv}`);
        console.log("Available endpoints:");
        console.log("  POST /findNodeByText { parentNodeId, nodeText }");
        console.log("  POST /getChildNodes { parentNodeId }");
        console.log("  POST /getLayerData { objectIds }");
        console.log("  POST /updateNode { nodeId, updates }");
        console.log("  POST /deleteNode { nodeId }");
        console.log("  POST /addNode { content, parentNodeId?, relationLabel?, isChecked?, authorId? }");
        console.log("  POST /getNodeUrl { nodeId }");
        console.log("  GET  /health");
    }).on("error", (err) => {
        console.error("[Mew MCP] [core/start] CRITICAL: Express server failed to start or crashed. Error details:", err, err.stack);
        throw err; // Re-throw to be caught by global handlers in mcp.ts if not already handled
    });
    console.log("[Mew MCP] [core/start] MCP server core initialization complete. Waiting for requests...");
    console.log("[Mew MCP] [core/start] MCP server core initialization complete.");
}
