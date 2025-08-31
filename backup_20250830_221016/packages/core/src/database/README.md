# Database Module

This module provides a centralized database functionality for the DialUpDeploy system. It uses SQLite for persistent storage and provides models for various data entities.

## Structure

- `database.ts` - Base Database class that handles connection and provides utility methods
- `models/` - Directory containing data models
  - `process.ts` - Model for managing process records

## Usage

### Database Class

The `Database` class is implemented as a singleton to ensure a single database connection throughout the application:

```typescript
import { Database } from "@keithk/dailup-core";

// Get the database instance
const db = Database.getInstance();

// Execute a query
db.run("CREATE TABLE IF NOT EXISTS my_table (id TEXT PRIMARY KEY, name TEXT)");

// Query data
const results = db.query("SELECT * FROM my_table");
```

### Process Model

The `ProcessModel` provides methods for managing process records:

```typescript
import { processModel } from "@keithk/dailup-core";

// Save a process
processModel.save("my-site:3000", {
  site: "my-site",
  port: 3000,
  pid: 12345,
  type: "passthrough",
  script: "dev",
  cwd: "/path/to/site",
  startTime: new Date(),
  status: "running"
});

// Update status
processModel.updateStatus("my-site:3000", "stopped");

// Get all processes
const processes = processModel.getAll();

// Get a specific process
const process = processModel.getById("my-site:3000");
```

## Data Storage

The database file is stored in the `/data` directory at the project root. This directory is gitignored to prevent committing database files to the repository.

## Adding New Models

To add a new model:

1. Create a new file in the `models/` directory
2. Implement the model class with an `up()` method to create/migrate the table
3. Export the model class and a singleton instance
4. Add the model to the exports in `models/index.ts`
