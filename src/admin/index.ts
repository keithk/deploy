import { Hono } from 'hono';
import { serve } from 'bun';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import './config'; // Initialize database with correct path
import { authRoutes } from './routes/auth';
import { dashboardRoutes } from './routes/dashboard';
import { userRoutes } from './routes/users';
import { settingsRoutes } from './routes/settings';
import { serveStatic } from 'hono/bun';

const app = new Hono();

// Get the current admin directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files (CSS, JS, images) - using absolute path for CLI integration
app.use('/static/*', serveStatic({ root: __dirname }));

// Routes
app.route('/auth', authRoutes);
app.route('/dashboard', dashboardRoutes);
app.route('/users', userRoutes);
app.route('/settings', settingsRoutes);

// Root redirect to dashboard
app.get('/', (c) => {
  return c.redirect('/dashboard');
});

// Export the app for built-in site integration
export default {
  fetch: app.fetch,
};