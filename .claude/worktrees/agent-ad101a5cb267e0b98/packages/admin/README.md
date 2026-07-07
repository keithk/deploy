# Deploy Admin Frontend

A web-based admin interface for Dial Up Deploy, built with vanilla web components and basic CSS.

## Features

- **Dashboard**: Overview of server status, sites, and processes
- **Sites Management**: Create, build, and manage sites
- **Process Management**: View and control running site processes  
- **Actions**: View and manage automated workflows
- **Server Management**: Server status and control

## Architecture

- **Framework**: Vanilla JavaScript with Web Components
- **Styling**: Basic CSS (no frameworks)
- **API**: RESTful API endpoints for all functionality
- **Real-time**: Auto-refreshing components for live status updates

## API Endpoints

- `GET /api/sites` - List all sites
- `POST /api/sites` - Create a new site
- `POST /api/sites/:name/build` - Build a specific site
- `POST /api/sites/:name/run/:command` - Run a command for a site
- `GET /api/processes` - List all processes
- `POST /api/processes/:id/start` - Start a process
- `POST /api/processes/:id/stop` - Stop a process
- `GET /api/server/status` - Get server status
- `GET /health` - Health check

## Web Components

- `<deploy-header>` - Main header with app title and refresh button
- `<deploy-nav>` - Navigation sidebar
- `<deploy-dashboard>` - Dashboard overview
- `<deploy-sites>` - Sites management interface
- `<deploy-processes>` - Process management interface
- `<deploy-actions>` - Actions management interface
- `<deploy-server>` - Server management interface

## Accessing the Interface

1. Make sure the deploy server is running:
   ```bash
   bun run dev
   ```

2. Add this line to your `/etc/hosts` file:
   ```
   127.0.0.1 deploy.localhost
   ```

3. Open your browser and go to:
   ```
   http://deploy.localhost:3000
   ```

## Development

The frontend is a static site served by the deploy server. All files are in the `sites/deploy-admin/` directory:

- `index.html` - Main HTML file
- `styles.css` - Global styles
- `app.js` - Main application logic and routing
- `components/` - Web component definitions

## Browser Support

Works in all modern browsers that support:
- Web Components (Custom Elements)
- ES6 Modules
- Fetch API
- CSS Grid

## Security

This is an admin interface intended for development and internal use. For production deployments, consider adding:
- Authentication/authorization
- HTTPS/SSL
- CSRF protection
- Rate limiting