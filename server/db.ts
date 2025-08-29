import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Parse the database URL to check if it's internal or external
const isInternalUrl = process.env.DATABASE_URL.includes('dpg-') && !process.env.DATABASE_URL.includes('.render.com');

// Create ultra-minimal connection pool for Neon Scale plan
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Minimal settings that work reliably with Neon
  max: 1, // Single connection to avoid conflicts
  min: 0, // No persistent connections
  idleTimeoutMillis: 10000, // Quick cleanup
  connectionTimeoutMillis: 10000, // Fast timeout (10 seconds)
  // query_timeout not available in pg Pool
  // SSL configuration for Neon
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Simplified connection test for production
const testConnection = async () => {
  if (process.env.NODE_ENV === 'production') {
    // In production, just continue - let the app handle connections on demand
    console.log('Production mode: skipping connection test, will connect on demand');
    return;
  }
  
  // Only test in development
  try {
    const client = await pool.connect();
    console.log('Database connection pool established successfully');
    client.release();
  } catch (err: any) {
    console.error('Database connection failed:', err.message);
    console.log('Continuing startup - database will be tested on first request');
  }
};

// Start connection test
testConnection().catch(console.error);

export const db = drizzle(pool);
