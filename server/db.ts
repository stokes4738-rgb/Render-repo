import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "./config";

// Validate database URL
if (!config.database.url) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Log database URL (redacted) for debugging
const dbUrl = config.database.url;
const urlParts = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^\/]+)\/(.+)/);
if (urlParts) {
  const [, user, , host, database] = urlParts;
  console.log(`📊 Database Configuration:`);
  console.log(`   User: ${user}`);
  console.log(`   Host: ${host}`);
  console.log(`   Database: ${database}`);
  console.log(`   SSL: ${process.env.NODE_ENV === 'production' ? 'enabled' : 'disabled'}`);
  
  // Check if this is a Render internal database
  const isRenderInternal = host.includes('dpg-') && !host.includes('.render.com');
  if (isRenderInternal) {
    console.log(`   Type: Render Internal Database`);
  }
}

// Create connection pool with proper configuration for Render
const pool = new Pool({
  connectionString: config.database.url,
  // Configuration optimized for Render's PostgreSQL
  max: 5, // Reasonable pool size for Render
  min: 1, // Keep at least one connection
  idleTimeoutMillis: 30000, // 30 seconds idle timeout
  connectionTimeoutMillis: 10000, // 10 seconds connection timeout
  // SSL configuration
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false,
  // Additional options for better reliability
  statement_timeout: 30000, // 30 second statement timeout
  query_timeout: 30000, // 30 second query timeout
  application_name: 'pocketbounty'
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

// Create Drizzle instance with pg pool
export const db = drizzle(pool);

// Enhanced connection test with better error reporting
export async function testDatabaseConnection(retries = 3): Promise<boolean> {
  console.log(`🔍 Testing database connection (${retries} attempts)...`);
  
  for (let i = 0; i < retries; i++) {
    let client;
    try {
      // Get a client from the pool
      client = await pool.connect();
      
      // Test query
      const result = await client.query('SELECT NOW() as time, version() as version, current_database() as db');
      
      if (result && result.rows && result.rows[0]) {
        console.log('✅ Database connection successful');
        console.log(`   Server time: ${result.rows[0].time}`);
        console.log(`   Database: ${result.rows[0].db}`);
        console.log(`   PostgreSQL: ${result.rows[0].version?.split(' ')[1] || 'Unknown'}`);
        return true;
      }
    } catch (error: any) {
      console.error(`❌ Connection attempt ${i + 1}/${retries} failed:`);
      console.error(`   Error: ${error.message}`);
      
      // Enhanced error diagnostics
      if (error.message?.includes('ECONNREFUSED')) {
        console.error(`   Connection refused - database may be starting up`);
      } else if (error.message?.includes('timeout')) {
        console.error(`   Connection timeout - database server not responding`);
      } else if (error.message?.includes('authentication')) {
        console.error(`   Authentication failed - check credentials`);
      } else if (error.message?.includes('does not exist')) {
        console.error(`   Database does not exist - may need to create it`);
      }
      
      // Wait before retrying (exponential backoff)
      if (i < retries - 1) {
        const waitTime = Math.min(1000 * Math.pow(2, i), 5000);
        console.log(`   ⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } finally {
      // Always release the client back to the pool
      if (client) {
        client.release();
      }
    }
  }
  
  console.error('❌ All database connection attempts failed');
  console.error('💡 Server will continue running, but database operations will fail');
  return false;
}

// Initialize connection test
const isProduction = process.env.NODE_ENV === 'production';
console.log(`🚀 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);

// Test connection on startup
testDatabaseConnection(isProduction ? 3 : 1).then(success => {
  if (!success && isProduction) {
    console.error('⚠️  CRITICAL: Database unreachable in production!');
    console.error('⚠️  Database connection will be retried on demand');
  }
}).catch(error => {
  console.error('⚠️ Database test error:', error);
});

// Export a function to get database status
export async function getDatabaseStatus(): Promise<{
  connected: boolean;
  error?: string;
  details?: any;
}> {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as time, current_database() as database, version() as version');
    return {
      connected: true,
      details: {
        serverTime: result.rows[0].time,
        database: result.rows[0].database,
        version: result.rows[0].version,
      }
    };
  } catch (error: any) {
    return {
      connected: false,
      error: error.message,
      details: {
        code: error.code,
        hint: error.hint,
      }
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Export a helper to check if database is available
export async function isDatabaseAvailable(): Promise<boolean> {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}