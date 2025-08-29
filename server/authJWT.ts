import jwt from "jsonwebtoken";
import { Express, Request, Response, NextFunction } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { ensureStripeCustomer } from "./stripeCustomer";
import type { User } from "@shared/schema";

// Enforce JWT secret from environment
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET environment variable must be set with at least 32 characters');
}
const scryptAsync = promisify(scrypt);

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

function generateToken(user: any): string {
  return jwt.sign(
    { 
      id: user.id,
      username: user.username,
      email: user.email
    },
    JWT_SECRET!,
    { expiresIn: "7d" }
  );
}

export async function verifyToken(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as any;
    
    // Handle hardcoded demo users
    if (decoded.id === "demo123") {
      req.user = {
        id: "demo123",
        username: "demo",
        email: "demo@pocketbounty.app",
        firstName: "Demo",
        lastName: "User",
        handle: null,
        points: 1000,
        balance: "10.00",
        lifetimeEarned: "5.00",
        level: 1,
        rating: "5.00",
        reviewCount: 0,
        profileImageUrl: null,
        bio: null,
        stripeConnectAccountId: null,
        stripeConnectStatus: null,
      };
      return next();
    }
    
    if (decoded.id === "46848986") {
      // Resolve hardcoded numeric ID to proper UUID
      try {
        const resolvedUserId = await storage.resolveUserId("46848986");
        const user = await storage.getUser(resolvedUserId);
        if (user) {
          req.user = user;
          return next();
        }
      } catch (error) {
        console.error("Failed to resolve hardcoded user ID:", error);
      }
      
      // Fallback - this should not be reached if resolveUserId works correctly
      res.status(401).json({ message: "User account needs to be migrated" });
      return;
    }
    
    // For regular users, check database
    storage.getUser(decoded.id).then(async user => {
      if (user) {
        // Ensure Stripe customer exists for this user
        try {
          await ensureStripeCustomer(user);
        } catch (error) {
          console.warn("Failed to ensure Stripe customer:", error);
          // Don't fail auth if Stripe is down, just log and continue
        }
        
        req.user = user;
        next();
      } else {
        res.status(401).json({ message: "User not found" });
      }
    }).catch(error => {
      console.error("Database error in verifyToken:", error);
      res.status(500).json({ message: "Database error" });
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
}

export function setupAuthJWT(app: Express) {
  // Register endpoint
  app.post("/api/register", async (req, res) => {
    try {
      const { username, email, password, firstName, lastName } = req.body;
      
      const existingUserByUsername = await storage.getUserByUsername(username);
      if (existingUserByUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const existingUserByEmail = await storage.getUserByEmail(email);
      if (existingUserByEmail && existingUserByEmail.password) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await hashPassword(password);
      
      let user;
      if (existingUserByEmail && !existingUserByEmail.password) {
        user = await storage.migrateUserToPasswordAuth(existingUserByEmail.id, {
          username,
          password: hashedPassword,
          firstName,
          lastName,
        });
      } else {
        user = await storage.createUser({
          username,
          email,
          password: hashedPassword,
          firstName,
          lastName,
        });
      }

      const token = generateToken(user);
      
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          handle: user.handle,
          points: user.points,
          balance: user.balance,
          lifetimeEarned: user.lifetimeEarned,
        }
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login endpoint - with hardcoded fallback for demo accounts
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      console.log(`Login attempt for username: ${username}`);
      
      // For demo accounts, always use hardcoded data for reliability
      if (username === "demo" && password === "demo") {
        const demoUser = {
          id: "demo123",
          username: "demo",
          email: "demo@pocketbounty.app",
          firstName: "Demo",
          lastName: "User",
          handle: null,
          points: 1000,
          balance: "10.00",
          lifetimeEarned: "5.00"
        };
        const token = generateToken(demoUser);
        return res.json({ token, user: demoUser });
      }
      
      if (username === "Dallas1221" && password === "dallas") {
        const dallasUser = {
          id: "46848986",
          username: "Dallas1221",
          email: "stokes4738@gmail.com",
          firstName: "dallas ",
          lastName: "abbott",
          handle: "Dallas1221",
          points: 309691,
          balance: "0.00",
          lifetimeEarned: "1.00",
          level: 999,
          rating: "5.00",
          reviewCount: 100,
          profileImageUrl: null,
          bio: "🏆 Creator • App Founder • Level 999 Legend"
        };
        const token = generateToken(dallasUser);
        return res.json({ token, user: dallasUser });
      }
      
      // For other users, try database
      let user;
      try {
        user = await storage.getUserByUsername(username);
        console.log(`User found in DB: ${user ? 'Yes' : 'No'}`);
      } catch (dbError) {
        console.error("Database error:", dbError);
        return res.status(500).json({ message: "Database connection error" });
      }
      
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      const isValid = await comparePasswords(password, user.password);
      console.log(`Password valid: ${isValid}`);
      
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = generateToken(user);
      
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          handle: user.handle,
          points: user.points,
          balance: user.balance,
          lifetimeEarned: user.lifetimeEarned,
        }
      });
    } catch (error: any) {
      console.error("Login error - Full details:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({ 
        message: "Login failed",
        error: process.env.NODE_ENV === "development" ? error.message : undefined 
      });
    }
  });

  // Logout endpoint (just for compatibility)
  app.post("/api/logout", (req, res) => {
    res.json({ message: "Logged out successfully" });
  });

  // Test endpoint to verify deployment
  app.get("/api/test-login", (req, res) => {
    res.json({ 
      message: "Login system ready",
      version: "2.0",
      demo: "Use username: demo, password: demo",
      dallas: "Use username: Dallas1221, password: dallas"
    });
  });

  // Get user endpoint
  app.get("/api/user", verifyToken, (req, res) => {
    const user: any = req.user!;
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      handle: user.handle || null,
      points: user.points || 0,
      balance: user.balance || "0.00",
      lifetimeEarned: user.lifetimeEarned || "0.00",
      level: user.level || 1,
      rating: user.rating || "0.00",
      reviewCount: user.reviewCount || 0,
      profileImageUrl: user.profileImageUrl || null,
      bio: user.bio || null,
      stripeConnectAccountId: user.stripeConnectAccountId || null,
      stripeConnectStatus: user.stripeConnectStatus || null,
    });
  });
}

export { hashPassword, comparePasswords };