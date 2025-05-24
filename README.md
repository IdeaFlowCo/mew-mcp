# Mew MCP - Cognitive Prosthetics for Claude

A sophisticated Model Context Protocol server that transforms Claude into a powerful cognitive partner for building and exploring knowledge graphs. This toolkit provides Claude with massive context loading, natural thinking capture, and intelligent knowledge navigation capabilities.

## 🧠 Cognitive Architecture

Mew MCP offers Claude a complete cognitive toolkit for human-AI knowledge collaboration:

### **🗺️ Structure & Navigation**
- **`mapStructure`** - Loads massive knowledge trees (12 levels deep, 200+ nodes) as beautiful file-tree visualizations
- **`previewContent`** - Content-focused view showing actual text and relationships with adaptive depth/breadth
- **`moveNodes`** - Bulk reorganization tool for restructuring entire sections of your knowledge base

### **💭 Natural Thinking Capture**  
- **`claudeThinkTree`** - Natural thinking in markdown with unlimited hierarchies and custom relationship connectors
  ```markdown
  First insight about bottlenecks
    → evidence: Supporting data here
    → but: Important caveat
    breakthrough: Major realization
      actually: Correction to my thinking
  Second insight about coordination
  ```

### **🕸️ Semantic Web Building**
- **`claudeCreateRelation`** - Create semantic connections between any nodes beyond hierarchical structure
- **`bulkExpandForClaude`** - Foundation method providing massive context (2000+ nodes) for deep understanding

### **📊 Knowledge Space Access**
- **`getGlobalNotes`** / **`getClaudeNotes`** / **`getUserNotes`** - Access different knowledge spaces
- **`getChildNodes`** / **`findNodeByText`** - Precise navigation and discovery
- **`addNode`** / **`updateNode`** / **`deleteNode`** - Full CRUD operations

## 🚀 Quick Start

### For Claude Desktop Users

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "Mew MCP": {
      "command": "npx",
      "args": ["-y", "mew-mcp@latest"],
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

**Configuration locations:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

## 🛠️ Development

### Local Setup

```bash
git clone https://github.com/IdeaflowCo/mew-mcp.git
cd mew-mcp
npm install
```

### Environment Configuration

Create `.env` file:
```bash
cp .env.example .env
```

Configure your `.env`:
```dotenv
BASE_URL=https://your-mew-api.example.com/api
BASE_NODE_URL=https://your-mew-app.example.com/
AUTH0_DOMAIN=your-instance.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_AUDIENCE=your_api_audience
CURRENT_USER_ID=your_user_id
```

### Build & Run

```bash
npm run build
npm run start:mcp
```

## 🧩 Architecture Details

### Massive Context Loading
The `bulkExpandForClaude` method uses aggressive BFS (Breadth-First Search) expansion with intelligent limits:
- **12 levels deep** maximum traversal
- **200 nodes per level** breadth limiting  
- **2000 total nodes** safety cap
- **Cycle detection** prevents infinite recursion
- **Graceful fallbacks** ensure reliability

### Adaptive Algorithms
Tools like `previewContent` use context-aware strategies:
- **Global spaces:** Prioritize breadth (wide but shallow)
- **User spaces:** Balanced approach (moderate depth/breadth)
- **Specific nodes:** Depth-first (narrow but deep)

### Natural Thinking Parser
`claudeThinkTree` recognizes natural connectors:
- `→ flows_to` / `→ evidence:` / `→ but:`
- `breakthrough:` / `tentative:` / `critical:`
- `actually:` / `hmm:` / `but wait:`

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CURRENT_USER_ID` | User identifier for session context | ✅ |
| `BASE_URL` | Mew API base URL | ✅ |
| `BASE_NODE_URL` | Node web interface base URL | ✅ |
| `AUTH0_DOMAIN` | Auth0 domain for authentication | ✅ |
| `AUTH0_CLIENT_ID` | Auth0 client identifier | ✅ |
| `AUTH0_CLIENT_SECRET` | Auth0 client secret | ✅ |
| `AUTH0_AUDIENCE` | Auth0 API audience | ✅ |

## 🎯 Use Cases

**For Researchers:** Navigate vast literature graphs, connect ideas across domains, capture insights with natural relationship mapping.

**For Writers:** Build interconnected story worlds, track character relationships, organize research with semantic connections.

**For Developers:** Map codebase architectures, trace dependency relationships, document system knowledge with hierarchical thinking.

**For Teams:** Collaborative knowledge building, shared mental models, persistent institutional memory.

## 🔄 Version History

- **v1.1.45** - Complete cognitive toolkit with bulk operations
- **v1.1.44** - Added semantic relationship creation
- **v1.1.43** - Restored natural thinking and content preview tools  
- **v1.1.42** - Removed deprecated tools, fixed protocol issues
- **v1.1.26** - Last stable version before feature development

## 🤝 Contributing

We welcome contributions! This project represents cutting-edge human-AI cognitive collaboration. Whether you're improving algorithms, adding new cognitive tools, or enhancing the thinking capture mechanisms, your contributions help push the boundaries of augmented intelligence.

## 📄 License

MIT License - see [LICENSE.md](LICENSE.md) for details.

---

*Built for the future of human-AI cognitive partnership* 🤖🧠