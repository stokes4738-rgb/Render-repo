import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { validateMinimumAge, initiateBackgroundCheck, requiresParentalConsent, validateParentalConsent, calculateAge } from "./middleware/ageVerification";
import { sendParentalConsentVerification, createMinorAccountNotice } from "./utils/parentalConsent";
import type { User } from "@shared/schema";
import connectPg from "connect-pg-simple";
import createMemoryStore from "memorystore";

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      email: string;
      password?: string;
      firstName?: string;
      lastName?: string;
      points?: number;
      balance?: string;
      lifetimeEarned?: string;
    }
  }
}

const scryptAsync = promisify(scrypt);

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

export function setupAuth(app: Express) {
  // Session setup
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  
  // Use memory store for now since database is disabled
  const MemoryStore = createMemoryStore(session);
  const sessionStore = new MemoryStore({
    checkPeriod: 86400000, // prune expired entries every 24h
    ttl: sessionTtl,
  });

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "pocket-bounty-secret-key",
    name: "pocket.sid",
    resave: true,
    saveUninitialized: true,
    rolling: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: sessionTtl,
      path: "/",
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());
  

  // Passport Local Strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !user.password) {
          return done(null, false, { message: "Invalid username or password" });
        }
        
        const isValid = await comparePasswords(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Invalid username or password" });
        }
        
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, (user as User).id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // Auth routes
  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, email, password, firstName, lastName, dateOfBirth, parentalConsent, parentEmail, parentName } = req.body;
      
      // Age verification - CRITICAL for child safety
      if (dateOfBirth && !validateMinimumAge(dateOfBirth)) {
        return res.status(400).json({ 
          message: "You must be at least 16 years old to create an account on this platform.",
          code: "AGE_VERIFICATION_FAILED"
        });
      }

      // Parental consent validation for 16-17 year olds
      if (dateOfBirth && requiresParentalConsent(dateOfBirth)) {
        const consentValidation = validateParentalConsent({
          parentalConsent,
          parentName,
          parentEmail
        });
        
        if (!consentValidation.valid) {
          return res.status(400).json({
            message: "Parental consent information is required for users under 18.",
            errors: consentValidation.errors,
            code: "PARENTAL_CONSENT_REQUIRED"
          });
        }
      }
      
      // Check if username already exists
      const existingUserByUsername = await storage.getUserByUsername(username);
      if (existingUserByUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      // Check if email already exists - if so, this might be a migration case
      const existingUserByEmail = await storage.getUserByEmail(email);
      if (existingUserByEmail && existingUserByEmail.password) {
        return res.status(400).json({ message: "Email already registered with password. Please login instead." });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      let user;
      if (existingUserByEmail && !existingUserByEmail.password) {
        // This is a migration case - update existing user with password and username
        console.log(`Migrating existing user ${existingUserByEmail.id} with email ${email}`);
        user = await storage.migrateUserToPasswordAuth(existingUserByEmail.id, {
          username,
          password: hashedPassword,
          firstName,
          lastName,
        });
        console.log(`User migrated successfully:`, { id: user.id, username: user.username, points: user.points, balance: user.balance });
      } else {
        // Create new user with age verification
        user = await storage.createUser({
          username,
          email,
          password: hashedPassword,
          firstName,
          lastName,
          handle: username, // Use username as initial handle
          points: 50, // Welcome bonus
          balance: "0.00",
          lifetimeEarned: "0.00",
        });

        // Handle parental consent for minors (16-17 years old)
        if (dateOfBirth && requiresParentalConsent(dateOfBirth)) {
          const userAge = calculateAge(dateOfBirth);
          console.log(`Minor registration detected: ${username} (age ${userAge}) - sending parental consent verification`);
          
          try {
            await sendParentalConsentVerification({
              minorName: `${firstName} ${lastName}`,
              minorEmail: email,
              minorAge: userAge,
              parentName,
              parentEmail,
              username,
              dateOfBirth
            });
            
            console.log(`Parental consent email sent for minor ${username} to ${parentEmail}`);
          } catch (error) {
            console.error(`Failed to send parental consent email for ${username}:`, error);
          }
        }

        // Initiate background check for new users to protect minors
        if (dateOfBirth) {
          console.log(`Initiating background check for user ${user.id} (${username})`);
          try {
            const backgroundCheck = await initiateBackgroundCheck(user.id, {
              email,
              firstName,
              lastName,
              dateOfBirth
            });
            console.log(`Background check initiated: ${backgroundCheck.referenceId}`);
          } catch (error) {
            console.error(`Background check initiation failed for user ${user.id}:`, error);
            // Don't fail registration, but log the issue
          }
        }
      }

      // Auto-login after registration
      req.login(user, (err) => {
        if (err) return next(err);
        
        const responseData: any = {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          handle: user.handle,
          points: user.points,
          balance: user.balance,
          lifetimeEarned: user.lifetimeEarned,
        };

        // Add parental consent status for minors
        if (dateOfBirth && requiresParentalConsent(dateOfBirth)) {
          const userAge = calculateAge(dateOfBirth);
          responseData.requiresParentalConsent = true;
          responseData.age = userAge;
          responseData.parentalConsentStatus = 'pending';
          responseData.message = `Account created successfully! Since you're ${userAge} years old, a verification email has been sent to your parent/guardian at ${parentEmail}. Your account will have limited access until parental consent is confirmed.`;
        } else {
          responseData.message = 'Account created successfully! Welcome to Pocket Bounty.';
        }
        
        res.status(201).json(responseData);
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Authentication error" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      
      req.login(user, (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ message: "Login failed" });
        }
        
        // Force save session before responding
        req.session.save((saveErr: any) => {
          if (saveErr) {
            return res.status(500).json({ message: "Session save failed" });
          }
          
          res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            handle: user.handle,
            points: user.points,
            balance: user.balance,
            lifetimeEarned: user.lifetimeEarned,
          });
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const user = req.user as User;
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

export function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

export { hashPassword, comparePasswords };