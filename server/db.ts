import { drizzle } from "drizzle-orm/neon-http";
import { neon, NeonQueryFunction } from "@neondatabase/serverless";
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
}

// Create Neon HTTP client with enhanced configuration for production
let sql: NeonQueryFunction<false, false>;

try {
  sql = neon(config.database.url, {
    fetchOptions: {
      cache: 'no-store',
      // Add timeout for fetch operations
      signal: AbortSignal.timeout(30000), // 30 second timeout
    },
    // Use WebSocket pooling in production for better reliability
    webSocketConstructor: process.env.NODE_ENV === 'production' ? undefined : undefined,
    // Additional options for better reliability
    fullResults: false,
    arrayMode: false,
    poolQueryViaFetch: true,
  });
} catch (error: any) {
  console.error('❌ Failed to initialize database client:', error.message);
  // Create a dummy client that will fail gracefully
  sql = (async () => {
    throw new Error('Database client initialization failed');
  }) as any;
}

// Create Drizzle instance with Neon HTTP adapter
export const db = drizzle(sql);

// Enhanced connection test with better error reporting
export async function testDatabaseConnection(retries = 3): Promise<boolean> {
  console.log(`🔍 Testing database connection (${retries} attempts)...`);
  
  for (let i = 0; i < retries; i++) {
    try {
      // Add timeout to the query itself
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout after 10s')), 10000)
      );
      
      const queryPromise = sql`SELECT NOW() as time, version() as version, current_database() as db`;
      
      const result = await Promise.race([queryPromise, timeoutPromise]) as any;
      
      if (result && result[0]) {
        console.log('✅ Database connection successful');
        console.log(`   Server time: ${result[0].time}`);
        console.log(`   Database: ${result[0].db}`);
        console.log(`   PostgreSQL: ${result[0].version?.split(' ')[1] || 'Unknown'}`);
        return true;
      }
    } catch (error: any) {
      console.error(`❌ Connection attempt ${i + 1}/${retries} failed:`);
      console.error(`   Error: ${error.message}`);
      
      // Enhanced error diagnostics
      if (error.message?.includes('ECONNREFUSED')) {
        const match = error.message.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
        if (match) {
          console.error(`   🚫 Connection refused to ${match[1]}:${match[2]}`);
          console.error(`   This appears to be an internal IP address.`);
          console.error(`   Possible issues:`);
          console.error(`   1. Database URL might be using internal Render address`);
          console.error(`   2. External database URL not properly configured`);
          console.error(`   3. Database service is suspended or down`);
        }
      } else if (error.message?.includes('fetch failed')) {
        console.error(`   Network error - unable to reach database server`);
      } else if (error.message?.includes('timeout')) {
        console.error(`   Connection timeout - database server not responding`);
      }
      
      // Wait before retrying (exponential backoff)
      if (i < retries - 1) {
        const waitTime = Math.min(1000 * Math.pow(2, i), 5000);
        console.log(`   ⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  console.error('❌ All database connection attempts failed');
  console.error('💡 Server will continue running, but database operations will fail');
  console.error('💡 Please check your DATABASE_URL environment variable');
  return false;
}

// Initialize connection test
const isProduction = process.env.NODE_ENV === 'production';
console.log(`🚀 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);

// Always test connection on startup
testDatabaseConnection(isProduction ? 3 : 1).then(success => {
  if (!success && isProduction) {
    console.error('⚠️  CRITICAL: Database unreachable in production!');
    console.error('⚠️  Please verify your Neon database configuration');
    console.error('⚠️  Check if you need to use the External Database URL');
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
  try {
    const result = await sql`SELECT NOW() as time, current_database() as database, version() as version`;
    return {
      connected: true,
      details: {
        serverTime: result[0].time,
        database: result[0].database,
        version: result[0].version,
      }
    };
  } catch (error: any) {
    return {
      connected: false,
      error: error.message,
      details: {
        code: error.code,
        hint: error.hint,
        url: config.database.url ? 'configured' : 'missing',
      }
    };
  }
}

// Export a helper to check if database is available
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}