import { startMCP } from "./core/start";
// Port can also be loaded from .env if desired, e.g., process.env.PORT
const port = parseInt(process.env.PORT || "8080", 10);
startMCP({
    port: port,
    // configPath is no longer passed
});
