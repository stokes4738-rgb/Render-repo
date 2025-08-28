import cors from "cors";

const allowed = [
  "https://pocketbounty.life",
  "https://www.pocketbounty.life",
  "https://pocketbounty-web.onrender.com", // Render deployment
  "capacitor://localhost",
  "app://.",
  "http://localhost",
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5173" // Vite dev server
];

export default cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, postman, etc)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow any localhost port in development
    if (origin.startsWith('http://localhost') || origin.startsWith('https://localhost')) {
      return callback(null, true);
    }
    
    // Allow Replit domains for development and sharing - more comprehensive check
    if (origin.includes('.replit.dev') || 
        origin.includes('.repl.co') || 
        origin.includes('replit.app') ||
        origin.includes('.replit.com') ||
        origin.includes('repl.it')) {
      return callback(null, true);
    }
    
    // Allow Render domains
    if (origin.includes('.onrender.com')) {
      return callback(null, true);
    }
    
    // In development, be more permissive
    if (process.env.NODE_ENV === 'development') {
      console.log(`CORS: Allowing origin in development: ${origin}`);
      return callback(null, true);
    }
    
    // Log rejected origin for debugging
    console.error(`CORS: Rejecting origin: ${origin}`);
    
    // Reject other origins
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature']
});