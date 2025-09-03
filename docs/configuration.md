# Configuration: Simple, Powerful, Universal

## 🌟 The Deploy Philosophy: Zero-Config by Default

Deploy is designed to work out of the box with ZERO configuration for most projects. But when you need fine-tuning, our configuration system is powerful and flexible.

## 📂 Configuration Structure

Deploy uses a simple, intuitive configuration hierarchy:

```
project-root/
├── deploy.json          # Global project settings
└── sites/
    ├── site1/
    │   └── .deploy/
    │       └── config.json  # Site-specific configuration
    └── site2/
        └── .deploy/
            └── config.json
```

## 🔧 Configuration Options

### Minimal Configuration Example

```json
{
  "type": "static",
  "subdomain": "mysite"
}
```

That's it! Deploy will handle everything else automatically.

### Comprehensive Configuration

```json
{
  "type": "docker",
  "buildDir": "dist",
  "subdomain": "myapp",
  "customDomain": "app.example.com",
  "dockerFile": "Dockerfile",
  "exposedPort": 3000,
  "environment": {
    "NODE_ENV": "production"
  }
}
```

## 🌈 Supported Site Types

1. **static**: Plain HTML/CSS/JS sites
2. **static-build**: Sites requiring a build step (React, Vue, etc.)
3. **dynamic**: Server-side rendered applications
4. **docker**: Custom Dockerized applications
5. **passthrough**: Proxy to existing services

## 🚀 Configuration Loading Priority

1. Site-specific `.deploy/config.json`
2. Site-specific `deploy.json`
3. Global `deploy.json`
4. Intelligent default configuration

## 🔍 Configuration Options

### Global Configuration (`deploy.json`)

- `actions`: Webhook and system-wide action settings
- `github`: GitHub integration
- `builtInSites`: Admin and editor site configuration

### Site Configuration

- `type`: Site type (static, dynamic, docker, etc.)
- `buildDir`: Output directory for built assets
- `subdomain`: Custom subdomain
- `customDomain`: Primary domain
- `entryPoint`: Entry file for dynamic sites
- `commands`: Custom build/start commands
- `dockerFile`: Path to Dockerfile
- `environment`: Environment variables

## 📦 Docker-Specific Configuration

```json
{
  "type": "docker",
  "dockerFile": "Dockerfile",
  "exposedPort": 8080,
  "environment": {
    "DATABASE_URL": "postgres://user:pass@db/myapp"
  }
}
```

## 💡 Best Practices

1. Keep configuration minimal
2. Use environment variables for sensitive data
3. Leverage Railpacks for automatic detection
4. Use `.deploy/config.json` for site-specific configs

## 🆘 Troubleshooting

- Run `deploy validate` to check configuration
- Use `deploy doctor` for system diagnostics

## Related Documentation

- [Site Types](site-types.md)
- [Custom Domains](custom-domains.md)
- [Actions](actions.md)

Deploy: Simplifying Deployment, One Site at a Time! 🚀