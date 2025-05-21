console.error("[Mew MCP] [mcp.ts] Script execution started."); // DEBUG

import { startMCP } from "./core/start.js";

// Port can also be loaded from .env if desired, e.g., process.env.PORT
const port = parseInt(process.env.PORT || "8080", 10);
console.error(`[Mew MCP] [mcp.ts] Port configured: ${port}`); // DEBUG

function main() {
    console.error("[Mew MCP] [mcp.ts] main() function: Entered"); // DEBUG
    console.error("[Mew MCP] Executing main function...");
    console.error("[Mew MCP] Starting MCP server...");
    try {
        console.error(
            "[Mew MCP] [mcp.ts] main() function: Calling startMCP..."
        ); // DEBUG
        startMCP({
            port: port,
            // configPath is no longer passed
        });
        console.error(
            `[Mew MCP] Server init function called, listening on port ${port}`
        );
        console.error(
            "[Mew MCP] [mcp.ts] main() function: startMCP call completed."
        ); // DEBUG
    } catch (error: any) {
        // Added type annotation for error
        console.error(
            "[Mew MCP] CRITICAL: Failed to start MCP server in main():",
            error
        );
        console.error("[Mew MCP] CRITICAL: Error Name:", error.name);
        console.error("[Mew MCP] CRITICAL: Error Message:", error.message);
        console.error("[Mew MCP] CRITICAL: Error Stack:", error.stack);
        process.exit(1); // Exit if server fails to start
    }
}

console.error("[Mew MCP] [mcp.ts] Calling main()..."); // DEBUG
try {
    main();
    console.error(
        "[Mew MCP] [mcp.ts] main() call completed successfully (synchronous part)."
    ); // DEBUG
} catch (e) {
    console.error(
        "[Mew MCP] [mcp.ts] CRITICAL SYNCHRONOUS ERROR IN MAIN EXECUTION:",
        e
    );
    if (e instanceof Error) {
        console.error("[Mew MCP] [mcp.ts] Main Exec Error Name:", e.name);
        console.error("[Mew MCP] [mcp.ts] Main Exec Error Message:", e.message);
        console.error("[Mew MCP] [mcp.ts] Main Exec Error Stack:", e.stack);
    }
    process.exit(1);
}
console.error("[Mew MCP] [mcp.ts] main() call completed (after try-catch)."); // DEBUG

process.on("uncaughtException", (error) => {
    console.error("[Mew MCP] [mcp.ts] uncaughtException HANDLER ENTERED."); // Simplest possible first log
    console.error("[Mew MCP] [mcp.ts] Uncaught Exception object:", error); // Log the raw object
    // Fallback logging if properties are missing
    const name =
        error && typeof error === "object" && "name" in error
            ? String(error.name)
            : "N/A";
    const message =
        error && typeof error === "object" && "message" in error
            ? String(error.message)
            : "N/A";
    const stack =
        error && typeof error === "object" && "stack" in error
            ? String(error.stack)
            : "N/A";
    console.error(
        `[Mew MCP] [mcp.ts] Uncaught Exception Details: Name: ${name}, Message: ${message}`
    );
    console.error("[Mew MCP] [mcp.ts] Uncaught Exception Stack:", stack);
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("[Mew MCP] [mcp.ts] unhandledRejection HANDLER ENTERED."); // Simplest possible first log
    console.error("[Mew MCP] [mcp.ts] Unhandled Rejection Reason:", reason);
    console.error("[Mew MCP] [mcp.ts] Unhandled Rejection Promise:", promise);
    // If reason is an Error object, log its stack as well
    if (reason instanceof Error) {
        console.error(
            "[Mew MCP] [mcp.ts] Unhandled Rejection Reason Stack:",
            reason.stack
        );
    } else {
        console.error(
            "[Mew MCP] [mcp.ts] Unhandled Rejection Reason (not an Error instance):",
            String(reason)
        );
    }
    process.exit(1);
});
