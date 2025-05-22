# Mew MCP (Model Context Protocol) Server

Version: 1.0.25

This server allows applications like Cursor and Claude Desktop to interface with Mew data using the Model Context Protocol. It connects to your Mew instance, enabling you to interact with your Mew notes and graph data programmatically.

## Prerequisites

-   Node.js (v16 or higher recommended)
-   An active Mew account and the necessary API / Auth0 credentials for your Mew instance.

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
            "mew-mcp@latest"
          ],
          "env": {
            "CURRENT_USER_ID": "<your_auth_provider|user_identifier>", // eg "google-oauth2|123456789", found in user root url
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
    **Note on Placeholders:**
    - Replace `<your_auth_provider|user_identifier>` with your actual Mew user ID (e.g., `google-oauth2|123...` or `auth0|abc...`).
    - Replace `<your_auth0_client_id>` and `<your_auth0_client_secret>` with the credentials for an Auth0 Machine-to-Machine application authorized for your Mew API.
    - The `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are common values for some Mew setups but may need to be changed if your Mew instance uses a different Auth0 configuration.

**3. Save the Configuration File.**

**4. Restart Your MCP Runner Tool (Claude Desktop, Cursor, etc.).**

The tool should now be able to start and communicate with your Mew MCP server.

## Local Development and Testing

If you want to work on the Mew MCP server code itself:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/IdeaflowCo/mew-mcp.git
    cd mew-mcp
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up local environment variables:**
    Copy the template `.env.example` file to a new file named `.env` (this file is already in your `.gitignore`):
    ```bash
    cp .env.example .env
    ```
    Edit your local `.env` file and fill in your actual API credentials and a `CURRENT_USER_ID` suitable for your local testing. **This `.env` file is ignored by git and should never be committed.**
    ```dotenv
    # .env - For local development. DO NOT COMMIT THIS FILE.
    BASE_URL=https://mew-edge.ideaflow.app/api
    BASE_NODE_URL=https://mew-edge.ideaflow.app/
    AUTH0_DOMAIN=ideaflow-mew-dev.us.auth0.com
    AUTH0_CLIENT_ID=your_dev_auth0_client_id_placeholder
    AUTH0_CLIENT_SECRET=your_dev_auth0_client_secret_placeholder
    AUTH0_AUDIENCE=https://ideaflow-mew-dev.us.auth0.com/api/v2/
    CURRENT_USER_ID=your_local_test_auth_provider|user_id_placeholder
    ```

4.  **Build the project:**
    ```bash
    npm run build
    ```

5.  **Run the server locally:**
    ```bash
    node dist/mcp.js
    ```
    The server will start, using the configuration from your local `.env` file.

## Environment Variables Explained

The Mew MCP server relies on the following environment variables:

-   **`CURRENT_USER_ID`** (Required)
    *   Description: The unique authentication identifier for the user whose data is being accessed. This ID is typically provided by an authentication provider and includes a prefix (e.g., `google-oauth2|xxxxxxxxxxx` or `auth0|yyyyyyyyyyy`).
    *   **Default Parent Node Derivation:** When adding new nodes without an explicit `parentNodeId` parameter in the `addNode` tool, `mew-mcp` will automatically construct a default parent node ID by prepending `"user-root-id-"` to this `CURRENT_USER_ID` (e.g., `user-root-id-google-oauth2|xxxxxxxxxxx`). Ensure this derived ID corresponds to the actual root node in Mew where you want items to be created by default.
    *   Provided by: The MCP runner's `env` config (for end-users) or your local `.env` file (for development).
-   **`BASE_URL`** (Required)
    *   Description: The base URL for the Mew API instance you are targeting (e.g., `https://mew-edge.ideaflow.app/api`).
    *   Provided by: The MCP runner's `env` config or local `.env`.
-   **`BASE_NODE_URL`** (Required)
    *   Description: The base URL for accessing Mew nodes in a web browser (e.g., `https://mew-edge.ideaflow.app/`). Used for generating URLs via the `getNodeUrl` tool.
    *   Provided by: The MCP runner's `env` config or local `.env`.
-   **`AUTH0_DOMAIN`** (Required)
    *   Description: The Auth0 domain associated with your Mew instance (e.g., `ideaflow-mew-dev.us.auth0.com`).
    *   Provided by: The MCP runner's `env` config or local `.env`.
-   **`AUTH0_CLIENT_ID`** (Required)
    *   Description: The Auth0 Client ID that your MCP server uses to authenticate to the Mew API. This should correspond to an Auth0 Machine-to-Machine (M2M) application.
    *   Provided by: The MCP runner's `env` config or local `.env`.
-   **`AUTH0_CLIENT_SECRET`** (Required)
    *   Description: The Auth0 Client Secret corresponding to the `AUTH0_CLIENT_ID`.
    *   Provided by: The MCP runner's `env` config or local `.env`.
-   **`AUTH0_AUDIENCE`** (Required)
    *   Description: The API Audience string configured in Auth0 for your Mew API (e.g., `https://ideaflow-mew-dev.us.auth0.com/api/v2/`).
    *   Provided by: The MCP runner's `env` config or local `.env`.

## Tools Provided

The `mew-mcp` server exposes the following tools for interaction:

-   **`getCurrentUser()`**:
    *   Description: Retrieves the authentication ID of the current user (e.g., `google-oauth2|xxx`). This is typically used for associating actions with a user account or for API authorization, not directly as a graph node ID for parenting notes.
    *   Input: None
    *   Returns: `{ id: string }`
-   **`getUserNotesRootId()`**:
    *   Description: Retrieves the specific graph node ID for the current user's main notes container or root space (e.g., `user-root-id-google-oauth2|xxx`). Use this ID as `parentNodeId` for operations like `getChildNodes` or `addNode` to interact with top-level user notes.
    *   Input: None
    *   Returns: `{ id: string }`
-   **`findNodeByText({ parentNodeId: string, nodeText: string })`**:
    *   Description: Finds the first child node under a given `parentNodeId` that has an exact text match with `nodeText`.
    *   Returns: The matching `GraphNode` object or `null` if not found.
-   **`getChildNodes({ parentNodeId: string })`**:
    *   Description: Retrieves the direct child nodes of a given `parentNodeId`. To list top-level notes, use the ID returned by `getUserNotesRootId()` as the `parentNodeId`.
    *   Returns: `{ parentNode: GraphNode, childNodes: GraphNode[] }`
-   **`getLayerData({ objectIds: string[] })`**:
    *   Description: Fetches detailed data for a list of specified object IDs (nodes or relations).
    *   Returns: The layer data payload from the Mew API.
-   **`updateNode({ nodeId: string, updates: Record<string, any> })`**:
    *   Description: Updates an existing Mew node with the provided partial data.
    *   Returns: `{ success: true }` on successful update.
-   **`deleteNode({ nodeId: string })`**:
    *   Description: Deletes a Mew node.
    *   Returns: `{ success: true }` on successful deletion.
-   **`addNode({ content: Record<string, any>, parentNodeId?: string, relationLabel?: string, isChecked?: boolean, authorId?: string })`**:
    *   Description: Adds a new Mew node.
        *   `content`: The content of the new node (e.g., `{ "text": "My new note" }`).
        *   `parentNodeId` (Optional): The ID of the parent node. If not provided, defaults to the ID returned by `getUserNotesRootId()` (i.e., `"user-root-id-" + CURRENT_USER_ID`).
        *   `relationLabel` (Optional): A label for the relationship to the parent.
        *   `isChecked` (Optional): Sets the checked state (e.g., for tasks).
        *   `authorId` (Optional): The author ID for the node. Defaults to the `CURRENT_USER_ID`.
    *   Returns: Information about the newly created node and its relations (e.g., `{ newNodeId: string, ... }`).
-   **`getNodeUrl({ nodeId: string })`**:
    *   Description: Constructs the web URL for a given Mew node ID.
    *   Returns: `{ url: string }`

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/IdeaflowCo/mew-mcp).

## License

This project is licensed under the ISC License - see the [LICENSE.md](LICENSE.md) file for details. 