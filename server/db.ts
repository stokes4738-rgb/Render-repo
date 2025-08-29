import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Parse the database URL to check if it's internal or external
const isInternalUrl = process.env.DATABASE_URL.includes('dpg-') && !process.env.DATABASE_URL.includes('.render.com');

// Create a simple, reliable connection pool for Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Minimal, stable settings
  max: 1, // Single connection only
  min: 0, // No persistent connections
  idleTimeoutMillis: 5000, // Quick cleanup (5 seconds)
  connectionTimeoutMillis: 60000, // Standard timeout (1 minute)
  // SSL configuration for Neon
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test the connection on startup with retry logic
const testConnection = async (retries = 5) => {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      console.log('Database connection pool established successfully');
      client.release();
      return;
    } catch (err: any) {
      console.error(`Connection attempt ${i + 1} failed:`, err.message);
      if (i === retries - 1) {
        console.error('Failed to establish database connection after', retries, 'attempts');
        console.error('Full error:', err);
        // Continue startup even if DB connection fails initially
        console.log('Continuing startup - database may become available later');
      } else {
        const waitTime = Math.min((i + 1) * 5, 30); // Progressive backoff, max 30 seconds
        console.log(`Retrying connection in ${waitTime} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      }
    }
  }
};

// Start connection test
testConnection().catch(console.error);

export const db = drizzle(pool);
