// Production configuration for Pocket Bounty
module.exports = {
  app: {
    name: 'Pocket Bounty',
    port: process.env.PORT || 5000,
    host: '0.0.0.0'
  },
  database: {
    url: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  },
  cors: {
    origin: process.env.FRONTEND_URL || 'https://pocketbounty.life',
    credentials: true
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.VITE_STRIPE_PUBLIC_KEY,
    connectClientId: process.env.STRIPE_CONNECT_CLIENT_ID,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
    fromEmail: 'noreply@pocketbounty.life'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-production-jwt-secret-change-this',
    expiresIn: '7d'
  },
  session: {
    secret: process.env.SESSION_SECRET || 'your-production-session-secret-change-this',
    secure: true,
    sameSite: 'strict'
  }
};