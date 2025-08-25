import { Hono } from 'hono';
import { serve } from 'bun';
import './config'; // Initialize database with correct path
import { authRoutes } from './routes/auth';
import { dashboardRoutes } from './routes/dashboard';
import { userRoutes } from './routes/users';
import { settingsRoutes } from './routes/settings';
import { serveStatic } from 'hono/bun';

const app = new Hono();

// Serve static files (CSS, JS, images)
app.use('/static/*', serveStatic({ root: './src' }));

// Routes
app.route('/auth', authRoutes);
app.route('/dashboard', dashboardRoutes);
app.route('/users', userRoutes);
app.route('/settings', settingsRoutes);

// Root redirect to dashboard
app.get('/', (c) => {
  return c.redirect('/dashboard');
});

// Start server
const port = process.env.ADMIN_PORT ? parseInt(process.env.ADMIN_PORT) : 3001;

console.log(`🔧 Admin panel starting on port ${port}`);
console.log(`📍 Available at: http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};