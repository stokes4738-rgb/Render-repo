import cors from "cors";

const allowed = [
  "https://pocketbounty.life",
  "https://www.pocketbounty.life",
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
    if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }
    
    // Allow Replit domains for development and sharing
    if (origin.includes('.replit.dev') || origin.includes('.repl.co') || origin.includes('replit.app')) {
      return callback(null, true);
    }
    
    // Reject other origins
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature']
});