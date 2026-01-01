// ABOUTME: Simple client-side router for path-based navigation
// ABOUTME: Handles popstate events and provides navigate() function

type RouteHandler = () => void;

interface Route {
  path: string;
  handler: RouteHandler;
}

class Router {
  private routes: Route[] = [];
  private defaultHandler: RouteHandler | null = null;

  constructor() {
    window.addEventListener('popstate', () => this.handleRoute());
  }

  addRoute(path: string, handler: RouteHandler): void {
    this.routes.push({ path, handler });
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
      if (route.path === path) {
        route.handler();
        return;
      }
    }

    // Try default handler
    if (this.defaultHandler) {
      this.defaultHandler();
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
