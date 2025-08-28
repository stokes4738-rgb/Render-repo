import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Parse the database URL to check if it's internal or external
const isInternalUrl = process.env.DATABASE_URL.includes('dpg-') && !process.env.DATABASE_URL.includes('.render.com');

// Create a connection pool with optimized settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optimize connection pool settings
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Timeout after 5 seconds if can't connect
  // SSL configuration
  ssl: isInternalUrl ? false : { 
    rejectUnauthorized: false,
    require: true 
  }
});

// Test the connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client from pool:', err.stack);
  } else {
    console.log('Database connection pool established successfully');
    release();
  }
});

export const db = drizzle(pool);
