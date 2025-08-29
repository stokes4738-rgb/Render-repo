import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { apiRateLimiter } from "./middleware/rateLimiter";
import compression from "compression";
import helmet from "helmet";
// @ts-ignore
import corsSetup from "./cors-setup.js";
import { config, logStartupInfo, runDiagnostics } from "./config";

const app = express();

// Use proper CORS configuration
app.use(corsSetup);

// Security and performance middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for development
  crossOriginEmbedderPolicy: false
}));
app.use(compression());

// Request parsing with size limits
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// Health check routes (before rate limiting)
app.get("/health", (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

app.get("/healthz", (req, res) => {
  res.status(200).send("ok");
});

// Diagnostics endpoint
app.get("/api/diagnostics", async (req, res) => {
  try {
    const diagnostics = await runDiagnostics();
    res.json(diagnostics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Database connection test endpoint
app.get("/api/db-test", async (req, res) => {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return res.status(500).json({ 
        error: "DATABASE_URL not set",
        hasEnvVar: false 
      });
    }
    
    // Parse URL to check components
    const urlParts = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^\/]+)\/(.+)/);
    if (!urlParts) {
      return res.status(500).json({
        error: "Invalid DATABASE_URL format",
        dbUrl: dbUrl.substring(0, 50) + "...",
        expectedFormat: "postgresql://user:pass@host/database"
      });
    }
    
    const [, user, , host, database] = urlParts;
    
    // Simple direct connection test with pg
    const { Client } = await import("pg");
    const client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000 // 10 second timeout
    });
    
    await client.connect();
    const result = await client.query('SELECT NOW()');
    await client.end();
    
    res.json({ 
      success: true,
      dbUser: user,
      dbHost: host,
      dbName: database,
      serverTime: result.rows[0].now,
      message: "Database connection successful!"
    });
  } catch (error: any) {
    const dbUrl = process.env.DATABASE_URL || '';
    
    res.status(500).json({ 
      error: "Database connection failed",
      message: error.message,
      code: error.code,
      dbUrlFormat: dbUrl ? dbUrl.replace(/:([^@]+)@/, ':****@').substring(0, 80) + "..." : null,
      possibleIssues: [
        "1. Check if External Database URL is correct",
        "2. Database might be suspended (free tier)",
        "3. Network/firewall blocking connection",
        "4. Database credentials might be wrong"
      ]
    });
  }
});

// Apply rate limiting to API routes
app.use("/api", apiRateLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: process.platform === 'win32' ? 'localhost' : '0.0.0.0',
    reusePort: true,
  }, () => {
    logStartupInfo();
    log(`serving on port ${port}`);
  });

  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    log('SIGTERM received, closing server gracefully...');
    server.close(() => {
      log('Server closed');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      log('Force closing server');
      process.exit(1);
    }, 10000);
  });

  process.on('SIGINT', () => {
    log('SIGINT received, closing server gracefully...');
    server.close(() => {
      log('Server closed');
      process.exit(0);
    });
  });
})();
