import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Parse the database URL to check if it's internal or external
const isInternalUrl = process.env.DATABASE_URL.includes('dpg-') && !process.env.DATABASE_URL.includes('.render.com');

// Create a connection pool with optimized settings for Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optimize connection pool settings for serverless Neon
  max: 5, // Reduced pool size for Neon
  idleTimeoutMillis: 60000, // Keep connections alive longer (60 seconds)
  connectionTimeoutMillis: 20000, // Increased timeout for slow connections (20 seconds)
  acquireTimeoutMillis: 20000, // Timeout for acquiring a connection from pool
  createTimeoutMillis: 20000, // Timeout for creating new connections
  destroyTimeoutMillis: 5000, // Timeout for destroying connections
  reapIntervalMillis: 1000, // Check for idle connections every second
  createRetryIntervalMillis: 200, // Retry creating connections every 200ms
  // SSL configuration for Neon
  ssl: {
    rejectUnauthorized: false,
    require: true
  }
});

// Test the connection on startup with retry logic
const testConnection = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      console.log('Database connection pool established successfully');
      client.release();
      return;
    } catch (err) {
      console.error(`Connection attempt ${i + 1} failed:`, err.message);
      if (i === retries - 1) {
        console.error('Failed to establish database connection after', retries, 'attempts');
        console.error('Full error:', err);
      } else {
        console.log(`Retrying connection in ${(i + 1) * 2} seconds...`);
        await new Promise(resolve => setTimeout(resolve, (i + 1) * 2000));
      }
    }
  }
};

// Start connection test
testConnection().catch(console.error);

export const db = drizzle(pool);
