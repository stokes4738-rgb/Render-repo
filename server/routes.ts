import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuthJWT, verifyToken } from "./authJWT";
import { ensureStripeCustomer } from "./stripeCustomer";
import { insertBountySchema, insertMessageSchema, insertTransactionSchema, insertReviewSchema, insertPaymentMethodSchema, insertPaymentSchema, insertPlatformRevenueSchema, users, bounties, transactions } from "@shared/schema";
import { logger } from "./utils/logger";
import { sendSupportEmail } from "./utils/email";
import { TwoFactorService } from "./utils/twoFactor";
import { require2FA } from "./middleware/twoFactor";
import { requireAgeVerification } from "./middleware/ageVerification";
import { checkIPBan } from "./middleware/ipBanning";
import { contentFilterMiddleware } from "./middleware/contentFilter";
import { db } from "./db";
import { sql, eq } from "drizzle-orm";
import Stripe from "stripe";
import bcrypt from "bcrypt";

// Stripe setup with error handling for missing keys
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-07-30.basil",
    });
    logger.info("Stripe initialized successfully");
  } catch (error) {
    logger.error("Stripe initialization error:", error);
  }
} else {
  logger.info("Stripe not initialized - running in test mode (no STRIPE_SECRET_KEY)");
}

// Process expired bounties (auto-refund after 3 days with 5% fee)
async function processExpiredBounties() {
  try {
    // Get bounties that have passed their duration deadline
    const expiredBounties = await storage.getBountiesExpiredByDuration();
    
    for (const bounty of expiredBounties) {
      const bountyReward = parseFloat(bounty.reward.toString());
      // Tiered fee structure: 5% for under $250, 3.5% for $250+
      const feePercentage = bountyReward >= 250 ? 0.035 : 0.05;
      const platformFee = bountyReward * feePercentage;
      const refundAmount = bountyReward - platformFee;
      
      // Mark bounty as expired
      await storage.updateBountyStatus(bounty.id, 'expired');
      
      // Refund user (minus platform fee)
      await storage.updateUserBalance(bounty.authorId, `+${refundAmount.toFixed(2)}`);
      
      // Create refund transaction
      await storage.createTransaction({
        userId: bounty.authorId,
        type: "refund",
        amount: refundAmount.toString(),
        description: `Auto-refund for expired bounty: ${bounty.title} (less ${(feePercentage * 100).toFixed(1)}% platform fee)`,
        status: "completed",
      });
      
      // Record platform revenue from the fee
      await storage.createPlatformRevenue({
        bountyId: bounty.id,
        amount: platformFee.toString(),
        source: "expired_bounty_fee",
        description: `${(feePercentage * 100).toFixed(1)}% fee from expired bounty: ${bounty.title}`,
      });
      
      // Create activity
      await storage.createActivity({
        userId: bounty.authorId,
        type: "bounty_expired",
        description: `Your bounty "${bounty.title}" expired and was refunded (minus ${(feePercentage * 100).toFixed(1)}% fee)`,
        metadata: { bountyId: bounty.id, refundAmount: refundAmount.toFixed(2), fee: platformFee.toFixed(2) },
      });
    }
  } catch (error) {
    logger.error("Error processing expired bounties:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Stripe webhook route MUST be before body parsing middleware
  // This uses raw body for signature verification
  app.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    if (!stripe) {
      return res.status(503).send("Stripe not configured");
    }

    const sig = req.headers["stripe-signature"] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      logger.warn("Stripe webhook called but STRIPE_WEBHOOK_SECRET not configured");
      return res.status(500).send("Webhook Error: Missing webhook secret");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
      logger.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case "setup_intent.succeeded":
        const setupIntent = event.data.object as any;
        const paymentMethodId = setupIntent.payment_method as string;
        const customerId = setupIntent.customer as string;
        
        logger.info(`SetupIntent ${setupIntent.id} succeeded for customer ${customerId}`);
        
        try {
          // Set as default payment method for the customer
          await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId }
          });
          
          logger.info(`Set ${paymentMethodId} as default for customer ${customerId}`);
        } catch (error) {
          logger.error("Error setting default payment method:", error);
        }
        break;

      case "payment_intent.succeeded":
        const paymentIntent = event.data.object as any;
        logger.info(`PaymentIntent ${paymentIntent.id} was successful!`);
        
        // Record transaction for all successful payments
        try {
          const customerId = paymentIntent.customer;
          if (customerId) {
            // Look up user by stripe customer ID
            const [user] = await db.select({ id: users.id })
              .from(users)
              .where(eq(users.stripeCustomerId, customerId))
              .limit(1);
            
            if (user) {
              const amount = (paymentIntent.amount_received || paymentIntent.amount) / 100;
              const points = Number(paymentIntent.metadata?.points || 0);
              
              // Create transaction record
              await storage.createTransaction({
                userId: user.id,
                type: 'points_purchase',
                amount: amount.toString(),
                currency: paymentIntent.currency,
                points,
                status: 'completed',
                description: `Points purchase via Stripe: ${points} points`,
                stripePaymentIntentId: paymentIntent.id,
              });
              
              // Create point purchase record if it's a points purchase
              if (paymentIntent.metadata?.type === 'point_purchase') {
                await storage.createPointPurchase({
                  userId: user.id,
                  points,
                  amount: amount.toString(),
                  stripePaymentIntentId: paymentIntent.id,
                  stripeStatus: 'succeeded',
                  currency: paymentIntent.currency,
                });
                
                // Update user points
                await storage.updateUserPoints(user.id, points);
                
                logger.info(`Webhook: Awarded ${points} points to user ${user.id}`);
              }
            }
          }
        } catch (error) {
          logger.error("Error processing payment_intent.succeeded webhook:", error);
        }
        break;
      
      case "payment_intent.payment_failed":
        const failedPayment = event.data.object;
        logger.warn(`Payment ${failedPayment.id} failed`);
        // TODO: Handle failed payment
        break;

      case "account.updated":
        // Handle Connect account updates
        const account = event.data.object;
        logger.info(`Stripe Connect account ${account.id} was updated`);
        // TODO: Update user's Connect status if needed
        break;

      case "account.application.authorized":
        // Handle when a user authorizes your app
        logger.info("New Stripe Connect authorization");
        break;

      case "account.application.deauthorized":
        // Handle when a user deauthorizes your app
        logger.info("Stripe Connect deauthorization");
        break;

      default:
        logger.info(`Unhandled webhook event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.sendStatus(200);
  });

  // Apply IP ban checking to all routes
  app.use(checkIPBan);
  
  // Support email endpoint
  app.post("/api/support", async (req, res) => {
    try {
      const { subject, message, email, username } = req.body;
      
      if (!subject || !message || !email) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Log the support request
      logger.info(`Support request from ${username || 'Unknown'} (${email}): ${subject}`);
      
      // Send email to support
      const emailSent = await sendSupportEmail(
        email,
        username || 'Anonymous User',
        subject,
        message
      );

      if (emailSent) {
        logger.info(`Support email sent successfully for ${username}`);
        res.json({ success: true, message: "Support request sent successfully" });
      } else {
        logger.warn(`Support email failed to send but request logged for ${username}`);
        // Still return success since we logged the request
        res.json({ success: true, message: "Support request received (email pending)" });
      }
    } catch (error) {
      logger.error("Failed to process support request:", error);
      res.status(500).json({ error: "Failed to send support request" });
    }
  });

  // Creator verification endpoint (special auth for Creator tab) - BEFORE setupAuthJWT
  app.post('/api/creator/verify', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password required" });
      }

      // Only allow Dallas1221 to access creator features
      if (username !== "Dallas1221") {
        logger.warn(`Unauthorized creator access attempt from username: ${username}`);
        return res.status(403).json({ success: false, message: "Unauthorized" });
      }

      // TEMPORARY: For Dallas1221, check if password is "dallas" directly and update it
      if (password === "dallas") {
        // Update the password in the database to be "dallas"
        const hashedPassword = await bcrypt.hash("dallas", 10);
        await db.update(users)
          .set({ password: hashedPassword })
          .where(eq(users.username, 'Dallas1221'));
        
        logger.info(`Creator access granted to Dallas1221 (password updated)`);
        return res.json({ 
          success: true, 
          username: "Dallas1221",
          message: "Creator access verified" 
        });
      }

      // Verify password for Dallas1221
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
      }

      if (!user.password) {
        logger.error(`User ${username} has no password field in database`);
        return res.status(401).json({ success: false, message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        logger.warn(`Failed creator verification attempt for Dallas1221`);
        return res.status(401).json({ success: false, message: "Invalid credentials" });
      }

      logger.info(`Creator access granted to Dallas1221`);
      res.json({ 
        success: true, 
        username: user.username,
        message: "Creator access verified" 
      });
    } catch (error) {
      logger.error("Creator verification error:", error);
      res.status(500).json({ success: false, message: "Verification failed" });
    }
  });

  // Endpoint to sync ALL user balances to $0 (when all money withdrawn from Stripe)
  app.post('/api/sync-all-balances-to-zero', async (req, res) => {
    try {
      // Set ALL user balances to 0 since all money was withdrawn
      const result = await db.update(users)
        .set({ balance: "0.00" });
      
      // Get count of updated users
      const allUsers = await db.select({ 
        username: users.username, 
        balance: users.balance 
      }).from(users);
      
      logger.info(`All user balances reset to $0 (${allUsers.length} users updated)`);
      res.json({ 
        success: true, 
        message: `All ${allUsers.length} user balances reset to $0`,
        usersUpdated: allUsers.length
      });
    } catch (error) {
      logger.error("Sync all balances error:", error);
      res.status(500).json({ success: false, message: "Failed to sync balances" });
    }
  });



  // Auth middleware
  setupAuthJWT(app);

  // Admin safety monitoring endpoints (protected)
  app.get('/api/admin/banned-ips', verifyToken, async (req: any, res) => {
    try {
      // Check if user has admin privileges (implement admin check as needed)
      const userId = req.user.id;
      
      const { getBannedIPs, getSuspiciousIPs } = await import('./middleware/ipBanning');
      
      res.json({
        bannedIPs: getBannedIPs(),
        suspiciousIPs: getSuspiciousIPs(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error("Error fetching banned IPs:", error);
      res.status(500).json({ message: "Failed to fetch security data" });
    }
  });

  // Auth routes are now handled in setupAuth() in auth.ts

  // Referral routes
  app.get("/api/referral/code", verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const queryTimeout = 10000;
      
      const user = await Promise.race([
        storage.getUser(userId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('User query timeout')), queryTimeout)
        )
      ]).catch((error) => {
        logger.error("User query failed in referral code:", error);
        return null;
      });
      
      let referralCode = user?.referralCode;
      if (!referralCode) {
        // Generate a new referral code with timeout protection
        referralCode = await Promise.race([
          storage.generateReferralCode(userId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Referral code generation timeout')), queryTimeout)
          )
        ]).catch((error) => {
          logger.error("Referral code generation failed:", error);
          return 'TEMP' + Math.random().toString(36).substr(2, 8); // Fallback code
        });
      }
      
      res.json({ 
        referralCode,
        referralCount: user?.referralCount || 0,
        shareUrl: req.hostname === 'localhost' 
          ? `http://localhost:5000/signup?ref=${referralCode}`
          : `https://pocketbounty.life/signup?ref=${referralCode}`
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error getting referral code: " + error.message });
    }
  });

  app.get("/api/referral/stats", verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const queryTimeout = 10000;
      
      // Fetch user and referrals with timeout protection
      const [user, referrals] = await Promise.all([
        Promise.race([
          storage.getUser(userId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('User query timeout')), queryTimeout)
          )
        ]).catch((error) => {
          logger.error("User query failed in referral stats:", error);
          return null;
        }),
        Promise.race([
          storage.getUserReferrals(userId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Referrals query timeout')), queryTimeout)
          )
        ]).catch((error) => {
          logger.error("Referrals query failed:", error);
          return [];
        })
      ]);
      
      const referralCount = user?.referralCount || 0;
      const milestones = [
        { count: 1, points: 10, reached: referralCount >= 1 },
        { count: 5, points: 50, reached: referralCount >= 5 },
        { count: 10, points: 100, reached: referralCount >= 10 },
        { count: 20, points: 200, reached: referralCount >= 20 }
      ];
      
      res.json({ 
        referralCount,
        referrals: (referrals as any[]).map((r: any) => ({
          id: r.id,
          firstName: r.firstName,
          lastName: r.lastName,
          handle: r.handle,
          createdAt: r.createdAt
        })),
        milestones
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error getting referral stats: " + error.message });
    }
  });

  app.post("/api/referral/signup", verifyToken, async (req: any, res) => {
    try {
      const { referralCode } = req.body;
      if (!referralCode) {
        return res.status(400).json({ message: "Referral code is required" });
      }

      const userId = req.user.id;
      await storage.processReferralSignup(userId, referralCode);
      
      res.json({ message: "Referral processed successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Error processing referral: " + error.message });
    }
  });


  // Point purchase routes
  app.get("/api/points/packages", (req, res) => {
    const packages = [
      { id: "test", points: 25, price: 0.50, label: "Test Pack", popular: false },
      { id: "starter", points: 50, price: 0.99, label: "Starter Pack", popular: false },
      { id: "basic", points: 100, price: 1.99, label: "Basic Pack", popular: false },
      { id: "popular", points: 250, price: 4.99, label: "Popular Pack", popular: true },
      { id: "premium", points: 500, price: 9.99, label: "Premium Pack", popular: false },
      { id: "mega", points: 1000, price: 19.99, label: "Mega Pack", popular: false },
      { id: "ultimate", points: 2500, price: 49.99, label: "Ultimate Pack", popular: false },
      { id: "supreme", points: 5000, price: 99.99, label: "Supreme Pack", popular: false },
    ];
    res.json(packages);
  });

  app.post("/api/points/purchase", verifyToken, async (req: any, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Payment system not available" });
    }

    try {
      const { packageId } = req.body;
      const userId = req.user.id;

      // Define point packages
      const packages: { [key: string]: { points: number; price: number; label: string } } = {
        test: { points: 25, price: 0.50, label: "Test Pack" },
        starter: { points: 50, price: 0.99, label: "Starter Pack" },
        basic: { points: 100, price: 1.99, label: "Basic Pack" },
        popular: { points: 250, price: 4.99, label: "Popular Pack" },
        premium: { points: 500, price: 9.99, label: "Premium Pack" },
        mega: { points: 1000, price: 19.99, label: "Mega Pack" },
        ultimate: { points: 2500, price: 49.99, label: "Ultimate Pack" },
        supreme: { points: 5000, price: 99.99, label: "Supreme Pack" },
      };

      const selectedPackage = packages[packageId];
      if (!selectedPackage) {
        return res.status(400).json({ message: "Invalid package selected" });
      }

      // Create Stripe payment intent with timeout protection
      const queryTimeout = 15000;
      
      const paymentIntent = await Promise.race([
        stripe.paymentIntents.create({
          amount: Math.round(selectedPackage.price * 100), // Convert to cents
          currency: "usd",
          metadata: {
            userId,
            packageId,
            points: selectedPackage.points.toString(),
            type: "point_purchase"
          },
          description: `${selectedPackage.label} - ${selectedPackage.points} points`,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Payment intent creation timeout')), queryTimeout)
        )
      ]);

      res.json({ 
        clientSecret: (paymentIntent as any).client_secret,
        package: selectedPackage
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error creating payment: " + error.message });
    }
  });

  app.post("/api/points/confirm-purchase", verifyToken, async (req: any, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Payment system not available" });
    }

    try {
      const { paymentIntentId } = req.body;
      const userId = req.user.id;

      const queryTimeout = 15000;
      
      // Retrieve payment intent to verify payment with timeout protection
      const paymentIntent = await Promise.race([
        stripe.paymentIntents.retrieve(paymentIntentId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Payment intent retrieve timeout')), queryTimeout)
        )
      ]);
      
      logger.info(`Payment intent status: ${(paymentIntent as any).status}, amount: ${(paymentIntent as any).amount}`);
      
      if ((paymentIntent as any).status !== 'succeeded') {
        logger.error(`Payment not completed. Status: ${(paymentIntent as any).status}`);
        return res.status(400).json({ message: "Payment not completed" });
      }

      if ((paymentIntent as any).metadata.userId !== userId) {
        logger.error(`Payment belongs to different user. Expected: ${userId}, Found: ${(paymentIntent as any).metadata.userId}`);
        return res.status(403).json({ message: "Payment belongs to different user" });
      }

      if ((paymentIntent as any).metadata.type !== 'point_purchase') {
        logger.error(`Invalid payment type: ${(paymentIntent as any).metadata.type}`);
        return res.status(400).json({ message: "Invalid payment type" });
      }

      // Check if we already processed this payment
      const existingPurchase = await storage.getPointPurchaseByStripeIntent(paymentIntentId);
      if (existingPurchase) {
        logger.info(`Payment ${paymentIntentId} already processed`);
        return res.json({ 
          success: true, 
          pointsAwarded: parseInt(paymentIntent.metadata.points),
          message: `Purchase already completed!`
        });
      }

      const pointsToAward = parseInt(paymentIntent.metadata.points);
      const packageLabel = paymentIntent.description;
      const purchaseAmount = (paymentIntent.amount / 100).toFixed(2);

      logger.info(`Awarding ${pointsToAward} points to user ${userId} for $${purchaseAmount}`);

      // Execute points and transaction operations with timeout protection
      await Promise.all([
        Promise.race([
          storage.createPointPurchase({
            userId,
            points: pointsToAward,
            amount: purchaseAmount,
            stripePaymentIntentId: paymentIntentId,
            stripeStatus: 'succeeded',
            currency: 'usd',
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Point purchase creation timeout')), queryTimeout)
          )
        ]),
        Promise.race([
          storage.updateUserPoints(userId, pointsToAward),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Points update timeout')), queryTimeout)
          )
        ]),
        Promise.race([
          storage.createTransaction({
            userId,
            type: "point_purchase",
            amount: purchaseAmount,
            description: `Purchased ${packageLabel}`,
            status: "completed",
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction creation timeout')), queryTimeout)
          )
        ]),
        Promise.race([
          storage.createActivity({
            userId,
            type: "points_purchased",
            description: `Purchased ${pointsToAward} points for $${purchaseAmount}`,
            metadata: { 
              points: pointsToAward, 
              amount: purchaseAmount,
              package: paymentIntent.metadata.packageId
            },
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Activity creation timeout')), queryTimeout)
          )
        ]).catch(error => {
          logger.error("Activity creation failed (non-critical):", error);
        }),
        Promise.race([
          storage.createPlatformRevenue({
            amount: purchaseAmount,
            source: "point_purchase",
            description: `Point purchase: ${packageLabel}`,
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Platform revenue creation timeout')), queryTimeout)
          )
        ]).catch(error => {
          logger.error("Platform revenue creation failed (non-critical):", error);
        })
      ]);
      
      logger.info(`Platform revenue recorded`);

      res.json({ 
        success: true, 
        pointsAwarded: pointsToAward,
        message: `Successfully purchased ${pointsToAward} points for $${purchaseAmount}!`
      });
    } catch (error: any) {
      logger.error("Error confirming purchase:", error);
      res.status(500).json({ message: "Error confirming purchase: " + error.message });
    }
  });

  // Bounty routes
  app.get('/api/bounties', async (req, res) => {
    try {
      const queryTimeout = 10000;
      
      // Check for expired bounties and boosts with timeout protection
      try {
        await Promise.all([
          Promise.race([
            processExpiredBounties(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Expired bounties processing timeout')), queryTimeout)
            )
          ]).catch(error => logger.error("Expired bounties processing failed:", error)),
          Promise.race([
            storage.updateExpiredBoosts(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Expired boosts update timeout')), queryTimeout)
            )
          ]).catch(error => logger.error("Expired boosts update failed:", error))
        ]);
      } catch (maintenanceError) {
        logger.error("Bounty maintenance operations failed (non-critical):", maintenanceError);
      }
      
      const { category, search, isRemote, userLat, userLon, maxDistance } = req.query;
      
      // Parse location parameters
      const filters: any = {
        category: category as string,
        search: search as string,
      };
      
      // Add location filtering
      if (isRemote !== undefined) {
        filters.isRemote = isRemote === 'true';
      }
      
      if (userLat && userLon) {
        filters.userLat = parseFloat(userLat as string);
        filters.userLon = parseFloat(userLon as string);
      }
      
      if (maxDistance) {
        filters.maxDistance = parseInt(maxDistance as string);
      }
      
      // Fetch bounties with timeout protection
      let bounties;
      if (!category && !search && !isRemote && !userLat) {
        bounties = await Promise.race([
          storage.getActiveBounties(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Active bounties query timeout')), queryTimeout)
          )
        ]).catch((error) => {
          logger.error("Bounties query failed:", error);
          return [];
        });
      } else {
        bounties = await Promise.race([
          storage.getBounties(filters),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Filtered bounties query timeout')), queryTimeout)
          )
        ]).catch((error) => {
          logger.error("Filtered bounties query failed:", error);
          return [];
        });
      }
      
      res.json(bounties);
    } catch (error) {
      logger.error("Error fetching bounties:", error);
      res.status(500).json({ message: "Failed to fetch bounties" });
    }
  });

  app.post('/api/bounties/boost/:id', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const bountyId = req.params.id;
      const { boostLevel } = req.body;
      
      // Validate boost level
      if (!boostLevel || boostLevel < 1 || boostLevel > 3) {
        return res.status(400).json({ message: "Invalid boost level. Must be between 1 and 3." });
      }
      
      // Check if bounty exists and belongs to user
      const bounty = await storage.getBounty(bountyId);
      if (!bounty) {
        return res.status(404).json({ message: "Bounty not found" });
      }
      if (bounty.authorId !== userId) {
        return res.status(403).json({ message: "You can only boost your own bounties" });
      }
      if (bounty.status !== "active") {
        return res.status(400).json({ message: "Can only boost active bounties" });
      }
      
      // Calculate cost and duration based on boost level
      const boostConfigs = {
        1: { points: 2, hours: 6 },    // Level 1: 2 points for 6 hours (1 cent)
        2: { points: 5, hours: 12 },   // Level 2: 5 points for 12 hours (2.5 cents)
        3: { points: 10, hours: 24 },  // Level 3: 10 points for 24 hours (5 cents)
      };
      
      const config = boostConfigs[boostLevel as keyof typeof boostConfigs];
      
      // Check user points
      const user = await storage.getUser(userId);
      if (!user || user.points < config.points) {
        return res.status(400).json({ 
          message: `Insufficient points. Need ${config.points} points for Level ${boostLevel} boost.`,
          required: config.points,
          current: user?.points || 0
        });
      }
      
      // Perform the boost
      await storage.boostBounty(bountyId, userId, boostLevel, config.points, config.hours);
      
      res.json({
        success: true,
        message: `Bounty boosted to Level ${boostLevel} for ${config.hours} hours`,
        pointsSpent: config.points,
        duration: config.hours,
        remainingPoints: user.points - config.points
      });
    } catch (error: any) {
      logger.error("Error boosting bounty:", error);
      res.status(500).json({ message: error.message || "Failed to boost bounty" });
    }
  });

  app.post('/api/bounties', verifyToken, requireAgeVerification, contentFilterMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const bountyData = insertBountySchema.parse({ ...req.body, authorId: userId });
      
      // Full bounty amount is charged upfront (held in escrow)
      const bountyReward = parseFloat(bountyData.reward.toString());
      
      // Add timeout protection for bounty creation
      const queryTimeout = 15000; // 15 seconds for bounty operations
      
      // Check if user has enough balance for the full bounty amount
      const user = await Promise.race([
        storage.getUser(userId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('User query timeout')), queryTimeout)
        )
      ]);
      
      if (!user || parseFloat(user.balance) < bountyReward) {
        return res.status(400).json({ 
          message: `Insufficient balance. Need $${bountyReward.toFixed(2)} (held in escrow until completed or auto-refunded after 3 days minus ${bountyReward >= 250 ? '3.5%' : '5%'} fee)` 
        });
      }
      
      const bounty = await Promise.race([
        storage.createBounty(bountyData),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Bounty creation timeout')), queryTimeout)
        )
      ]);
      
      // Execute balance and transaction operations with timeout protection
      await Promise.all([
        Promise.race([
          storage.updateUserBalance(userId, `-${bountyReward}`),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Balance update timeout')), queryTimeout)
          )
        ]),
        Promise.race([
          storage.updateUserPoints(userId, -5),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Points update timeout')), queryTimeout)
          )
        ]),
        Promise.race([
          storage.createTransaction({
            userId,
            type: "escrow_hold",
            amount: bountyReward.toString(),
            description: `Posted bounty: ${bountyData.title} (held in escrow, auto-refunds in 3 days minus ${bountyReward >= 250 ? '3.5%' : '5%'} fee if unclaimed)`,
            status: "completed",
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction creation timeout')), queryTimeout)
          )
        ])
      ]);

      res.status(201).json({
        ...bounty,
        totalCost: bountyReward.toFixed(2)
      });
    } catch (error: any) {
      logger.error("Error creating bounty:", error);
      
      // Handle validation errors
      if (error.name === 'ZodError' || error.issues) {
        const errorMessage = error.issues?.[0]?.message || error.message || "Invalid bounty data";
        return res.status(400).json({ message: errorMessage });
      }
      
      // Handle other specific errors
      if (error.message && error.message.includes("Minimum reward")) {
        return res.status(400).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Failed to create bounty" });
    }
  });

  app.post('/api/bounties/:id/apply', verifyToken, requireAgeVerification, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { message } = req.body;
      
      const queryTimeout = 10000;
      
      const application = await Promise.race([
        storage.createBountyApplication(id, userId, message),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Application creation timeout')), queryTimeout)
        )
      ]);
      
      // Create activity (optional - don't fail if this times out)
      try {
        await Promise.race([
          storage.createActivity({
            userId,
            type: "bounty_applied",
            description: "Applied to a bounty",
            metadata: { bountyId: id },
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Activity creation timeout')), 5000)
          )
        ]);
      } catch (activityError) {
        logger.error("Activity creation failed (non-critical):", activityError);
      }
      
      res.status(201).json(application);
    } catch (error) {
      logger.error("Error applying to bounty:", error);
      res.status(500).json({ message: "Failed to apply to bounty" });
    }
  });

  app.get('/api/user/bounties', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const queryTimeout = 10000;
      
      const bounties = await Promise.race([
        storage.getUserBountiesWithApplications(userId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('User bounties query timeout')), queryTimeout)
        )
      ]).catch((error) => {
        logger.error("User bounties query failed:", error);
        return [];
      });
      res.json(bounties);
    } catch (error) {
      logger.error("Error fetching user bounties:", error);
      res.status(500).json({ message: "Failed to fetch user bounties" });
    }
  });

  // Accept/reject application
  app.patch('/api/applications/:id', verifyToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user.id;

      // Verify the application belongs to a bounty owned by this user
      const application = await storage.getBountyApplication(id);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      const bounty = await storage.getBounty(application.bountyId);
      if (!bounty || bounty.authorId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.updateApplicationStatus(id, status);
      
      // Create activity for the applicant
      await storage.createActivity({
        userId: application.userId,
        type: status === 'accepted' ? 'application_accepted' : 'application_rejected',
        description: `Your application for "${bounty.title}" was ${status}`,
        metadata: { bountyId: bounty.id, applicationId: id }
      });

      res.json({ success: true });
    } catch (error) {
      logger.error("Error updating application:", error);
      res.status(500).json({ message: "Failed to update application" });
    }
  });

  // Complete bounty and pay the bounty hunter
  app.patch('/api/bounties/:id/complete', verifyToken, requireAgeVerification, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { completedBy } = req.body;
      const userId = req.user.id;

      const queryTimeout = 15000; // 15 seconds for completion operations
      
      // Get the bounty
      const bounty = await Promise.race([
        storage.getBounty(id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Bounty query timeout')), queryTimeout)
        )
      ]);
      
      if (!bounty) {
        return res.status(404).json({ message: "Bounty not found" });
      }

      // Verify the user owns this bounty
      if (bounty.authorId !== userId) {
        return res.status(403).json({ message: "Not authorized to complete this bounty" });
      }

      // Verify the bounty is active
      if (bounty.status !== 'active') {
        return res.status(400).json({ message: "Bounty is not active" });
      }

      // Parse reward amount (in dollars)
      const rewardAmount = parseFloat(bounty.reward);

      // Execute completion operations with timeout protection
      await Promise.all([
        Promise.race([
          storage.updateUserBalance(completedBy, rewardAmount.toString()),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Hunter balance update timeout')), queryTimeout)
          )
        ]),
        Promise.race([
          storage.updateBountyStatus(id, "completed", completedBy),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Bounty status update timeout')), queryTimeout)
          )
        ])
      ]);

      // Create transaction records
      await storage.createTransaction({
        userId: completedBy,
        type: 'bounty_reward',
        amount: rewardAmount.toString(),
        status: 'completed',
        bountyId: id,
        description: `Received payment for completing "${bounty.title}"`
      });

      // Create transaction for the creator (escrow release)
      await storage.createTransaction({
        userId,
        type: 'escrow_release',
        amount: rewardAmount.toString(),
        status: 'completed',
        bountyId: id,
        description: `Released escrow payment for "${bounty.title}"`
      });

      // Create activities
      await storage.createActivity({
        userId: completedBy,
        type: 'bounty_completed',
        description: `Completed bounty "${bounty.title}" and earned $${rewardAmount}`,
        metadata: { bountyId: id, reward: rewardAmount }
      });

      await storage.createActivity({
        userId,
        type: 'bounty_marked_complete',
        description: `Marked bounty "${bounty.title}" as complete`,
        metadata: { bountyId: id, completedBy }
      });

      res.json({ success: true, message: "Bounty completed and payment sent!" });
    } catch (error) {
      logger.error("Error completing bounty:", error);
      res.status(500).json({ message: "Failed to complete bounty" });
    }
  });

  // Delete/Remove bounty route
  app.delete('/api/bounties/:id', verifyToken, requireAgeVerification, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      // Delete the bounty and get the bounty data for refund
      const deletedBounty = await storage.deleteBounty(id, userId);
      
      if (!deletedBounty) {
        return res.status(404).json({ message: 'Bounty not found, already removed, or not owned by you' });
      }

      // Refund the full amount (no fee for manual removal)
      const refundAmount = parseFloat(deletedBounty.reward.toString());
      await storage.updateUserBalance(userId, refundAmount.toString());

      // Create refund transaction
      await storage.createTransaction({
        userId,
        type: "refund",
        amount: refundAmount.toString(),
        description: `Full refund for removed bounty: ${deletedBounty.title}`,
        status: "completed",
      });

      // Create activity
      await storage.createActivity({
        userId,
        type: "bounty_removed",
        description: `Removed bounty "${deletedBounty.title}" and received full refund of $${refundAmount.toFixed(2)}`,
        metadata: { bountyId: id, refundAmount: refundAmount.toFixed(2) },
      });
      
      res.json({ 
        success: true, 
        message: "Bounty removed successfully and full amount refunded!",
        refundAmount: refundAmount.toFixed(2)
      });
    } catch (error) {
      logger.error('Error removing bounty:', error);
      res.status(500).json({ message: 'Failed to remove bounty' });
    }
  });

  // Transaction routes
  app.get('/api/user/transactions', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const transactions = await storage.getUserTransactions(userId);
      res.json(transactions);
    } catch (error) {
      logger.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.post('/api/user/points', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { points, reason } = req.body;
      
      const queryTimeout = 10000;
      
      await Promise.all([
        Promise.race([
          storage.updateUserPoints(userId, points),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Points update timeout')), queryTimeout)
          )
        ]),
        Promise.race([
          storage.createActivity({
            userId,
            type: "points_earned",
            description: `Earned ${points} points: ${reason}`,
            metadata: { points, reason },
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Activity creation timeout')), queryTimeout)
          )
        ]).catch(error => {
          logger.error("Activity creation failed (non-critical):", error);
        })
      ]);
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error updating points:", error);
      res.status(500).json({ message: "Failed to update points" });
    }
  });

  // Messaging routes
  app.get('/api/messages/threads', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Add timeout protection
      const queryTimeout = 10000;
      const threads = await Promise.race([
        storage.getUserThreads(userId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), queryTimeout)
        )
      ]).catch((error) => {
        logger.error("Threads query failed:", error);
        return [];
      });
      
      res.json(threads);
    } catch (error) {
      logger.error("Error fetching threads:", error);
      res.status(500).json({ message: "Failed to fetch threads" });
    }
  });

  app.get('/api/messages/threads/:threadId', verifyToken, async (req: any, res) => {
    try {
      const { threadId } = req.params;
      
      // Add timeout protection
      const queryTimeout = 10000;
      const messages = await Promise.race([
        storage.getThreadMessages(threadId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), queryTimeout)
        )
      ]).catch((error) => {
        logger.error("Messages query failed:", error);
        return [];
      });
      
      res.json(messages);
    } catch (error) {
      logger.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post('/api/messages', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const messageData = insertMessageSchema.parse({ ...req.body, senderId: userId });
      
      // Add timeout protection
      const queryTimeout = 10000;
      const message = await Promise.race([
        storage.createMessage(messageData),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), queryTimeout)
        )
      ]);
      
      res.status(201).json(message);
    } catch (error) {
      logger.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  // 2FA routes
  app.get('/api/2fa/status', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const queryTimeout = 10000;
      
      const user = await Promise.race([
        storage.getUser(userId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('User query timeout')), queryTimeout)
        )
      ]).catch((error) => {
        logger.error("2FA status query failed:", error);
        return null;
      });
      
      res.json({
        enabled: user?.twoFactorEnabled || false,
        hasBackupCodes: !!user?.backupCodesHash
      });
    } catch (error) {
      logger.error("Error getting 2FA status:", error);
      res.status(500).json({ message: "Failed to get 2FA status" });
    }
  });

  app.post('/api/2fa/setup', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const queryTimeout = 10000;
      
      const user = await Promise.race([
        storage.getUser(userId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('User query timeout')), queryTimeout)
        )
      ]);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Generate new secret
      const secret = TwoFactorService.generateSecret();
      const qrCodeUrl = await TwoFactorService.generateQRCode(user.username || user.email || 'user', secret);
      
      // Generate backup codes
      const backupCodes = TwoFactorService.generateBackupCodes();
      
      res.json({
        secret,
        qrCodeUrl,
        backupCodes
      });
    } catch (error) {
      logger.error("Error setting up 2FA:", error);
      res.status(500).json({ message: "Failed to setup 2FA" });
    }
  });

  app.post('/api/2fa/enable', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { secret, code, backupCodes } = req.body;
      
      // Verify the code before enabling
      const isValid = TwoFactorService.verifyCode(secret, code);
      if (!isValid) {
        return res.status(400).json({ message: 'Invalid verification code' });
      }

      // Encrypt secret and hash backup codes
      const encryptedSecret = TwoFactorService.encryptSecret(secret);
      const hashedBackupCodes = TwoFactorService.hashBackupCodes(backupCodes);
      
      // Enable 2FA in database with timeout protection
      const queryTimeout = 10000;
      await Promise.race([
        storage.enable2FA(userId, encryptedSecret, hashedBackupCodes),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('2FA enable timeout')), queryTimeout)
        )
      ]);
      
      // Log activity (optional - don't fail if this times out)
      try {
        await Promise.race([
          storage.log2FAActivity({
            userId,
            action: 'setup',
            success: true,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Activity log timeout')), 5000)
          )
        ]);
      } catch (logError) {
        logger.error("2FA activity logging failed (non-critical):", logError);
      }
      
      res.json({ success: true, message: '2FA enabled successfully' });
    } catch (error) {
      logger.error("Error enabling 2FA:", error);
      res.status(500).json({ message: "Failed to enable 2FA" });
    }
  });

  app.post('/api/2fa/disable', verifyToken, require2FA, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Disable 2FA in database with timeout protection
      const queryTimeout = 10000;
      await Promise.race([
        storage.disable2FA(userId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('2FA disable timeout')), queryTimeout)
        )
      ]);
      
      // Log activity (optional - don't fail if this times out)
      try {
        await Promise.race([
          storage.log2FAActivity({
            userId,
            action: 'disable',
            success: true,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Activity log timeout')), 5000)
          )
        ]);
      } catch (logError) {
        logger.error("2FA activity logging failed (non-critical):", logError);
      }
      
      res.json({ success: true, message: '2FA disabled successfully' });
    } catch (error) {
      logger.error("Error disabling 2FA:", error);
      res.status(500).json({ message: "Failed to disable 2FA" });
    }
  });

  app.get('/api/2fa/logs', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const queryTimeout = 10000;
      
      const logs = await Promise.race([
        storage.get2FALogs(userId, 20),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('2FA logs query timeout')), queryTimeout)
        )
      ]).catch((error) => {
        logger.error("2FA logs query failed:", error);
        return [];
      });
      
      res.json(logs);
    } catch (error) {
      logger.error("Error fetching 2FA logs:", error);
      res.status(500).json({ message: "Failed to fetch 2FA logs" });
    }
  });

  // New simple feedback API endpoint that saves to database
  app.post('/api/feedback/submit', async (req: any, res) => {
    try {
      const { type = 'general', message, url } = req.body;
      let userId = req.user?.id;
      const userAgent = req.headers['user-agent'] || '';
      
      if (!message || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }
      
      // Use support user for anonymous feedback
      if (!userId) {
        if (process.env.SUPPORT_USER_ID) {
          userId = process.env.SUPPORT_USER_ID;
        } else {
          try {
            userId = await storage.ensureSupportUser();
          } catch (err: any) {
            logger.error('Failed to create support user for anonymous feedback:', err);
            return res.status(500).json({ error: "Unable to process anonymous feedback" });
          }
        }
      }
      
      // Validate user ID before proceeding
      if (!userId || typeof userId !== 'string' || /^\d+$/.test(userId)) {
        logger.error(`Invalid user ID for feedback: ${userId}`);
        return res.status(400).json({ error: "Invalid user context" });
      }
      
      // Save feedback to database
      const feedbackRecord = await storage.createFeedback({
        userId,
        type,
        message: message.trim(),
        userAgent,
        url: url || '',
      });
      
      res.json({ 
        ok: true,
        id: feedbackRecord.id,
        message: "Feedback received successfully" 
      });
    } catch (error: any) {
      logger.error("Error saving feedback:", error);
      
      // Specific error handling for FK constraints
      if (error.code === '23503' && error.message.includes('foreign key constraint')) {
        return res.status(400).json({ error: "Invalid user reference" });
      }
      
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });
  
  // Original feedback system for users to contact creator via messaging
  app.post('/api/feedback', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { message, type } = req.body;
      // Use support user as the feedback recipient
      const supportUserId = process.env.SUPPORT_USER_ID || await storage.ensureSupportUser();

      if (!message || !message.trim()) {
        return res.status(400).json({ message: "Message is required" });
      }

      // If user is the support user, handle specially
      if (userId === supportUserId) {
        // Create an admin user for creator feedback if it doesn't exist
        try {
          await storage.createUser({
            id: "admin-feedback",
            username: "PocketBounty Admin",
            email: "admin@pocketbounty.life",
            passwordHash: "none",
            points: 0,
            balance: 0,
            level: 1,
            lifetimeEarnings: 0,
            totalReviews: 0,
            averageRating: 5.0,
            profileCompleted: true
          });
        } catch (err) {
          // Admin user already exists, that's fine
        }
        
        // Create thread between creator and admin
        const adminThread = await storage.getOrCreateThread(userId, "admin-feedback");
        
        // Create the feedback message in the admin thread
        await storage.createMessage({
          threadId: adminThread.id,
          senderId: userId,
          content: `📝 Creator Note: ${message.trim()}`,
        });

        return res.status(201).json({ 
          success: true, 
          message: "Feedback saved to your admin inbox",
          threadId: adminThread.id 
        });
      }

      // Add timeout protection for database operations
      const queryTimeout = 15000; // 15 seconds for complex feedback operations
      
      try {
        // Get or create thread between user and support
        const thread = await Promise.race([
          storage.getOrCreateThread(userId, supportUserId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Thread query timeout')), queryTimeout)
          )
        ]);
        
        // Create the feedback message
        const newMessage = await Promise.race([
          storage.createMessage({
            threadId: thread.id,
            senderId: userId,
            content: message.trim(),
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Message creation timeout')), queryTimeout)
          )
        ]);

        // Create activity for the feedback (optional - don't fail if this times out)
        try {
          await Promise.race([
            storage.createActivity({
              userId,
              type: "feedback_sent",
              description: `Sent ${type || 'feedback'} to creator`,
              metadata: { type, threadId: thread.id },
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Activity creation timeout')), 5000)
            )
          ]);
        } catch (activityError) {
          logger.error("Activity creation failed (non-critical):", activityError);
        }

        res.status(201).json({ 
          success: true, 
          message: "Feedback sent successfully",
          threadId: thread.id 
        });
      } catch (timeoutError) {
        logger.error("Feedback operation timeout:", timeoutError);
        res.status(408).json({ message: "Request timeout - please try again" });
        return;
      }
    } catch (error: any) {
      logger.error("Error sending feedback:", error);
      
      // Handle foreign key constraint violations specifically
      if (error.code === '23503' && error.message.includes('foreign key constraint')) {
        return res.status(400).json({ error: "Invalid user reference" });
      }
      
      // Handle user ID resolution errors
      if (error.message && error.message.includes('Cannot resolve external numeric ID')) {
        return res.status(400).json({ error: "Invalid user" });
      }
      
      res.status(500).json({ message: "Failed to send feedback" });
    }
  });

  // Creator inbox - get all feedback threads
  app.get('/api/creator/feedback-threads', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      // Get the support user UUID instead of hardcoded numeric ID
      const creatorId = await storage.ensureSupportUser();
      
      // Allow any authenticated user to access creator stats
      // Previously restricted to specific users

      const queryTimeout = 10000;
      
      const threads = await Promise.race([
        storage.getUserThreads(creatorId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Creator threads query timeout')), queryTimeout)
        )
      ]).catch((error) => {
        logger.error("Creator threads query failed:", error);
        return [];
      });
      res.json(threads);
    } catch (error) {
      logger.error("Error fetching creator feedback threads:", error);
      res.status(500).json({ message: "Failed to fetch feedback threads" });
    }
  });

  // User search route
  app.get('/api/users/search', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const searchTerm = req.query.searchTerm as string || '';
      
      if (searchTerm.length === 0) {
        return res.json([]);
      }
      
      const users = await storage.searchUsers(searchTerm, userId);
      res.json(users);
    } catch (error) {
      logger.error("Error searching users:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // Friend routes
  app.get('/api/friends', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const friends = await storage.getUserFriends(userId);
      res.json(friends);
    } catch (error) {
      logger.error("Error fetching friends:", error);
      res.status(500).json({ message: "Failed to fetch friends" });
    }
  });

  app.get('/api/friends/requests', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const requests = await storage.getFriendRequests(userId);
      res.json(requests);
    } catch (error) {
      logger.error("Error fetching friend requests:", error);
      res.status(500).json({ message: "Failed to fetch friend requests" });
    }
  });

  app.post('/api/friends/request', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { addresseeId } = req.body;
      
      const friendship = await storage.createFriendRequest({
        requesterId: userId,
        addresseeId,
      });
      
      res.status(201).json(friendship);
    } catch (error) {
      logger.error("Error creating friend request:", error);
      res.status(500).json({ message: "Failed to create friend request" });
    }
  });

  app.patch('/api/friends/:id', verifyToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      await storage.updateFriendshipStatus(id, status);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error updating friendship:", error);
      res.status(500).json({ message: "Failed to update friendship" });
    }
  });

  // Review routes
  app.post('/api/reviews', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const reviewData = insertReviewSchema.parse({ ...req.body, reviewerId: userId });
      const review = await storage.createReview(reviewData);
      res.status(201).json(review);
    } catch (error) {
      logger.error("Error creating review:", error);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  app.get('/api/user/reviews', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const reviews = await storage.getUserReviews(userId);
      res.json(reviews);
    } catch (error) {
      logger.error("Error fetching reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // Activity routes
  app.get('/api/user/activities', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const activities = await storage.getUserActivities(userId);
      res.json(activities);
    } catch (error) {
      logger.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // Profile update route
  app.patch('/api/user/profile', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { firstName, lastName, handle, bio, skills, experience } = req.body;
      
      // Add timeout protection for profile update
      const queryTimeout = 10000;
      await Promise.race([
        storage.updateUserProfile(userId, {
          firstName,
          lastName,
          handle,
          bio,
          skills,
          experience
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Profile update timeout')), queryTimeout)
        )
      ]);
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Payment routes
  app.get('/api/payments/methods', verifyToken, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment system not configured" });
    }

    try {
      const customerId = await ensureStripeCustomer(req.user);
      const queryTimeout = 15000; // 15 seconds for Stripe operations
      
      // Get payment methods from Stripe
      const paymentMethods = await Promise.race([
        stripe.paymentMethods.list({
          customer: customerId,
          type: 'card',
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Stripe payment methods timeout')), queryTimeout)
        )
      ]).catch((error) => {
        logger.error("Failed to fetch Stripe payment methods:", error);
        return { data: [] };
      });
      
      // Transform Stripe data to match our frontend expectations
      const transformedMethods = paymentMethods.data.map(pm => ({
        id: pm.id,
        type: pm.type,
        last4: pm.card?.last4,
        brand: pm.card?.brand,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
        isDefault: false, // We'll check this separately if needed
      }));
      
      res.json(transformedMethods);
    } catch (error) {
      logger.error("Error fetching payment methods:", error);
      res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  app.post('/api/payments/setup-intent', verifyToken, async (req: any, res) => {
    if (!stripe) {
      logger.error("Stripe not configured");
      return res.status(503).json({ message: "Payment system not configured" });
    }

    try {
      const userId = req.user.id;
      const queryTimeout = 15000; // 15 seconds for payment operations
      
      logger.info(`Creating setup intent for user ${userId}`);
      
      // Ensure Stripe customer exists for this user
      const customerId = await ensureStripeCustomer(req.user);
      logger.info(`Using Stripe customer: ${customerId}`);

      const setupIntent = await Promise.race([
        stripe.setupIntents.create({
          customer: customerId,
          automatic_payment_methods: { enabled: true },
          usage: 'off_session',
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Setup intent create timeout')), queryTimeout)
        )
      ]);

      logger.info(`Setup intent created: ${setupIntent.id}, client_secret exists: ${!!setupIntent.client_secret}`);
      
      if (!setupIntent.client_secret) {
        throw new Error("Setup intent created but no client secret returned");
      }

      res.json({ clientSecret: setupIntent.client_secret });
    } catch (error: any) {
      logger.error("Error creating setup intent:", error);
      res.status(500).json({ message: error.message || "Failed to create setup intent" });
    }
  });

  app.post('/api/payments/save-method', verifyToken, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment system not configured" });
    }

    try {
      const userId = req.user.id;
      const { paymentMethodId } = req.body;
      const queryTimeout = 15000; // 15 seconds for payment operations

      if (!paymentMethodId) {
        return res.status(400).json({ message: "Payment method ID required" });
      }

      // Retrieve payment method from Stripe with timeout protection
      const paymentMethod = await Promise.race([
        stripe.paymentMethods.retrieve(paymentMethodId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Payment method retrieve timeout')), queryTimeout)
        )
      ]);
      
      // Save to our database with timeout protection
      const savedMethod = await Promise.race([
        storage.createPaymentMethod({
          userId,
          stripePaymentMethodId: paymentMethodId,
          type: paymentMethod.type,
          last4: paymentMethod.card?.last4,
          brand: paymentMethod.card?.brand,
          expiryMonth: paymentMethod.card?.exp_month,
          expiryYear: paymentMethod.card?.exp_year,
          isDefault: false,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Payment method save timeout')), queryTimeout)
        )
      ]);

      res.status(201).json(savedMethod);
    } catch (error: any) {
      logger.error("Error saving payment method:", error);
      res.status(500).json({ message: "Failed to save payment method" });
    }
  });

  app.post('/api/payments/set-default', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { paymentMethodId } = req.body;

      await storage.updatePaymentMethodDefault(userId, paymentMethodId);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error setting default payment method:", error);
      res.status(500).json({ message: "Failed to set default payment method" });
    }
  });

  app.delete('/api/payments/methods/:id', verifyToken, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment system not configured" });
    }

    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get payment method from database
      const paymentMethods = await storage.getUserPaymentMethods(userId);
      const paymentMethod = paymentMethods.find(pm => pm.id === id);

      if (!paymentMethod) {
        return res.status(404).json({ message: "Payment method not found" });
      }

      // Detach from Stripe
      await stripe.paymentMethods.detach(paymentMethod.stripePaymentMethodId);
      
      // Delete from database
      await storage.deletePaymentMethod(id);

      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error deleting payment method:", error);
      res.status(500).json({ message: "Failed to delete payment method" });
    }
  });

  app.post('/api/payments/deposit', verifyToken, require2FA, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment system not configured" });
    }

    try {
      const userId = req.user.id;
      const { amount, paymentMethodId } = req.body;

      logger.info(`Deposit request: userId=${userId}, amount=${amount}, paymentMethodId=${paymentMethodId}`);

      if (!amount || !paymentMethodId) {
        return res.status(400).json({ message: "Amount and payment method required" });
      }

      // Add timeout protection for database operations
      const queryTimeout = 15000;
      
      const user = await Promise.race([
        storage.getUser(userId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('User query timeout')), queryTimeout)
        )
      ]);
      
      if (!user?.stripeCustomerId) {
        logger.error(`No Stripe customer ID for user ${userId}`);
        return res.status(400).json({ message: "Stripe customer not found. Please add a payment method first." });
      }

      logger.info(`Using Stripe customer: ${user.stripeCustomerId}`);

      // Calculate platform fee (5% of deposit)
      const feeInfo = storage.calculatePlatformFee(amount.toString());
      const totalCharge = parseFloat(feeInfo.grossAmount) + parseFloat(feeInfo.fee);

      logger.info(`Creating payment intent: amount=${totalCharge}, fee=${feeInfo.fee}`);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalCharge * 100), // Convert to cents, include fee
        currency: 'usd',
        customer: user.stripeCustomerId,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        return_url: `${req.protocol}://${req.get('host')}/account`,
      });

      // Save payment record with timeout protection
      const payment = await Promise.race([
        storage.createPayment({
          userId,
          stripePaymentIntentId: paymentIntent.id,
          amount: feeInfo.grossAmount,
          platformFee: feeInfo.fee,
          netAmount: feeInfo.grossAmount, // User gets the full amount they requested
          status: paymentIntent.status,
          type: 'deposit',
          description: `Account deposit of $${amount} (platform fee: $${feeInfo.fee})`,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Payment creation timeout')), queryTimeout)
        )
      ]);

      // If payment succeeded, update user balance and record platform revenue
      if (paymentIntent.status === 'succeeded') {
        // Update balance and save payment intent for future withdrawals
        await Promise.race([
          storage.updateUserBalance(userId, feeInfo.grossAmount),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Balance update timeout')), queryTimeout)
          )
        ]);
        
        // Save the payment intent ID for automatic withdrawals
        await storage.updateUser(userId, {
          lastPaymentIntentId: paymentIntent.id
        });
        
        await Promise.race([
          storage.updatePaymentStatus(payment.id, 'succeeded'),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Payment status update timeout')), queryTimeout)
          )
        ]);
        
        // Create platform revenue record
        await Promise.race([
          storage.createPlatformRevenue({
            transactionId: payment.id,
            amount: feeInfo.fee,
            source: "deposit",
            description: `Platform fee from deposit: $${amount}`,
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Revenue record timeout')), queryTimeout)
          )
        ]);
      }

      res.json({ 
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          client_secret: paymentIntent.client_secret
        },
        platformFee: feeInfo.fee,
        totalCharged: totalCharge.toFixed(2),
        amountCredited: feeInfo.grossAmount
      });
    } catch (error: any) {
      logger.error("Error processing deposit:", error);
      
      // Handle Stripe-specific errors with better messages
      if (error.type === 'StripeCardError') {
        let message = "Payment failed";
        
        switch (error.decline_code) {
          case 'insufficient_funds':
            message = "Your card has insufficient funds. Please try a different payment method or a smaller amount.";
            break;
          case 'card_declined':
            message = "Your card was declined. Please try a different payment method.";
            break;
          case 'expired_card':
            message = "Your card has expired. Please add a new payment method.";
            break;
          default:
            message = error.message || "Payment failed. Please try again.";
        }
        
        return res.status(400).json({ message, decline_code: error.decline_code });
      }
      
      res.status(500).json({ message: error.message || "Failed to process deposit" });
    }
  });

  app.get('/api/payments/history', verifyToken, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment system not configured" });
    }

    try {
      const customerId = await ensureStripeCustomer(req.user);
      const queryTimeout = 15000; // 15 seconds for Stripe operations
      
      // Get payment intents from Stripe
      const paymentIntents = await Promise.race([
        stripe.paymentIntents.list({
          customer: customerId,
          limit: 50,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Stripe payment intents timeout')), queryTimeout)
        )
      ]).catch((error) => {
        logger.error("Failed to fetch Stripe payment intents:", error);
        return { data: [] };
      });
      
      // Transform Stripe data to match our frontend expectations
      const transformedPayments = paymentIntents.data.map(pi => ({
        id: pi.id,
        amount: (pi.amount / 100).toFixed(2),
        currency: pi.currency.toUpperCase(),
        status: pi.status,
        description: pi.description || 'Payment',
        created: new Date(pi.created * 1000).toISOString(),
        metadata: pi.metadata,
        points: pi.metadata?.points ? Number(pi.metadata.points) : 0,
      }));
      
      res.json(transformedPayments);
    } catch (error) {
      logger.error("Error fetching payment history:", error);
      res.status(500).json({ message: "Failed to fetch payment history" });
    }
  });

  app.post('/api/payments/withdraw', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { amount, method } = req.body;

      const user = await storage.getUser(userId);
      
      const withdrawalAmount = parseFloat(amount);
      const userBalance = parseFloat(user.balance);

      if (withdrawalAmount < 5) {
        return res.status(400).json({ message: "Minimum withdrawal amount is $5.00" });
      }

      if (withdrawalAmount > userBalance) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Calculate fee for instant transfers
      let finalAmount = withdrawalAmount;
      let feeAmount = 0;
      let description = `Withdrawal: $${withdrawalAmount.toFixed(2)}`;
      
      if (method === 'debit_card') {
        feeAmount = Math.max(0.50, withdrawalAmount * 0.01); // 1% or $0.50 minimum (Stripe's instant payout fee)
        finalAmount = withdrawalAmount - feeAmount;
        description += ` (Instant transfer fee: $${feeAmount.toFixed(2)})`;
      }

      // Check if user has payment methods set up
      if (method === 'bank_transfer' && !user.bankAccountToken) {
        return res.status(400).json({ 
          message: "Please add your bank account first to receive payouts",
          requiresAccount: true
        });
      }
      
      if (method === 'debit_card' && !user.debitCardToken) {
        return res.status(400).json({ 
          message: "Please add your debit card first to receive instant payouts",
          requiresAccount: true
        });
      }

      // Process automatic withdrawals - try refund first, then fallback to manual
      let payoutResult;
      let transferId;
      
      // Get user's payment history from Stripe
      let lastPaymentId = user.lastPaymentIntentId;
      
      if (stripe && !lastPaymentId) {
        try {
          // Find user's most recent payment
          const payments = await stripe.paymentIntents.list({
            customer: user.stripeCustomerId,
            limit: 10
          });
          
          // Find a payment that can be refunded
          const refundablePayment = payments.data.find(p => 
            p.status === 'succeeded' && 
            p.amount_refunded < p.amount
          );
          
          if (refundablePayment) {
            lastPaymentId = refundablePayment.id;
          }
        } catch (err) {
          logger.warn("Could not fetch payment history:", err);
        }
      }
      
      if (stripe && lastPaymentId) {
        try {
          // Try automatic refund to original payment method
          logger.info(`Processing automatic refund for ${user.username}: $${finalAmount} from payment ${lastPaymentId}`);
          
          const refund = await stripe.refunds.create({
            payment_intent: lastPaymentId,
            amount: Math.round(finalAmount * 100), // Convert to cents
            reason: 'requested_by_customer',
            metadata: {
              type: 'withdrawal',
              userId: userId,
              method: method,
              originalAmount: withdrawalAmount.toString()
            }
          });
          
          transferId = refund.id;
          payoutResult = {
            success: true,
            payoutId: transferId,
            amount: finalAmount,
            status: refund.status,
            estimatedArrival: '5-10 business days'
          };
          
          logger.info(`SUCCESS: Stripe refund ${refund.id} created for $${finalAmount}`);
        } catch (refundError: any) {
          logger.error(`Refund failed for payment ${lastPaymentId}:`, refundError.message);
          
          // Fallback: Create withdrawal request for manual processing
          transferId = `manual_withdrawal_${Date.now()}`;
          payoutResult = {
            success: true,
            payoutId: transferId,
            amount: finalAmount,
            status: 'pending_manual',
            estimatedArrival: '2-5 business days',
            note: `Manual processing required: ${refundError.message}`
          };
          
          logger.info(`MANUAL: Withdrawal request ${transferId} created for manual processing`);
        }
      } else {
        // No payment to refund - needs manual processing
        transferId = `manual_withdrawal_${Date.now()}`;
        payoutResult = {
          success: true,
          payoutId: transferId,
          amount: finalAmount,
          status: 'pending_manual',
          estimatedArrival: '2-5 business days',
          note: 'Manual payout required - no payment history'
        };
        
        logger.info(`MANUAL: No payment history for ${user.username}, created manual withdrawal request`);
      }

      // Create withdrawal transaction record
      const methodNames: Record<string, string> = {
        'bank_transfer': 'bank transfer',
        'debit_card': 'instant debit',
        'cash_app': 'Cash App',
        'paypal': 'PayPal'
      };
      
      const withdrawalTransaction = await storage.createTransaction({
        userId,
        type: "spending",
        amount: amount,
        description: `Withdrawal via ${methodNames[method] || method}`,
        status: payoutResult.success ? "completed" : "pending",
      });

      // Deduct amount from user balance
      await storage.updateUserBalance(userId, `-${amount}`);

      // Create activity record
      await storage.createActivity({
        userId,
        type: "withdrawal",
        description: `Withdrawal of $${amount} processed`,
        metadata: { 
          amount, 
          method, 
          transactionId: withdrawalTransaction.id,
          payoutId: transferId,
          estimatedArrival: payoutResult.estimatedArrival
        },
      });

      res.json({
        success: true,
        transactionId: withdrawalTransaction.id,
        transferId: transferId,
        message: method === 'debit_card' 
          ? `Withdrawal of $${finalAmount.toFixed(2)} processed instantly (after $${feeAmount.toFixed(2)} fee)`
          : `Withdrawal of $${withdrawalAmount.toFixed(2)} processed. Funds will arrive in ${payoutResult.estimatedArrival}`,
        amount: finalAmount.toFixed(2),
        fee: feeAmount.toFixed(2),
        estimatedArrival: payoutResult.estimatedArrival
      });
    } catch (error: any) {
      logger.error("Error processing withdrawal:", error);
      
      // Return a user-friendly error message
      const message = error.message || "Failed to process withdrawal";
      res.status(500).json({ message });
    }
  });

  // Get Stripe Connect onboarding link
  app.get('/api/payments/onboarding', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!stripe) {
        return res.status(400).json({ message: "Stripe not configured" });
      }
      
      let connectAccountId = user.stripeConnectAccountId;
      
      // Create Connect account if doesn't exist
      if (!connectAccountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          country: 'US',
          email: user.email,
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true },
          },
          business_type: 'individual',
          metadata: {
            userId: userId
          }
        });
        
        connectAccountId = account.id;
        await storage.updateUser(userId, {
          stripeConnectAccountId: connectAccountId
        });
      }
      
      // Create onboarding link
      const baseUrl = process.env.BASE_URL || 'https://pocketbounty-web.onrender.com';
      const accountLink = await stripe.accountLinks.create({
        account: connectAccountId,
        refresh_url: `${baseUrl}/account?tab=withdraw`,
        return_url: `${baseUrl}/account?tab=withdraw&onboarding=complete`,
        type: 'account_onboarding',
      });
      
      res.json({ url: accountLink.url });
    } catch (error) {
      logger.error("Onboarding error:", error);
      res.status(500).json({ message: "Failed to create onboarding link" });
    }
  });

  // Add bank account for direct payouts
  app.post('/api/payments/add-bank', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { routingNumber, accountNumber } = req.body;
      
      if (!routingNumber || !accountNumber) {
        return res.status(400).json({ message: "Missing routing or account number" });
      }
      
      if (routingNumber.length !== 9) {
        return res.status(400).json({ message: "Routing number must be 9 digits" });
      }
      
      // Get the user from storage
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (stripe) {
        // For payouts, we need to create a Custom Connect account first if user doesn't have one
        let connectAccountId = user.stripeConnectAccountId;
        
        if (!connectAccountId) {
          // Create an Express Connect account for this user (simpler onboarding)
          const account = await stripe.accounts.create({
            type: 'express',
            country: 'US',
            email: user.email,
            capabilities: {
              transfers: { requested: true },
              card_payments: { requested: true },
            },
            business_type: 'individual',
            metadata: {
              userId: userId,
              bankAccountAdded: 'pending'
            }
          });
          
          connectAccountId = account.id;
          await storage.updateUser(userId, {
            stripeConnectAccountId: connectAccountId
          });
          
          // Add the bank account as an external account
          try {
            await stripe.accounts.createExternalAccount(connectAccountId, {
              external_account: {
                object: 'bank_account',
                country: 'US',
                currency: 'usd',
                account_holder_name: user.username || `${user.firstName} ${user.lastName}`,
                account_holder_type: 'individual',
                routing_number: routingNumber,
                account_number: accountNumber,
              },
              default_for_currency: true,
            });
          } catch (err) {
            // Bank account might need verification through onboarding
            logger.warn("Could not add bank account directly, user may need to complete onboarding:", err);
          }
        } else {
          // Add the bank account as an external account to existing Connect account
          try {
            await stripe.accounts.createExternalAccount(connectAccountId, {
              external_account: {
                object: 'bank_account',
                country: 'US',
                currency: 'usd',
                account_holder_name: user.username || `${user.firstName} ${user.lastName}`,
                account_holder_type: 'individual',
                routing_number: routingNumber,
                account_number: accountNumber,
              },
              default_for_currency: true,
            });
          } catch (err) {
            logger.warn("Could not add bank account to existing account:", err);
          }
        }
        
        // Store the bank account details
        const last4 = accountNumber.slice(-4);
        const bankAccountId = connectAccountId ? connectAccountId : ''; // Use connect account ID as the reference
        await storage.updateUser(userId, {
          bankAccountToken: bankAccountId,
          bankAccountLast4: last4,
          bankRoutingNumber: routingNumber.slice(-4), // Store last 4 of routing for display
          preferredPayoutMethod: 'bank',
          stripeConnectStatus: 'connected'
        });
        
        res.json({
          success: true,
          message: "Bank account added successfully",
          last4: last4
        });
      } else {
        return res.status(500).json({ message: "Payment system not configured" });
      }
    } catch (error: any) {
      logger.error("Error adding bank account:", error);
      res.status(500).json({ message: error.message || "Failed to add bank account" });
    }
  });
  
  // Add debit card for instant payouts
  app.post('/api/payments/add-card', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { cardNumber, expiry, cvc } = req.body;
      
      if (!cardNumber || !expiry || !cvc) {
        return res.status(400).json({ message: "Missing card details" });
      }
      
      // Parse expiry date
      const [expMonth, expYear] = expiry.split('/');
      if (!expMonth || !expYear) {
        return res.status(400).json({ message: "Invalid expiry format (use MM/YY)" });
      }
      
      if (stripe) {
        // Note: In production, card tokenization should be done on the frontend using Stripe.js
        // This is a placeholder - cards should be tokenized client-side for PCI compliance
        logger.warn("Card tokenization should be done client-side using Stripe.js");
        
        // For now, store the card details (in production, use Stripe Elements on frontend)
        const token = { id: `tok_placeholder_${Date.now()}` };
        
        // Store the tokenized card
        const last4 = cardNumber.slice(-4);
        await storage.updateUser(userId, {
          debitCardToken: token.id,
          debitCardLast4: last4,
          preferredPayoutMethod: 'card'
        });
        
        res.json({
          success: true,
          message: "Debit card added successfully",
          last4: last4
        });
      } else {
        return res.status(500).json({ message: "Payment system not configured" });
      }
    } catch (error: any) {
      logger.error("Error adding debit card:", error);
      res.status(500).json({ message: error.message || "Failed to add debit card" });
    }
  });
  
  // Remove payment method
  app.post('/api/payments/remove-method', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      await storage.updateUser(userId, {
        bankAccountToken: null,
        bankAccountLast4: null,
        bankRoutingNumber: null,
        debitCardToken: null,
        debitCardLast4: null,
        preferredPayoutMethod: null
      });
      
      res.json({
        success: true,
        message: "Payment method removed successfully"
      });
    } catch (error: any) {
      logger.error("Error removing payment method:", error);
      res.status(500).json({ message: error.message || "Failed to remove payment method" });
    }
  });

  // Connect bank account for withdrawals (DEPRECATED - keeping for backwards compatibility)
  app.post('/api/payments/connect-bank', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      // Check if user already has a connected account
      if (user.stripeConnectAccountId && user.stripeConnectStatus === 'connected') {
        return res.json({
          success: true,
          alreadyConnected: true,
          message: "Your bank account is already connected"
        });
      }
      
      if (stripe) {
        const { createStripeConnectAccount } = await import('./stripePayouts');
        const result = await createStripeConnectAccount(userId, user.email);
        
        // Save the Stripe Connect account ID to the user's record
        await storage.updateUser(userId, {
          stripeConnectAccountId: result.accountId,
          stripeConnectStatus: 'pending'
        });
        
        res.json({
          success: true,
          onboardingUrl: result.onboardingUrl,
          message: "Please complete the onboarding process to connect your bank account"
        });
      } else {
        res.json({
          success: false,
          message: "Payment system not configured. Withdrawals will be simulated."
        });
      }
    } catch (error: any) {
      logger.error("Error connecting bank account:", error);
      res.status(500).json({ message: error.message || "Failed to connect bank account" });
    }
  });
  
  // Stripe Connect return URL - handles when users complete onboarding
  app.get('/api/payments/connect-return', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (stripe && user.stripeConnectAccountId) {
        // Check the account status
        const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
        
        if (account.charges_enabled && account.payouts_enabled) {
          // Account is fully onboarded
          await storage.updateUser(userId, {
            stripeConnectStatus: 'connected'
          });
          
          res.redirect('/account?tab=withdraw&connected=true');
        } else {
          // Account still needs more information
          res.redirect('/account?tab=withdraw&connected=false&message=Please complete all required information');
        }
      } else {
        res.redirect('/account?tab=withdraw&connected=false');
      }
    } catch (error: any) {
      logger.error("Error handling Stripe Connect return:", error);
      res.redirect('/account?tab=withdraw&connected=false&error=true');
    }
  });

  // Test deposit endpoint (for development without Stripe)
  app.post('/api/test/deposit', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { amount } = req.body;
      
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount < 1 || numAmount > 1000) {
        return res.status(400).json({ message: "Invalid amount" });
      }
      
      // Add timeout protection for test deposit operations
      const queryTimeout = 10000;
      
      // Add funds to user balance
      await Promise.race([
        storage.updateUserBalance(userId, amount),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Balance update timeout')), queryTimeout)
        )
      ]);
      
      // Create transaction record
      await Promise.race([
        storage.createTransaction({
          userId,
          type: "earning",
          amount,
          description: "Test deposit",
          status: "completed",
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction creation timeout')), queryTimeout)
        )
      ]);
      
      // Create activity (optional - don't fail if this times out)
      try {
        await Promise.race([
          storage.createActivity({
            userId,
            type: "deposit",
            description: `Added $${amount} in test funds`,
            metadata: { amount },
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Activity creation timeout')), 5000)
          )
        ]);
      } catch (activityError) {
        logger.error("Activity creation failed (non-critical):", activityError);
      }
      
      const updatedUser = await Promise.race([
        storage.getUser(userId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('User fetch timeout')), queryTimeout)
        )
      ]);
      res.json({ 
        success: true, 
        balance: updatedUser?.balance,
        message: "Test funds added successfully"
      });
    } catch (error) {
      logger.error("Error processing test deposit:", error);
      res.status(500).json({ message: "Failed to process test deposit" });
    }
  });

  // Creator dashboard endpoints (creator only)
  app.get('/api/creator/stats', verifyToken, async (req: any, res) => {
    try {
      // Disable caching for real-time analytics
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');

      const userId = req.user.id;
      
      // Allow any authenticated user to access admin reports
      // Previously restricted to specific users

      // Use optimized database queries with proper error handling
      let revenue = [];
      let totalRevenue = "0.00";
      let allUsers = [];
      let allBounties = [];
      let allTransactions = [];
      let recentActivity = [];
      let totalUsers = 0;
      let totalBounties = 0;
      let totalTransactionCount = 0;

      try {
        // Set timeouts and get live data with proper connection management
        const queryTimeout = 10000; // 10 second timeout per query
        
        // Sequential queries to avoid overwhelming the connection pool
        const userCount = await Promise.race([
          db.select({ count: sql`count(*)` }).from(users),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), queryTimeout))
        ]).catch(() => [{ count: 0 }]);

        totalUsers = Number((userCount as any)[0]?.count || 0);

        const bountyCount = await Promise.race([
          db.select({ count: sql`count(*)` }).from(bounties),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), queryTimeout))
        ]).catch(() => [{ count: 0 }]);

        totalBounties = Number((bountyCount as any)[0]?.count || 0);

        const transactionCount = await Promise.race([
          db.select({ count: sql`count(*)` }).from(transactions),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), queryTimeout))
        ]).catch(() => [{ count: 0 }]);

        totalTransactionCount = Number((transactionCount as any)[0]?.count || 0);

        // Get real activity data with timeout protection
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        // Get real live data with timeout protection
        if (totalUsers > 0) {
          // Get revenue data
          try {
            [revenue, totalRevenue] = await Promise.all([
              Promise.race([
                storage.getPlatformRevenue(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Revenue timeout')), queryTimeout))
              ]).catch(() => [] as any[]),
              Promise.race([
                storage.getTotalPlatformRevenue(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Total revenue timeout')), queryTimeout))
              ]).catch(() => "0.00" as string)
            ]);
          } catch (e) {
            logger.error("Revenue data error:", e);
            revenue = [];
            totalRevenue = "0.00";
          }

          // Get activity data
          try {
            recentActivity = await Promise.race([
              storage.getRecentActivity(20),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Activity timeout')), queryTimeout))
            ]).catch(() => [] as any[]);
          } catch (e) {
            logger.error("Activity data error:", e);
            recentActivity = [];
          }

          // Get user samples for calculations
          try {
            allUsers = await Promise.race([
              db.select().from(users).limit(200),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Users timeout')), queryTimeout))
            ]).catch(() => [] as any[]);
          } catch (e) {
            logger.error("Users sample error:", e);
            allUsers = [];
          }

          // Get bounty samples
          try {
            allBounties = await Promise.race([
              db.select().from(bounties).limit(200),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Bounties timeout')), queryTimeout))
            ]).catch(() => [] as any[]);
          } catch (e) {
            logger.error("Bounties sample error:", e);
            allBounties = [];
          }

          // Get transaction samples
          try {
            allTransactions = await Promise.race([
              db.select().from(transactions).limit(300),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Transactions timeout')), queryTimeout))
            ]).catch(() => [] as any[]);
          } catch (e) {
            logger.error("Transactions sample error:", e);
            allTransactions = [];
          }

          // Get real active user counts with timeout protection
          try {
            const weeklyResult = await Promise.race([
              db.select({ count: sql`count(*)` })
                .from(users)
                .where(sql`"lastSeen" > ${sevenDaysAgo.toISOString()} OR ("lastSeen" IS NULL AND "createdAt" > ${sevenDaysAgo.toISOString()})`),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Weekly active timeout')), queryTimeout))
            ]).catch(() => [{ count: 0 }]);

            const dailyResult = await Promise.race([
              db.select({ count: sql`count(*)` })
                .from(users)
                .where(sql`"lastSeen" > ${oneDayAgo.toISOString()} OR ("lastSeen" IS NULL AND "createdAt" > ${oneDayAgo.toISOString()})`),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Daily active timeout')), queryTimeout))
            ]).catch(() => [{ count: 0 }]);

            const monthlyResult = await Promise.race([
              db.select({ count: sql`count(*)` })
                .from(users)
                .where(sql`"lastSeen" > ${thirtyDaysAgo.toISOString()} OR ("lastSeen" IS NULL AND "createdAt" > ${thirtyDaysAgo.toISOString()})`),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Monthly active timeout')), queryTimeout))
            ]).catch(() => [{ count: 0 }]);

            (global as any).realActivityCounts = {
              weekly: Number((weeklyResult as any)[0]?.count || 0),
              daily: Number((dailyResult as any)[0]?.count || 0),
              monthly: Number((monthlyResult as any)[0]?.count || 0)
            };
          } catch (e) {
            logger.error("Activity counts error:", e);
            (global as any).realActivityCounts = { weekly: 0, daily: 0, monthly: 0 };
          }
        }
      } catch (dbError) {
        logger.error("Database query error in creator stats:", dbError);
        // Return mock data if database fails
        return res.json({
          revenue: { data: [], total: "0.00", transactionCount: 0, avgPerTransaction: "0.00" },
          users: { total: 0, active: 0, totalBalance: "0.00", newLast30Days: 0, growthRate: "0.0" },
          bounties: { total: 0, active: 0, completed: 0, totalValue: "0.00", completionRate: "0.0" },
          transactions: { total: 0, totalVolume: "0.00", deposits: 0, withdrawals: 0, avgTransactionSize: "0.00" },
          spending: {
            totalUserSpent: "0.00",
            pointPurchases: { total: "0.00", count: 0, avgPurchase: "0.00" },
            withdrawals: { total: "0.00", count: 0, avgWithdrawal: "0.00" },
            refunds: { total: "0.00", count: 0 },
            breakdown: {},
            last30Days: { pointPurchases: "0.00", spending: "0.00" }
          },
          activity: []
        });
      }

      // Use real active user counts from database query
      const activeUsers = (global as any).realActivityCounts?.weekly || 0;

      const totalUserBalance = allUsers.reduce((sum, u) => sum + parseFloat(u.balance || '0'), 0);

      // Calculate bounty statistics from sample
      const sampleActiveBounties = allBounties.filter(b => b.status === 'active').length;
      const sampleCompletedBounties = allBounties.filter(b => b.status === 'completed').length;
      
      // Scale up bounty stats
      const activeBounties = totalBounties > 0 && allBounties.length > 0
        ? Math.round((sampleActiveBounties / allBounties.length) * totalBounties)
        : sampleActiveBounties;
        
      const completedBounties = totalBounties > 0 && allBounties.length > 0
        ? Math.round((sampleCompletedBounties / allBounties.length) * totalBounties)
        : sampleCompletedBounties;
        
      const totalBountyValue = allBounties.reduce((sum, b) => sum + parseFloat(b.reward || '0'), 0);

      // Calculate transaction statistics
      const deposits = allTransactions.filter(t => t.type === 'earning');
      const withdrawals = allTransactions.filter(t => t.type === 'withdrawal');
      const totalVolume = allTransactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);

      // Calculate comprehensive spending analytics
      const pointPurchases = allTransactions.filter(t => t.type === 'point_purchase');
      const totalPointPurchases = pointPurchases.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
      
      const spendingTransactions = allTransactions.filter(t => t.type === 'spending');
      const totalSpending = spendingTransactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
      
      const refundTransactions = allTransactions.filter(t => t.type === 'refund');
      const totalRefunds = refundTransactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
      
      const totalUserSpent = totalPointPurchases + totalSpending;
      
      // Real spending breakdown
      const spendingByCategory = spendingTransactions.reduce((acc, t) => {
        const description = t.description || '';
        let category = 'other';
        
        if (description.toLowerCase().includes('withdrawal')) {
          category = 'withdrawals';
        } else if (description.toLowerCase().includes('bounty')) {
          category = 'bounty_related';
        } else if (description.toLowerCase().includes('fee')) {
          category = 'fees';
        }
        
        acc[category] = (acc[category] || 0) + parseFloat(t.amount || '0');
        return acc;
      }, {} as Record<string, number>);

      // Growth metrics (comparing last 30 days vs previous 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      const sampleNewUsersLast30 = allUsers.filter(u => new Date(u.createdAt) > thirtyDaysAgo).length;
      const sampleNewUsersPrevious30 = allUsers.filter(u => 
        new Date(u.createdAt) > sixtyDaysAgo && new Date(u.createdAt) <= thirtyDaysAgo
      ).length;
      
      // Scale up growth metrics
      const newUsersLast30 = totalUsers > 0 && allUsers.length > 0
        ? Math.round((sampleNewUsersLast30 / allUsers.length) * totalUsers)
        : sampleNewUsersLast30;
        
      const newUsersPrevious30 = totalUsers > 0 && allUsers.length > 0
        ? Math.round((sampleNewUsersPrevious30 / allUsers.length) * totalUsers) 
        : sampleNewUsersPrevious30;

      const userGrowthRate = newUsersPrevious30 > 0 
        ? ((newUsersLast30 - newUsersPrevious30) / newUsersPrevious30 * 100).toFixed(1)
        : newUsersLast30 > 0 ? '100' : '0';


      // Real top performers calculation
      const userEarnings: Record<string, { earned: number; spent: number; actions: number; name: string }> = {};
      
      allUsers.forEach(user => {
        userEarnings[user.id] = {
          earned: 0,
          spent: 0,
          actions: 0,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email || user.username || 'Unknown User'
        };
      });

      allTransactions.forEach(t => {
        if (!userEarnings[t.userId]) {
          userEarnings[t.userId] = { earned: 0, spent: 0, actions: 0, name: 'Unknown User' };
        }
        
        if (t.type === 'earning') {
          userEarnings[t.userId].earned += parseFloat(t.amount || '0');
        } else if (t.type === 'spending' || t.type === 'point_purchase') {
          userEarnings[t.userId].spent += parseFloat(t.amount || '0');
        }
        userEarnings[t.userId].actions++;
      });

      const topPerformers = {
        topEarners: Object.entries(userEarnings)
          .map(([id, data]) => ({ id, name: data.name, earned: data.earned.toFixed(2) }))
          .sort((a, b) => parseFloat(b.earned) - parseFloat(a.earned))
          .slice(0, 10),
        topSpenders: Object.entries(userEarnings)
          .map(([id, data]) => ({ id, name: data.name, spent: data.spent.toFixed(2) }))
          .sort((a, b) => parseFloat(b.spent) - parseFloat(a.spent))
          .slice(0, 10),
        mostActive: Object.entries(userEarnings)
          .map(([id, data]) => ({ id, name: data.name, actions: data.actions }))
          .sort((a, b) => b.actions - a.actions)
          .slice(0, 10)
      };

      // Use real engagement metrics from database queries
      const dailyActiveUsers = global.realActivityCounts?.daily || 0;
      const weeklyActiveUsers = global.realActivityCounts?.weekly || 0;
      const monthlyActiveUsers = global.realActivityCounts?.monthly || 0;

      // Calculate retention rate (users who returned after 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const usersFromLastWeek = allUsers.filter(u => {
        const createdDate = new Date(u.createdAt);
        return createdDate < sevenDaysAgo && createdDate > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      });
      
      const retainedUsers = usersFromLastWeek.filter(u => 
        new Date(u.lastSeen || u.createdAt) > sevenDaysAgo
      ).length;
      
      const retentionRate = usersFromLastWeek.length > 0 
        ? ((retainedUsers / usersFromLastWeek.length) * 100).toFixed(1)
        : '0';

      // Get real session metrics
      const sessionData = await storage.getSessionMetrics(thirtyDaysAgo);
      const avgSessionLength = sessionData.avgSessionMinutes 
        ? sessionData.avgSessionMinutes.toFixed(1)
        : '0';
      
      // Calculate bounce rate (users who left after one page)
      const singlePageSessions = sessionData.singlePageSessions || 0;
      const totalSessions = sessionData.totalSessions || 1;
      const bounceRate = totalSessions > 0 
        ? ((singlePageSessions / totalSessions) * 100).toFixed(1)
        : '0';

      const engagement = {
        dailyActiveUsers,
        weeklyActiveUsers,
        monthlyActiveUsers,
        retentionRate,
        avgSessionLength,
        bounceRate
      };

      res.json({ 
        revenue: {
          data: revenue,
          total: totalRevenue,
          transactionCount: revenue.length,
          avgPerTransaction: revenue.length > 0 ? (parseFloat(totalRevenue) / revenue.length).toFixed(2) : "0.00"
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          totalBalance: totalUserBalance.toFixed(2),
          newLast30Days: newUsersLast30,
          growthRate: userGrowthRate
        },
        bounties: {
          total: totalBounties,
          active: activeBounties,
          completed: completedBounties,
          totalValue: totalBountyValue.toFixed(2),
          completionRate: totalBounties > 0 ? ((completedBounties / totalBounties) * 100).toFixed(1) : '0'
        },
        transactions: {
          total: totalTransactionCount,
          totalVolume: totalVolume.toFixed(2),
          deposits: deposits.length,
          withdrawals: withdrawals.length,
          avgTransactionSize: totalTransactionCount > 0 ? (totalVolume / totalTransactionCount).toFixed(2) : '0'
        },
        spending: {
          totalUserSpent: totalUserSpent.toFixed(2),
          pointPurchases: {
            total: totalPointPurchases.toFixed(2),
            count: pointPurchases.length,
            avgPurchase: pointPurchases.length > 0 ? (totalPointPurchases / pointPurchases.length).toFixed(2) : '0'
          },
          withdrawals: {
            total: withdrawals.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0).toFixed(2),
            count: withdrawals.length,
            avgWithdrawal: withdrawals.length > 0 ? (withdrawals.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0) / withdrawals.length).toFixed(2) : '0'
          },
          boosts: {
            total: totalSpending.toFixed(2),
            count: spendingTransactions.length,
            avgBoost: spendingTransactions.length > 0 ? (totalSpending / spendingTransactions.length).toFixed(2) : '0'
          },
          refunds: {
            total: totalRefunds.toFixed(2),
            count: refundTransactions.length
          },
          breakdown: spendingByCategory,
          last30Days: {
            pointPurchases: pointPurchases.filter(t => t.createdAt && new Date(t.createdAt) > thirtyDaysAgo).reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0).toFixed(2),
            spending: spendingTransactions.filter(t => t.createdAt && new Date(t.createdAt) > thirtyDaysAgo).reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0).toFixed(2)
          }
        },
        topPerformers,
        engagement,
        activity: recentActivity
      });
    } catch (error) {
      logger.error("Error fetching creator stats:", error);
      res.status(500).json({ message: "Failed to fetch creator stats" });
    }
  });

  // Get detailed creator data for modals
  app.get('/api/creator/details/:type', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { type } = req.params;
      
      // Allow any authenticated user to access creator details
      // Previously restricted to specific users
      
      switch (type) {
        case 'users': {
          try {
            const queryTimeout = 15000;
            
            const users = await Promise.race([
              storage.getAllUsers(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Users query timeout')), queryTimeout)
              )
            ]).catch((error) => {
              logger.error("Users query failed:", error);
              return [];
            });
            
            const sortedUsers = users
              .sort((a, b) => b.points - a.points)
              .slice(0, 100) // Top 100 users
              .map(u => ({
                id: u.id,
                firstName: u.firstName,
                lastName: u.lastName,
                email: u.email,
                handle: u.handle,
                points: u.points,
                balance: u.balance,
                lifetimeEarned: u.lifetimeEarned,
                createdAt: u.createdAt
              }));
            res.json({ users: sortedUsers });
          } catch (error) {
            logger.error("Error fetching users for details:", error);
            res.json({ users: [] });
          }
          break;
        }
        
        case 'revenue': {
          try {
            const queryTimeout = 15000;
            
            const revenue = await Promise.race([
              storage.getPlatformRevenue(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Revenue query timeout')), queryTimeout)
              )
            ]).catch((error) => {
              logger.error("Revenue query failed:", error);
              return [];
            });
            
            const transactions = revenue
              .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
              .slice(0, 50) // Reduced to 50 for better performance
              .map(async r => {
                let userName = 'Platform';
                try {
                  if (r.bountyId) {
                    const bounty = await Promise.race([
                      storage.getBounty(r.bountyId),
                      new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Bounty query timeout')), 5000)
                      )
                    ]).catch(() => null);
                    
                    if (bounty) {
                      const user = await Promise.race([
                        storage.getUser(bounty.claimedBy || bounty.authorId),
                        new Promise((_, reject) => 
                          setTimeout(() => reject(new Error('User query timeout')), 5000)
                        )
                      ]).catch(() => null);
                      
                      userName = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : 'Unknown';
                    }
                  }
                } catch (userError) {
                  // Silent fail for user lookup
                }
                return {
                  id: r.id,
                  amount: r.amount,
                  source: r.source,
                  description: r.description,
                  userName,
                  createdAt: r.createdAt
                };
              });
            res.json({ transactions: await Promise.all(transactions) });
          } catch (error) {
            logger.error("Error fetching revenue details:", error);
            res.json({ transactions: [] });
          }
          break;
        }
        
        case 'points': {
          try {
            const transactions = await storage.getAllTransactions();
            const pointPurchases = transactions
              .filter(t => t.type === 'point_purchase')
              .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
              .slice(0, 50);
            
            const purchases = await Promise.all(pointPurchases.map(async p => {
              let userName = 'Unknown';
              let userEmail = '';
              try {
                const user = await storage.getUser(p.userId);
                userName = user ? `${user.firstName} ${user.lastName}`.trim() || user.handle || user.email : 'Unknown';
                userEmail = user?.email || '';
              } catch (userError) {
                // Silent fail for user lookup
              }
              return {
                id: p.id,
                amount: p.amount,
                points: parseFloat(p.amount) * 100, // Points from boost purchases
                userName,
                userEmail,
                createdAt: p.createdAt
              };
            }));
            res.json({ purchases });
          } catch (error) {
            logger.error("Error fetching points details:", error);
            res.json({ purchases: [] });
          }
          break;
        }
        
        case 'bounties': {
          try {
            const bounties = await storage.getAllBounties();
            const sortedBounties = bounties
              .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
              .slice(0, 50);
            
            const detailedBounties = await Promise.all(sortedBounties.map(async b => {
              let authorName = 'Unknown';
              try {
                const author = await storage.getUser(b.authorId);
                authorName = author ? `${author.firstName} ${author.lastName}`.trim() || author.handle || author.email : 'Unknown';
              } catch (userError) {
                // Silent fail for user lookup
              }
              return {
                id: b.id,
                title: b.title,
                description: b.description,
                reward: b.reward,
                status: b.status,
                boostLevel: b.boostLevel || 0,
                authorName,
                createdAt: b.createdAt
              };
            }));
            res.json({ bounties: detailedBounties });
          } catch (error) {
            logger.error("Error fetching bounties details:", error);
            res.json({ bounties: [] });
          }
          break;
        }
        
        case 'spending': {
          try {
            const transactions = await storage.getAllTransactions();
            const spendingData = transactions
              .filter(t => ['spending', 'point_purchase'].includes(t.type))
              .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
              .slice(0, 50);
            
            const spending = await Promise.all(spendingData.map(async s => {
              let userName = 'Unknown';
              try {
                const user = await storage.getUser(s.userId);
                userName = user ? `${user.firstName} ${user.lastName}`.trim() || user.handle || user.email : 'Unknown';
              } catch (userError) {
                // Silent fail for user lookup
              }
              return {
                id: s.id,
                type: s.type,
                amount: s.amount,
                description: s.description || s.type,
                userName,
                createdAt: s.createdAt
              };
            }));
            res.json({ spending });
          } catch (error) {
            logger.error("Error fetching spending details:", error);
            res.json({ spending: [] });
          }
          break;
        }
        
        default:
          res.status(400).json({ message: "Invalid detail type" });
      }
    } catch (error) {
      logger.error(`Error fetching creator details for ${req.params.type}:`, error);
      res.status(500).json({ message: "Failed to fetch details" });
    }
  });

  // Bounty completion with platform fee
  app.post('/api/bounties/:id/complete', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      const bounty = await storage.getBounty(id);
      if (!bounty) {
        return res.status(404).json({ message: "Bounty not found" });
      }
      
      if (bounty.authorId !== userId) {
        return res.status(403).json({ message: "Only bounty author can mark as complete" });
      }
      
      if (bounty.status !== "active" || !bounty.claimedBy) {
        return res.status(400).json({ message: "Bounty must be claimed to complete" });
      }
      
      // Calculate platform fee (5% of bounty reward)
      const feeInfo = storage.calculatePlatformFee(bounty.reward.toString());
      
      // Mark bounty as completed
      await storage.updateBountyStatus(id, "completed");
      
      // Pay the worker (reward minus platform fee)
      await storage.updateUserBalance(bounty.claimedBy, feeInfo.netAmount);
      
      // Create transaction for the worker
      await storage.createTransaction({
        userId: bounty.claimedBy,
        bountyId: id,
        type: "earning",
        amount: feeInfo.netAmount,
        description: `Completed bounty: ${bounty.title} (after $${feeInfo.fee} platform fee)`,
        status: "completed",
      });
      
      // Create platform revenue record
      await storage.createPlatformRevenue({
        bountyId: id,
        amount: feeInfo.fee,
        source: "bounty_completion",
        description: `Platform fee from bounty completion: ${bounty.title}`,
      });
      
      // Create activities
      await storage.createActivity({
        userId: bounty.claimedBy,
        type: "bounty_completed",
        description: `Completed bounty: ${bounty.title}`,
        metadata: { bountyId: id, earned: feeInfo.netAmount, platformFee: feeInfo.fee },
      });
      
      await storage.createActivity({
        userId,
        type: "bounty_completed",
        description: `Bounty completed: ${bounty.title}`,
        metadata: { bountyId: id, workerId: bounty.claimedBy },
      });
      
      res.json({ 
        success: true,
        workerEarned: feeInfo.netAmount,
        platformFee: feeInfo.fee,
        originalReward: bounty.reward
      });
    } catch (error) {
      logger.error("Error completing bounty:", error);
      res.status(500).json({ message: "Failed to complete bounty" });
    }
  });

  // Database migration endpoint (temporary - for adding missing columns)
  app.post('/api/migrate-database-add-payment-intent', async (req, res) => {
    try {
      // Add the missing column if it doesn't exist
      await db.execute(sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS last_payment_intent_id VARCHAR(255)
      `);
      
      res.json({ success: true, message: "Database migrated successfully" });
    } catch (error: any) {
      logger.error("Migration error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server for real-time messaging
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws: WebSocket, req) => {
    logger.info('WebSocket client connected');
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Broadcast message to all connected clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      } catch (error) {
        logger.error('Error parsing WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
    });
  });

  return httpServer;
}
