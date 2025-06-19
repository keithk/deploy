# Configuration

DialUpDeploy uses configuration files to manage both global and site-specific settings. The standardized configuration structure provides a cleaner organization for configuration files and actions.

---

## 🌐 Configuration Structure

DialUpDeploy uses a standardized configuration structure:

```mermaid
graph TD
    A[Project Root] --> B[deploy.json]
    A --> C[sites/]
    C --> D[site1/]
    C --> E[site2/]
    D --> F[.deploy/]
    D --> G[deploy.json]
    F --> H[config.json]
    F --> I[actions/]
    E --> J[.deploy/]
    J --> K[config.json]
    J --> L[actions/]
```

### Project Configuration

The project-level configuration is stored in `deploy.json` at the project root:

```json
{
  "actions": {
    "enabled": true,
    "webhookPath": "/webhook"
  },
  "github": {
    "repository": "username/deploy",
    "branch": "main",
    "secret": "your-github-webhook-secret"
  }
}
```

### Site Configuration

Each site has its own configuration in `sites/[site-name]/.deploy/config.json` (preferred) or `sites/[site-name]/deploy.json` (fallback):

```json
{
  "type": "static-build",
  "buildDir": "dist",
  "default": true,
  "bskyDid": "did:plc:t3ehyucfy7ofylu4spnivvmb"
}
```

## 📋 Configuration Loading Order

When the system loads configuration files, it follows this order:

```mermaid
graph TD
    A[Root Config Loading] --> B{Check deploy.json}
    B -->|Exists| C[Load from deploy.json]
    B -->|Not Found| D[Use default configuration]

    E[Site Config Loading] --> F{Check .deploy/config.json}
    F -->|Exists| G[Load from .deploy/config.json]
    F -->|Not Found| H{Check deploy.json}
    H -->|Exists| I[Load from deploy.json]
    H -->|Not Found| J[Use default configuration]

    K[Action Discovery] --> L{Check .deploy/actions}
    L -->|Exists| M[Load actions from .deploy/actions]
    L -->|Not Found| N{Check actions directory}
    N -->|Exists| O[Load actions from actions directory]
    N -->|Not Found| P[No actions found]
```

This loading order provides a clear configuration hierarchy with fallback options for flexibility.

---

## ⚙️ Configuration Options

### Root Config Options

- `actions`: Global actions configuration
  - `enabled`: Whether actions are enabled system-wide
  - `webhookPath`: Base path for webhook endpoints
- `github`: GitHub integration for the entire system
  - `repository`: GitHub repository name (username/repo)
  - `branch`: Branch to monitor for changes
  - `secret`: Webhook secret for GitHub authentication

### Site Config Options

- `type`: The type of site ("static", "dynamic", "passthrough", or "static-build")
- `buildDir`: For static-build sites, the directory where built files are output
- `devPort`: For static-build sites, the port for the dev server
- `proxyPort`: For passthrough sites, the port to proxy to
- `entryPoint`: For dynamic sites, the entry point file (without extension)
- `commands`: Custom build/dev/start commands (can also be inferred from package.json)
- `subdomain`: The subdomain for this site (defaults to directory name)
- `customDomain`: Optional custom domain for this site
- `default`: Whether this site is the default site served at the root domain
- `bskyDid`: Optional Bluesky atproto DID for this site

---

## 🔗 Related

- [Site Types](site-types.md)
- [Actions](actions.md) - For details on configuring actions
- [Custom Domains](custom-domains.md)
- [Extras](extras.md)
