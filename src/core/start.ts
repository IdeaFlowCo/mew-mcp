import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { NodeService } from "../api/nodes";
import { MCPConfig, NodeContent, GraphNode } from "../types/node"; // Assuming GraphNode is imported if used in updates

// Load environment variables from .env file in the project root
dotenv.config();

interface StartMCPParams {
    port: number;
    // configPath is no longer needed
}

// This interface helps ensure `currentUserId` is expected from the config file.
// interface ExtendedMCPConfig extends MCPConfig {
//     currentUserId: string;
// }

export function startMCP({ port }: StartMCPParams): void {
    const requiredEnvVars: string[] = [
        "BASE_URL",
        "BASE_NODE_URL",
        "AUTH0_DOMAIN",
        "AUTH0_CLIENT_ID",
        "AUTH0_CLIENT_SECRET",
        "AUTH0_AUDIENCE",
        "CURRENT_USER_ID",
    ];

    const missingVars = requiredEnvVars.filter(
        (varName) => !process.env[varName]
    );

    if (missingVars.length > 0) {
        console.error(
            `Error: Missing required environment variables: ${missingVars.join(", ")}`
        );
        console.error(
            `Please ensure they are set in your .env file or system environment.`
        );
        process.exit(1);
    }

    const mcpConfigFromEnv: MCPConfig = {
        baseUrl: process.env.BASE_URL!,
        baseNodeUrl: process.env.BASE_NODE_URL!,
        auth0Domain: process.env.AUTH0_DOMAIN!,
        auth0ClientId: process.env.AUTH0_CLIENT_ID!,
        auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET!,
        auth0Audience: process.env.AUTH0_AUDIENCE!,
    };

    const currentUserIdFromEnv = process.env.CURRENT_USER_ID!;

    const nodeService = new NodeService(mcpConfigFromEnv);
    nodeService.setCurrentUserId(currentUserIdFromEnv);

    const app = express();
    app.use(express.json());

    const asyncHandler =
        (fn: (req: Request, res: Response) => Promise<void>) =>
        (req: Request, res: Response) => {
            fn(req, res).catch((err) => {
                console.error("Error in request handler:", err);
                const errorMessage =
                    err instanceof Error ? err.message : "Unknown server error";
                const errorStack = err instanceof Error ? err.stack : undefined;
                res.status(500).json({
                    error: errorMessage,
                    details: errorStack,
                });
            });
        };

    app.post(
        "/findNodeByText",
        asyncHandler(async (req, res) => {
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
        asyncHandler(async (req, res) => {
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
        asyncHandler(async (req, res) => {
            const { objectIds } = req.body;
            if (
                !Array.isArray(objectIds) ||
                objectIds.some((id) => typeof id !== "string")
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
        asyncHandler(async (req, res) => {
            const { nodeId, updates } = req.body as {
                nodeId: string;
                updates: Partial<GraphNode>;
            };
            if (
                typeof nodeId !== "string" ||
                typeof updates !== "object" ||
                updates === null
            ) {
                res.status(400).json({
                    error: "nodeId (string) and updates (object) are required",
                });
                return;
            }
            await nodeService.updateNode(nodeId, updates);
            res.status(200).json({ message: "Node updated successfully" });
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
            res.status(200).json({ message: "Node deleted successfully" });
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
                authorId,
            } = req.body as {
                content: NodeContent;
                parentNodeId?: string;
                relationLabel?: string;
                isChecked?: boolean;
                authorId?: string;
            };
            if (typeof content !== "object" || content === null) {
                res.status(400).json({ error: "content (object) is required" });
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

    app.get("/health", (_req: Request, res: Response) => {
        res.status(200).json({
            status: "ok",
            timestamp: new Date().toISOString(),
            user: currentUserIdFromEnv, // Optionally confirm which user's config is loaded
        });
    });

    app.listen(port, () => {
        console.log(`Mew MCP server listening on http://localhost:${port}`);
        console.log(
            `Configuration loaded from .env file (or system environment variables).`
        );
        console.log(
            `Current User ID for MCP operations: ${currentUserIdFromEnv}`
        );
        console.log("Available endpoints:");
        console.log("  POST /findNodeByText { parentNodeId, nodeText }");
        console.log("  POST /getChildNodes { parentNodeId }");
        console.log("  POST /getLayerData { objectIds }");
        console.log("  POST /updateNode { nodeId, updates }");
        console.log("  POST /deleteNode { nodeId }");
        console.log(
            "  POST /addNode { content, parentNodeId?, relationLabel?, isChecked?, authorId? }"
        );
        console.log("  POST /getNodeUrl { nodeId }");
        console.log("  GET  /health");
    });
}
