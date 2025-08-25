import { Hono } from 'hono';
import { serve } from 'bun';
import './config'; // Initialize database with correct path
import { authRoutes } from './routes/auth';
import { dashboardRoutes } from './routes/dashboard';
import { userRoutes } from './routes/users';
import { settingsRoutes } from './routes/settings';
import { serveStatic } from 'hono/bun';

const app = new Hono();

// Serve static files (CSS, JS, images) - updated path for CLI integration
app.use('/static/*', serveStatic({ root: './src/admin' }));

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