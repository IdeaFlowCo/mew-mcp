import { startMCP } from "./core/start.js";
// Port can also be loaded from .env if desired, e.g., process.env.PORT
const port = parseInt(process.env.PORT || "8080", 10);
function main() {
    console.log("[Mew MCP] Executing main function...");
    console.log("[Mew MCP] Starting MCP server...");
    try {
        startMCP({
            port: port,
            // configPath is no longer passed
        });
        console.log(`[Mew MCP] Server init function called, listening on port ${port}`);
    }
    catch (error) {
        console.error("[Mew MCP] CRITICAL: Failed to start MCP server:", error);
        process.exit(1); // Exit if server fails to start
    }
}
main();
process.on("uncaughtException", (error) => {
    console.error("[Mew MCP] CRITICAL: Uncaught Exception details:", error);
    console.error("[Mew MCP] CRITICAL: Uncaught Exception:", error);
    process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
    console.error("[Mew MCP] CRITICAL: Unhandled Rejection details:", reason, promise);
    console.error("[Mew MCP] CRITICAL: Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});
