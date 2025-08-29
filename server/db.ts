import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { config } from "./config";

// Validate database URL
if (!config.database.url) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Create Neon HTTP client with proper configuration
const sql = neon(config.database.url, {
  fetchOptions: {
    // Add retry logic for connection failures
    cache: 'no-store',
  },
  // Additional options for better reliability
  fullResults: false,
  arrayMode: false,
  poolQueryViaFetch: true,
});

// Create Drizzle instance with Neon HTTP adapter
export const db = drizzle(sql);

// Connection test function with retry logic
export async function testDatabaseConnection(retries = 3): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      // Simple query to test connection
      const result = await sql`SELECT NOW() as time, version() as version`;
      
      if (result && result[0]) {
        console.log('✅ Database connection successful');
        console.log(`   Server time: ${result[0].time}`);
        console.log(`   PostgreSQL: ${result[0].version?.split(' ')[1] || 'Unknown'}`);
        return true;
      }
    } catch (error: any) {
      console.error(`❌ Database connection attempt ${i + 1}/${retries} failed:`, error.message);
      
      // If this is a connection refused error, log more details
      if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch failed')) {
        console.error('   Connection refused - possible causes:');
        console.error('   1. Database might be suspended (free tier limitation)');
        console.error('   2. Network/firewall issues');
        console.error('   3. Invalid database URL or credentials');
        console.error('   4. Database server is down or unreachable');
      }
      
      // Wait before retrying (exponential backoff)
      if (i < retries - 1) {
        const waitTime = Math.min(1000 * Math.pow(2, i), 5000);
        console.log(`   Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  console.error('❌ All database connection attempts failed');
  return false;
}

// Initialize connection test in production
if (process.env.NODE_ENV === 'production') {
  console.log('🔄 Testing database connection in production...');
  testDatabaseConnection(3).then(success => {
    if (!success) {
      console.error('⚠️ Database connection failed, but server will continue');
      console.error('   Connections will be retried on demand');
    }
  }).catch(error => {
    console.error('⚠️ Database test error:', error);
  });
} else {
  // In development, test connection immediately
  testDatabaseConnection(1).catch(console.error);
}

// Export a function to get database status
export async function getDatabaseStatus(): Promise<{
  connected: boolean;
  error?: string;
  details?: any;
}> {
  try {
    const result = await sql`SELECT NOW() as time, current_database() as database`;
    return {
      connected: true,
      details: {
        serverTime: result[0].time,
        database: result[0].database,
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
  }
}