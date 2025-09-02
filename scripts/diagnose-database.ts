import { Database } from '../src/core/database/database';

async function diagnoseDatabase() {
  const db = Database.getInstance();

  console.log('Checking database configuration...');

  try {
    // List all tables
    const tables = db.query('SELECT name FROM sqlite_master WHERE type="table"');
    console.log('Existing tables:', tables.map(t => t.name));

    // Check if sites table exists
    const sitesTableCheck = db.query('PRAGMA table_info(sites)');
    if (sitesTableCheck.length === 0) {
      console.warn('Sites table does not exist. Creating it...');
      
      // Create sites table
      db.run(`
        CREATE TABLE sites (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          path TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          type TEXT DEFAULT 'dynamic',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('Sites table created successfully.');

      // Insert sample sites
      const sampleSites = [
        { name: 'blog', path: '/Users/keith/projects/deploy/sites/blog', user_id: 1, type: 'dynamic' },
        { name: 'ruby-example', path: '/Users/keith/projects/deploy/sites/ruby-example', user_id: 1, type: 'dynamic' }
      ];

      const stmt = db.prepare(`
        INSERT INTO sites (name, path, user_id, type) 
        VALUES (?, ?, ?, ?)
      `);

      for (const site of sampleSites) {
        stmt.run(site.name, site.path, site.user_id, site.type);
        console.log(`Inserted site: ${site.name}`);
      }
    } else {
      console.log('Sites table exists. Checking content...');
      const sites = db.query('SELECT * FROM sites');
      console.log('Existing sites:', sites);
    }
  } catch (error) {
    console.error('Database diagnosis failed:', error);
  }
}

diagnoseDatabase();