import { join } from 'path';

// Use the main project's data directory for the database (adjusted for CLI integration)
export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');

// Initialize database with correct path
import { Database } from '@core/database/database';
Database.getInstance({ dataDir: DATA_DIR });