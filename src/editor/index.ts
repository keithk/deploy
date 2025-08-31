import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { authRoutes } from './routes/auth';
import { dashboardRoutes } from './routes/dashboard';
import { apiRoutes } from './routes/api';
import { editorRoutes } from './routes/editor';
import { fileRoutes } from './routes/files';
import type { AuthenticatedContext } from '@core/types';

// Get the current editor directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono<AuthenticatedContext>();

// Serve static files (CSS, JS, fonts) - using absolute path for CLI integration
app.use('/static/*', serveStatic({ root: __dirname }));

// Routes
app.route('/auth', authRoutes);
app.route('/dashboard', dashboardRoutes);
app.route('/editor', editorRoutes);
app.route('/api', apiRoutes);
app.route('/api', fileRoutes);

// Root route - redirect to dashboard or login
app.get('/', (c) => {
  // Check if user has session cookie
  const sessionCookie = c.req.header('Cookie');
  if (sessionCookie && sessionCookie.includes('editor_session=')) {
    return c.redirect('/dashboard');
  }
  return c.redirect('/auth/login');
});

// Export the app for built-in site integration
export default {
  fetch: app.fetch,
};