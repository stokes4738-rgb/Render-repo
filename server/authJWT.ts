import jwt from "jsonwebtoken";
import { Express, Request, Response, NextFunction } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import type { User } from "@shared/schema";

const JWT_SECRET = process.env.JWT_SECRET || "pocket-bounty-jwt-secret-2025";
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

function generateToken(user: User): string {
  return jwt.sign(
    { 
      id: user.id,
      username: user.username,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    storage.getUser(decoded.id).then(user => {
      if (user) {
        req.user = user;
        next();
      } else {
        res.status(401).json({ message: "User not found" });
      }
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

  // Login endpoint
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      const user = await storage.getUserByUsername(username);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      const isValid = await comparePasswords(password, user.password);
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
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout endpoint (just for compatibility)
  app.post("/api/logout", (req, res) => {
    res.json({ message: "Logged out successfully" });
  });

  // Get user endpoint
  app.get("/api/user", verifyToken, (req, res) => {
    const user = req.user!;
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      handle: user.handle,
      points: user.points || 0,
      balance: user.balance || "0.00",
      lifetimeEarned: user.lifetimeEarned || "0.00",
      level: user.level,
      rating: user.rating,
      reviewCount: user.reviewCount,
      profileImageUrl: user.profileImageUrl,
      bio: user.bio,
    });
  });
}

export { hashPassword, comparePasswords };