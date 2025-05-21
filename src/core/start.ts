import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import { NodeService } from "../api/nodes.js";
import { MCPConfig } from "../types/node.js"; // Assuming GraphNode is imported if used in updates

// Load environment variables from .env file in the project root
dotenv.config();
console.error(
    "[Mew MCP] [core/start] Environment variables loaded (content omitted for brevity)."
);

interface StartMCPParams {
    port: number;
    // configPath is no longer needed
}

// This interface helps ensure `currentUserId` is expected from the config file.
// interface ExtendedMCPConfig extends MCPConfig {
//     currentUserId: string;
// }

// Utility to handle async route handlers and catch errors
const asyncHandler =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
    (req: Request, res: Response, next: NextFunction) => {
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

export function startMCP({ port }: StartMCPParams): void {
    console.error("[Mew MCP] [core/start.ts] startMCP() function: Entered"); // DEBUG
    console.error(
        "[Mew MCP] [core/start] Initializing MCP server core function called..."
    );
    console.error("[Mew MCP] [core/start] Initializing MCP server core...");

    const requiredEnvVars: string[] = [
        "BASE_URL",
        "BASE_NODE_URL",
        "AUTH0_DOMAIN",
        "AUTH0_CLIENT_ID",
        "AUTH0_CLIENT_SECRET",
        "AUTH0_AUDIENCE",
        "CURRENT_USER_ID",
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

    const mcpConfigFromEnv: MCPConfig = {
        baseUrl: process.env.BASE_URL!,
        baseNodeUrl: process.env.BASE_NODE_URL!,
        auth0Domain: process.env.AUTH0_DOMAIN!,
        auth0ClientId: process.env.AUTH0_CLIENT_ID!,
        auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET!,
        auth0Audience: process.env.AUTH0_AUDIENCE!,
    };

    const currentUserIdFromEnv = process.env.CURRENT_USER_ID!;

    console.error(
        "[Mew MCP] [core/start.ts] startMCP() function: Initializing NodeService..."
    ); // DEBUG
    const nodeService = new NodeService(mcpConfigFromEnv);
    nodeService.setCurrentUserId(currentUserIdFromEnv);
    console.error(
        "[Mew MCP] [core/start.ts] startMCP() function: NodeService initialized."
    ); // DEBUG
    console.error(
        `[Mew MCP] [core/start] NodeService initialized and currentUserId set to: ${process.env.CURRENT_USER_ID}`
    );

    const app = express();
    app.use(express.json());

    // MCP Endpoints
    app.get("/health", (_req: Request, res: Response) => {
        console.error("[Mew MCP] [core/start] Health check endpoint hit.");
        res.status(200).json({
            status: "ok",
            currentUserId: nodeService.getCurrentUser().id,
        });
    });

    app.post(
        "/initialize",
        asyncHandler(async (_req: Request, res: Response) => {
            console.error(
                "[Mew MCP] [core/start] /initialize handler: Entered"
            ); // Added for debugging
            try {
                console.error("[Mew MCP] [core/start] /initialize called.");
                // For now, just acknowledge. Implement actual initialization if needed.
                res.json({
                    success: true,
                    currentUserId: nodeService.getCurrentUser().id,
                });
                console.error(
                    "[Mew MCP] [core/start] /initialize handler: Successfully processed and response sent."
                ); // Added for debugging
            } catch (error: any) {
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
                // Ensure a response is sent even in case of an error, if not already sent
                if (!res.headersSent) {
                    res.status(500).json({
                        error: "Critical error during initialize",
                        details: error.message,
                    });
                }
            }
        })
    );

    app.post(
        "/getCurrentUser",
        asyncHandler(async (_req: Request, res: Response) => {
            console.error("[Mew MCP] [core/start] /getCurrentUser called.");
            res.json(nodeService.getCurrentUser());
        })
    );

    app.post(
        "/findNodeByText",
        asyncHandler(async (req: Request, res: Response) => {
            const { parentNodeId, nodeText } = req.body;
            if (
                typeof parentNodeId !== "string" ||
                typeof nodeText !== "string"
            ) {
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
        })
    );

    app.post(
        "/getChildNodes",
        asyncHandler(async (req: Request, res: Response) => {
            const { parentNodeId } = req.body;
            if (typeof parentNodeId !== "string") {
                res.status(400).json({
                    error: "parentNodeId must be a string",
                });
                return;
            }
            const result = await nodeService.getChildNodes({ parentNodeId });
            res.json(result);
        })
    );

    app.post(
        "/getLayerData",
        asyncHandler(async (req: Request, res: Response) => {
            const { objectIds } = req.body;
            if (
                !Array.isArray(objectIds) ||
                !objectIds.every((id) => typeof id === "string")
            ) {
                res.status(400).json({
                    error: "objectIds must be an array of strings",
                });
                return;
            }
            const result = await nodeService.getLayerData(objectIds);
            res.json(result);
        })
    );

    app.post(
        "/updateNode",
        asyncHandler(async (req: Request, res: Response) => {
            const { nodeId, updates } = req.body;
            if (
                typeof nodeId !== "string" ||
                typeof updates !== "object" ||
                updates === null
            ) {
                res.status(400).json({
                    error: "nodeId must be a string and updates must be an object",
                });
                return;
            }
            await nodeService.updateNode(nodeId, updates);
            res.json({ success: true });
        })
    );

    app.post(
        "/deleteNode",
        asyncHandler(async (req: Request, res: Response) => {
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
        asyncHandler(async (req: Request, res: Response) => {
            const {
                content,
                parentNodeId,
                relationLabel,
                isChecked,
                authorId,
            } = req.body;
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
        })
    );

    app.post(
        "/getNodeUrl",
        asyncHandler(async (req: Request, res: Response) => {
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
        asyncHandler(async (_req: Request, res: Response) => {
            console.error("[Mew MCP] [core/start] /getUserRootNodeId called.");
            try {
                const rootNodeId = nodeService.getUserRootNodeId();
                res.json({ rootNodeId });
            } catch (error: any) {
                console.error(
                    "[Mew MCP] [core/start] Error in /getUserRootNodeId:",
                    error.message
                );
                res.status(500).json({
                    error: "Failed to get user root node ID",
                    details: error.message,
                });
            }
        })
    );

    // Catch-all for unhandled routes - must be after all other routes
    app.use((_req: Request, res: Response) => {
        console.error(
            `[Mew MCP] [core/start] Unhandled route: ${_req.originalUrl}`
        );
        res.status(404).json({ error: "Not Found" });
    });

    // Generic error handler - must be last middleware
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        console.error("[Mew MCP] [core/start] Unhandled Express error:", err);
        if (!res.headersSent) {
            res.status(500).json({
                error: "Internal Server Error",
                details: err.message,
            });
        }
    });

    console.error(
        "[Mew MCP] [core/start.ts] startMCP() function: About to call app.listen()."
    ); // DEBUG
    app.listen(port, () => {
        console.error(
            "[Mew MCP] [core/start.ts] app.listen() callback: Server started successfully on port",
            port
        ); // DEBUG
        console.error(
            `[Mew MCP] [core/start] Server listening on http://localhost:${port}`
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
        console.error("  POST /getUserRootNodeId"); // New endpoint
        console.error("  GET  /health");
    }).on("error", (err: Error) => {
        console.error(
            "[Mew MCP] [core/start.ts] CRITICAL: Express server app.listen() emitted error event."
        ); // DEBUG
        console.error(
            "[Mew MCP] [core/start] CRITICAL: Express server failed to start or crashed. Error details:",
            err,
            err.stack
        );
        // It's crucial to also log name and message if they are not part of the default err.toString()
        console.error(
            "[Mew MCP] [core/start.ts] CRITICAL: Error Name:",
            err.name
        ); // DEBUG
        console.error(
            "[Mew MCP] [core/start.ts] CRITICAL: Error Message:",
            err.message
        ); // DEBUG
        throw err; // Re-throw to be caught by global handlers in mcp.ts if not already handled
    });

    console.error(
        "[Mew MCP] [core/start.ts] startMCP() function: app.listen() called, setup supposedly complete."
    ); // DEBUG
    console.error(
        "[Mew MCP] [core/start] MCP server core initialization complete. Waiting for requests..."
    );
    console.error(
        "[Mew MCP] [core/start] MCP server core initialization complete."
    );
}
