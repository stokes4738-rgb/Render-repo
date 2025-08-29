import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { validateMinimumAge, initiateBackgroundCheck, requiresParentalConsent, validateParentalConsent, calculateAge } from "./middleware/ageVerification";
import { sendParentalConsentVerification, createMinorAccountNotice } from "./utils/parentalConsent";
import { getClientIp, emergencyIPBan, flagSuspiciousIP } from "./middleware/ipBanning";
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
      const queryTimeout = 10000; // 10 seconds for user deserialization
      
      const user = await Promise.race([
        storage.getUser(id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('User deserialization timeout')), queryTimeout)
        )
      ]).catch((error) => {
        console.error("User deserialization failed:", error);
        return null;
      });
      
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
      
      // Add timeout protection for database operations
      const queryTimeout = 15000; // 15 seconds for auth operations
      
      // Check if username already exists
      const existingUserByUsername = await Promise.race([
        storage.getUserByUsername(username),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Username check timeout')), queryTimeout)
        )
      ]).catch((error) => {
        console.error("Username check failed:", error);
        return null; // Allow registration to continue if check fails
      });
      
      if (existingUserByUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      // Check if email already exists - if so, this might be a migration case
      const existingUserByEmail = await Promise.race([
        storage.getUserByEmail(email),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Email check timeout')), queryTimeout)
        )
      ]).catch((error) => {
        console.error("Email check failed:", error);
        return null; // Allow registration to continue if check fails
      });
      if (existingUserByEmail && existingUserByEmail.password) {
        return res.status(400).json({ message: "Email already registered with password. Please login instead." });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      let user;
      if (existingUserByEmail && !existingUserByEmail.password) {
        // This is a migration case - update existing user with password and username
        console.log(`Migrating existing user ${existingUserByEmail.id} with email ${email}`);
        user = await Promise.race([
          storage.migrateUserToPasswordAuth(existingUserByEmail.id, {
            username,
            password: hashedPassword,
            firstName,
            lastName,
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('User migration timeout')), queryTimeout)
          )
        ]);
        console.log(`User migrated successfully:`, { id: user.id, username: user.username, points: user.points, balance: user.balance });
      } else {
        // Create new user with age verification
        user = await Promise.race([
          storage.createUser({
            username,
            email,
            password: hashedPassword,
            firstName,
            lastName,
            handle: username, // Use username as initial handle
            points: 50, // Welcome bonus
            balance: "0.00",
            lifetimeEarned: "0.00",
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('User creation timeout')), queryTimeout)
          )
        ]);

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

        // CRITICAL SAFETY CHECK: Background screening for all new users
        if (dateOfBirth) {
          const clientIp = getClientIp(req);
          console.log(`🔍 SAFETY SCREENING: Initiating comprehensive background check for user ${user.id} (${username}) from IP ${clientIp}`);
          
          try {
            const backgroundCheck = await initiateBackgroundCheck(user.id, {
              email,
              firstName,
              lastName,
              dateOfBirth
            }, clientIp);
            
            console.log(`Background check initiated: ${backgroundCheck.referenceId}`);
            console.log(`Risk level: ${backgroundCheck.riskLevel}`);
            
            // IMMEDIATE ACTION for high-risk users
            if (backgroundCheck.status === 'FAILED' || backgroundCheck.riskLevel === 'HIGH') {
              console.log(`🚨 HIGH RISK USER DETECTED - TAKING IMMEDIATE ACTION 🚨`);
              
              // Emergency IP ban for sex offenders or high-risk individuals
              await emergencyIPBan(
                user.id, 
                clientIp, 
                `Failed background check: ${backgroundCheck.alerts.join(', ')}`
              );
              
              // Prevent login and return error
              return res.status(403).json({
                message: "Account creation blocked due to safety concerns. If you believe this is an error, please contact support.",
                code: "SAFETY_SCREENING_FAILED"
              });
            }
            
            // Flag suspicious but not immediately dangerous
            if (backgroundCheck.requiresManualReview) {
              flagSuspiciousIP(clientIp, 'User requires manual review');
              console.log(`⚠️ User ${user.id} flagged for manual review`);
            }
            
          } catch (error) {
            console.error(`CRITICAL: Background check failed for user ${user.id}:`, error);
            // Flag IP as suspicious due to check failure
            flagSuspiciousIP(getClientIp(req), 'Background check system error');
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
    // Add overall timeout for login process
    const loginTimeout = 20000; // 20 seconds for complete login
    let isTimedOut = false;
    
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      res.status(408).json({ message: "Login timeout - please try again" });
    }, loginTimeout);
    
    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      if (isTimedOut) return; // Prevent double response
      
      if (err) {
        clearTimeout(timeoutId);
        return res.status(500).json({ message: "Authentication error" });
      }
      if (!user) {
        clearTimeout(timeoutId);
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      
      req.login(user, (loginErr) => {
        if (isTimedOut) return; // Prevent double response
        
        if (loginErr) {
          clearTimeout(timeoutId);
          return res.status(500).json({ message: "Login failed" });
        }
        
        // Force save session before responding with timeout protection
        const sessionTimeout = 5000; // 5 seconds for session save
        let sessionTimedOut = false;
        
        const sessionTimeoutId = setTimeout(() => {
          sessionTimedOut = true;
          if (!isTimedOut) {
            clearTimeout(timeoutId);
            res.status(500).json({ message: "Session save timeout" });
          }
        }, sessionTimeout);
        
        req.session.save((saveErr: any) => {
          if (isTimedOut || sessionTimedOut) return; // Prevent double response
          
          clearTimeout(timeoutId);
          clearTimeout(sessionTimeoutId);
          
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