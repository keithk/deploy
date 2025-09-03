# Deploy Documentation

Welcome to Deploy - the universal deployment platform that makes hosting any website or application simple and automatic.

## 📚 Documentation Index

### Getting Started
- [**Installation Guide**](./installation.md) - Set up Deploy and all required tools
- [**Getting Started**](./getting-started.md) - Your first deployment in 2 minutes
- [**Configuration**](./configuration.md) - Optional configuration when you need it

### Core Concepts
- [**How Deploy Works**](./how-it-works.md) - Understanding the magic behind automatic deployment
- [**Site Types**](./site-types.md) - Deploy handles any application automatically
- [**Docker & Railpacks**](./docker-railpacks.md) - Automatic containerization explained

### Features
- [**Custom Domains**](./custom-domains.md) - Add your own domains with automatic SSL
- [**Admin Panel**](./admin-api.md) - Web-based management interface
- [**Editor**](./editor.md) - Built-in web editor for quick changes
- [**Actions**](./actions/) - Webhooks, scheduled tasks, and background jobs

### Advanced Topics
- [**CLI Reference**](./cli-reference.md) - Complete command documentation
- [**Database**](./database.md) - Understanding the SQLite backend
- [**Security**](./security.md) - Authentication and security features
- [**Troubleshooting**](./troubleshooting.md) - Common issues and solutions

### Developer Tools
- [**API Documentation**](./api.md) - RESTful API for automation
- [**Codemods**](./codemods.md) - Migration tools for updates
- [**Contributing**](./contributing.md) - Help improve Deploy

## 🚀 Quick Start

```bash
# Install Deploy
curl -fsSL https://deploy.example.com/install.sh | bash

# Set up your development environment
deploy setup

# Deploy any application
cd /path/to/your/app
deploy init
deploy run

# Your app is now live at https://your-app.local.deploy.example.com
```

## 🎯 Philosophy

Deploy follows these core principles:

1. **Universal** - Deploy ANY application, regardless of technology
2. **Automatic** - Zero configuration for most deployments
3. **Simple** - If it takes more than 2 commands, we've failed
4. **Secure** - Automatic SSL, isolated containers, secure by default
5. **Fast** - From code to deployed in seconds

## 📖 How to Use This Documentation

- **New to Deploy?** Start with [Installation](./installation.md) and [Getting Started](./getting-started.md)
- **Looking for specific features?** Check the Features section
- **Having issues?** See [Troubleshooting](./troubleshooting.md) or run `deploy doctor`
- **Want to contribute?** Read [Contributing](./contributing.md)

## 🔧 Getting Help

- **Diagnostics**: Run `deploy doctor` to check your system
- **GitHub Issues**: Report bugs and request features
- **Documentation Issues**: Found an error? Please let us know!

## 📝 Version

This documentation is for Deploy v1.0.0. Last updated: January 2025.