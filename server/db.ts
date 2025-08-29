import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Parse the database URL to check if it's internal or external
const isInternalUrl = process.env.DATABASE_URL.includes('dpg-') && !process.env.DATABASE_URL.includes('.render.com');

// Create a connection pool optimized for Neon Scale plan
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optimized for Scale plan with unlimited connections
  max: 20, // Increased pool size for Scale plan
  min: 5, // Keep minimum connections alive
  idleTimeoutMillis: 300000, // 5 minutes - Scale plan can handle longer connections
  connectionTimeoutMillis: 30000, // Faster connection on Scale plan
  // SSL configuration for Neon
  ssl: {
    rejectUnauthorized: false
  }
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
