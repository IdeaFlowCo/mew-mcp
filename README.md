# Mew MCP (Model Context Protocol) Server

This server allows applications like Cursor and Claude Desktop to interface with Mew data using the Model Context Protocol.

## Prerequisites

- Node.js (v16 or higher recommended)
- Access to a Mew instance and the necessary API / Auth0 credentials for that instance.

## How to Use with an MCP Runner (e.g., Claude Desktop)

Most MCP runners (tools that can launch and communicate with MCP servers) use a JSON configuration file to define how to start and interact with MCPs.

**1. Locate your MCP Runner's Configuration File:**

   *   **Claude Desktop:**
        *   On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
        *   On Windows: `%APPDATA%/Claude/claude_desktop_config.json`
   *   **Other Tools (e.g., Cursor):** Refer to their specific documentation for the MCP configuration file location.

**2. Add or Update the Configuration for Mew MCP:**

   Open the JSON configuration file and add an entry for the Mew MCP. If you already have an `mcpServers` object, add "Mew MCP" as a new key within it.

   ```json
   {
     "mcpServers": {
       "Mew MCP": {
         "command": "npx",
         "args": [
           "-y",
           "github:IdeaflowCo/mew-mcp"
         ],
         "env": {
           "CURRENT_USER_ID": "<your_user_id>",
           "BASE_URL": "https://mew-edge.ideaflow.app/api",
           "BASE_NODE_URL": "https://mew-edge.ideaflow.app/",
           "AUTH0_DOMAIN": "ideaflow-mew-dev.us.auth0.com",
           "AUTH0_CLIENT_ID": "<your_auth0_client_id>",
           "AUTH0_CLIENT_SECRET": "<your_auth0_client_secret>",
           "AUTH0_AUDIENCE": "https://ideaflow-mew-dev.us.auth0.com/api/v2/"
         }
       }
     }
   }
   ```

**3. Save the Configuration File.**

**4. Restart Your MCP Runner Tool (Claude Desktop, Cursor, etc.).**

The tool should now be able to start and communicate with your Mew MCP server. The server will run using the environment variables you've defined in the `env` block.

## Local Development and Testing

If you want to work on the Mew MCP server code itself:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/IdeaflowCo/mew-mcp.git `
    cd mew-mcp
    ```

2.  **Install dependencies:**
    ```bash
    yarn install
    # or
    npm install
    ```

3.  **Set up local environment variables:**
    Copy the template `.env.example` file to a new file named `.env`:
    ```bash
    cp .env.example .env
    ```
    Edit your local `.env` file and fill in your actual API credentials and a `CURRENT_USER_ID` suitable for your local testing. **This `.env` file is ignored by git and should never be committed.**
    ```dotenv
    # .env - For local development. DO NOT COMMIT THIS FILE.
    BASE_URL=https://your-dev-mew-api.example.com/v1
    BASE_NODE_URL=https://your-dev-mew-app.example.com/nodes/
    AUTH0_DOMAIN=your-dev-mew-instance.auth0.com
    AUTH0_CLIENT_ID=your_dev_auth0_client_id
    AUTH0_CLIENT_SECRET=your_dev_auth0_client_secret
    AUTH0_AUDIENCE=your_dev_mew_api_audience
    CURRENT_USER_ID=your_local_test_user_id
    PORT=8080 
    ```

4.  **Build the project:**
    ```bash
    yarn build
    # or
    npm run build
    ```

5.  **Run the server locally:**
    ```bash
    node dist/mcp.js
    ```
    The server will start, using the configuration from your local `.env` file.

## Environment Variables Explained

The Mew MCP server relies on the following environment variables:

-   **`CURRENT_USER_ID`** (Required for session context)
    *   Description: The unique identifier for the user whose data is being accessed in the current session.
    *   Provided by: The MCP runner's `env` config (for end-users) or your local `.env` file (for development).
-   **`BASE_URL`** (Required for API communication)
    *   Description: The base URL for the Mew API instance you are targeting.
    *   Provided by: The MCP runner's `env` config or local `.env`.
-   **`BASE_NODE_URL`** (Required for generating node URLs)
    *   Description: The base URL for accessing Mew nodes in a web browser.
    *   Provided by: The MCP runner's `env` config or local `.env`.
-   **`AUTH0_DOMAIN`** (Required for authentication)
    *   Description: The Auth0 domain associated with your Mew instance.
    *   Provided by: The MCP runner's `env` config or local `.env`.
-   **`AUTH0_CLIENT_ID`** (Required for authentication)
    *   Description: The Auth0 Client ID that your MCP server uses to authenticate to the Mew API.
    *   Provided by: The MCP runner's `env` config or local `.env`.
-   **`AUTH0_CLIENT_SECRET`** (Required for authentication)
    *   Description: The Auth0 Client Secret corresponding to the `AUTH0_CLIENT_ID`.
    *   Provided by: The MCP runner's `env` config or local `.env`.
-   **`AUTH0_AUDIENCE`** (Required for authentication)
    *   Description: The API Audience string configured in Auth0 for your Mew API.
    *   Provided by: The MCP runner's `env` config or local `.env`.
-   **`PORT`** (Optional)
    *   Description: The network port on which the MCP server will listen.
    *   Default: `8080`
    *   Provided by: The MCP runner's `env` config or local `.env`.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to get started, submit pull requests, and follow our coding standards. (You'll need to create this file if you want specific contribution guidelines).

## License

This project is licensed under the [YOUR_LICENSE_HERE] License - see the [LICENSE.md](LICENSE.md) file for details. (e.g., MIT, Apache 2.0. You'll need to create this file and choose a license). 