// ABOUTME: Simple client-side router for path-based navigation
// ABOUTME: Handles popstate events, dynamic routes (:param), and provides navigate()

type RouteHandler = (params: Record<string, string>) => void;

interface Route {
  path: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

class Router {
  private routes: Route[] = [];
  private defaultHandler: RouteHandler | null = null;

  constructor() {
    window.addEventListener('popstate', () => this.handleRoute());
  }

  addRoute(path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    // Convert path like /sites/:id/logs to regex
    const pattern = new RegExp(
      '^' +
        path
          .replace(/:[^/]+/g, (match) => {
            paramNames.push(match.slice(1));
            return '([^/]+)';
          })
          .replace(/\//g, '\\/') +
        '$'
    );
    this.routes.push({ path, pattern, paramNames, handler });
  }

  setDefault(handler: RouteHandler): void {
    this.defaultHandler = handler;
  }

  navigate(path: string): void {
    window.history.pushState({}, '', path);
    this.handleRoute();
  }

  handleRoute(): void {
    const path = window.location.pathname;

    for (const route of this.routes) {
      const match = path.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });
        route.handler(params);
        return;
      }
    }

    // Try default handler
    if (this.defaultHandler) {
      this.defaultHandler({});
    }
  }

  getCurrentPath(): string {
    return window.location.pathname;
  }
}

// Singleton router instance
export const router = new Router();

// Helper to intercept link clicks for SPA navigation
export function setupLinkInterception(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a[data-route]');

    if (link) {
      e.preventDefault();
      const href = link.getAttribute('href');
      if (href) {
        router.navigate(href);
      }
    }
  });
}
