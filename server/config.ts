import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment variable schema
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  VITE_STRIPE_PUBLIC_KEY: z.string().min(1, 'VITE_STRIPE_PUBLIC_KEY is required'),
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
  SENDGRID_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  APP_BASE_URL: z.string().default('http://localhost:5000'),
  PUBLIC_BASE_URL: z.string().optional(),
});

// Parse and validate environment variables
let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:');
    console.error(error.flatten().fieldErrors);
    
    // Provide helpful messages for missing variables
    const missing = error.errors.filter(e => e.code === 'too_small');
    if (missing.length > 0) {
      console.error('\n📝 Missing required environment variables:');
      missing.forEach(e => {
        console.error(`  - ${e.path[0]}`);
      });
    }
    
    process.exit(1);
  }
  throw error;
}

// Calculate the correct base URL for production
function getBaseUrl(): string {
  // Use PUBLIC_BASE_URL if set (for Render production)
  if (env.PUBLIC_BASE_URL) {
    return env.PUBLIC_BASE_URL;
  }
  
  // For production, use the production URL
  if (env.NODE_ENV === 'production') {
    return 'https://pocketbounty-web.onrender.com';
  }
  
  // For development, use APP_BASE_URL
  return env.APP_BASE_URL;
}

// Calculate the actual port
function getPort(): number {
  // In production (Render), use PORT from environment (usually 3000)
  // In development, use our custom port 5000
  return parseInt(env.PORT);
}

// Export validated config
export const config = {
  database: {
    url: env.DATABASE_URL,
    poolSize: 10,
    connectionTimeout: 30000,
  },
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    publicKey: env.VITE_STRIPE_PUBLIC_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
  server: {
    port: getPort(),
    environment: env.NODE_ENV,
    baseUrl: getBaseUrl(),
    sessionSecret: env.SESSION_SECRET,
  },
  email: {
    sendgridApiKey: env.SENDGRID_API_KEY,
    fromEmail: 'noreply@pocketbounty.life',
  },
  cors: {
    origins: [
      'http://localhost:5000',
      'http://localhost:5173',
      'https://pocketbounty.life',
      'https://www.pocketbounty.life',
      'https://pocketbounty-web.onrender.com',
      getBaseUrl(),
    ].filter(Boolean),
  },
  logging: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
};

// Log configuration on startup
export function logStartupInfo() {
  console.log('🚀 PocketBounty Server Starting...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📱 App Name: PocketBounty`);
  console.log(`🌍 Environment: ${config.server.environment}`);
  console.log(`🔗 Base URL: ${config.server.baseUrl}`);
  console.log(`🚪 Port: ${config.server.port}`);
  console.log(`💳 Stripe Mode: ${config.stripe.secretKey.includes('sk_test') ? 'TEST' : 'LIVE'}`);
  console.log(`📧 Email: ${config.email.sendgridApiKey ? 'Configured' : 'Disabled'}`);
  console.log(`🔐 Session: ${config.server.sessionSecret ? 'Configured' : 'Missing'}`);
  console.log(`🗄️  Database: ${config.database.url ? 'Configured' : 'Missing'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Diagnostics function
export async function runDiagnostics() {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: config.server.environment,
    node_version: process.version,
  };

  // Check database connection
  try {
    const { Client } = await import('pg');
    const client = new Client({
      connectionString: config.database.url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
    const dbResult = await client.query('SELECT NOW(), version()');
    await client.end();
    
    results.database = {
      status: 'connected',
      serverTime: dbResult.rows[0].now,
      version: dbResult.rows[0].version,
    };
  } catch (error: any) {
    results.database = {
      status: 'error',
      error: error.message,
    };
  }

  // Check Stripe connection
  try {
    const stripe = await import('stripe');
    const stripeClient = new stripe.default(config.stripe.secretKey, {
      apiVersion: '2024-11-20.acacia',
    });
    const account = await stripeClient.accounts.retrieve();
    results.stripe = {
      status: 'connected',
      mode: config.stripe.secretKey.includes('sk_test') ? 'test' : 'live',
      accountId: account.id,
    };
  } catch (error: any) {
    results.stripe = {
      status: 'error',
      error: error.message,
    };
  }

  // Check SendGrid if configured
  if (config.email.sendgridApiKey) {
    try {
      const sgMail = await import('@sendgrid/mail');
      sgMail.default.setApiKey(config.email.sendgridApiKey);
      results.email = {
        status: 'configured',
        fromEmail: config.email.fromEmail,
      };
    } catch (error: any) {
      results.email = {
        status: 'error',
        error: error.message,
      };
    }
  } else {
    results.email = { status: 'not configured' };
  }

  return results;
}