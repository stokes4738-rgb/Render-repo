// Environment variable validation
export function validateEnv() {
  const requiredVars = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    SESSION_SECRET: process.env.SESSION_SECRET || process.env.JWT_SECRET, // Fallback to JWT_SECRET if not set
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  };

  const missing: string[] = [];
  
  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please check your .env file or Render environment variables');
    
    // Only throw in production
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  } else {
    console.log('✅ All required environment variables are set');
  }

  // Validate JWT_SECRET length
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  return {
    isValid: missing.length === 0,
    missing
  };
}

// Configuration object
export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwtSecret: process.env.JWT_SECRET!,
  sessionSecret: process.env.SESSION_SECRET || process.env.JWT_SECRET!,
  database: {
    url: process.env.DATABASE_URL!,
    maxConnections: 20,
    idleTimeout: 30000,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    publicKey: process.env.VITE_STRIPE_PUBLIC_KEY,
    connectClientId: process.env.STRIPE_CONNECT_CLIENT_ID,
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY!,
  }
};