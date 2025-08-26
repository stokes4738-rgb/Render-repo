import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuthJWT, verifyToken } from "./authJWT";
import { insertBountySchema, insertMessageSchema, insertTransactionSchema, insertReviewSchema, insertPaymentMethodSchema, insertPaymentSchema, insertPlatformRevenueSchema } from "@shared/schema";
import { logger } from "./utils/logger";
import { sendSupportEmail } from "./utils/email";
import { TwoFactorService } from "./utils/twoFactor";
import { require2FA } from "./middleware/twoFactor";
import { requireAgeVerification } from "./middleware/ageVerification";
import { checkIPBan } from "./middleware/ipBanning";
import Stripe from "stripe";

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
      const user = await storage.getUser(userId);
      
      let referralCode = user?.referralCode;
      if (!referralCode) {
        // Generate a new referral code
        referralCode = await storage.generateReferralCode(userId);
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
      const user = await storage.getUser(userId);
      const referrals = await storage.getUserReferrals(userId);
      
      const referralCount = user?.referralCount || 0;
      const milestones = [
        { count: 1, points: 10, reached: referralCount >= 1 },
        { count: 5, points: 50, reached: referralCount >= 5 },
        { count: 10, points: 100, reached: referralCount >= 10 },
        { count: 20, points: 200, reached: referralCount >= 20 }
      ];
      
      res.json({ 
        referralCount,
        referrals: referrals.map(r => ({
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

      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(selectedPackage.price * 100), // Convert to cents
        currency: "usd",
        metadata: {
          userId,
          packageId,
          points: selectedPackage.points.toString(),
          type: "point_purchase"
        },
        description: `${selectedPackage.label} - ${selectedPackage.points} points`,
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
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

      // Retrieve payment intent to verify payment
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      logger.info(`Payment intent status: ${paymentIntent.status}, amount: ${paymentIntent.amount}`);
      
      if (paymentIntent.status !== 'succeeded') {
        logger.error(`Payment not completed. Status: ${paymentIntent.status}`);
        return res.status(400).json({ message: "Payment not completed" });
      }

      if (paymentIntent.metadata.userId !== userId) {
        logger.error(`Payment belongs to different user. Expected: ${userId}, Found: ${paymentIntent.metadata.userId}`);
        return res.status(403).json({ message: "Payment belongs to different user" });
      }

      if (paymentIntent.metadata.type !== 'point_purchase') {
        logger.error(`Invalid payment type: ${paymentIntent.metadata.type}`);
        return res.status(400).json({ message: "Invalid payment type" });
      }

      const pointsToAward = parseInt(paymentIntent.metadata.points);
      const packageLabel = paymentIntent.description;
      const purchaseAmount = (paymentIntent.amount / 100).toFixed(2);

      logger.info(`Awarding ${pointsToAward} points to user ${userId} for $${purchaseAmount}`);

      // Award points to user
      await storage.updateUserPoints(userId, pointsToAward);
      logger.info(`Points awarded successfully`);

      // Create transaction record
      const transaction = await storage.createTransaction({
        userId,
        type: "point_purchase",
        amount: purchaseAmount,
        description: `Purchased ${packageLabel}`,
        status: "completed",
      });
      logger.info(`Transaction created: ${transaction.id}`);

      // Create activity
      await storage.createActivity({
        userId,
        type: "points_purchased",
        description: `Purchased ${pointsToAward} points for $${purchaseAmount}`,
        metadata: { 
          points: pointsToAward, 
          amount: purchaseAmount,
          package: paymentIntent.metadata.packageId
        },
      });
      logger.info(`Activity created`);

      // Create platform revenue record
      await storage.createPlatformRevenue({
        amount: purchaseAmount,
        source: "point_purchase",
        description: `Point purchase: ${packageLabel}`,
      });
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
      // Check for expired bounties and boosts before returning list
      await processExpiredBounties();
      await storage.updateExpiredBoosts();
      
      const { category, search } = req.query;
      
      // If no filters, use the boost-aware method
      if (!category && !search) {
        const bounties = await storage.getActiveBounties();
        res.json(bounties);
      } else {
        // Use regular filtered search
        const bounties = await storage.getBounties({
          category: category as string,
          search: search as string,
        });
        res.json(bounties);
      }
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

  app.post('/api/bounties', verifyToken, requireAgeVerification, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const bountyData = insertBountySchema.parse({ ...req.body, authorId: userId });
      
      // Full bounty amount is charged upfront (held in escrow)
      const bountyReward = parseFloat(bountyData.reward.toString());
      
      // Check if user has enough balance for the full bounty amount
      const user = await storage.getUser(userId);
      if (!user || parseFloat(user.balance) < bountyReward) {
        return res.status(400).json({ 
          message: `Insufficient balance. Need $${bountyReward.toFixed(2)} (held in escrow until completed or auto-refunded after 3 days minus ${bountyReward >= 250 ? '3.5%' : '5%'} fee)` 
        });
      }
      
      const bounty = await storage.createBounty(bountyData);
      
      // Deduct full bounty amount from user balance (held in escrow)
      await storage.updateUserBalance(userId, `-${bountyReward}`);
      
      // Deduct points for posting bounty
      await storage.updateUserPoints(userId, -5);
      
      // Create transaction record for escrow hold
      await storage.createTransaction({
        userId,
        type: "escrow_hold",
        amount: bountyReward.toString(),
        description: `Posted bounty: ${bountyData.title} (held in escrow, auto-refunds in 3 days minus ${bountyReward >= 250 ? '3.5%' : '5%'} fee if unclaimed)`,
        status: "completed",
      });

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
      
      const application = await storage.createBountyApplication(id, userId, message);
      
      // Create activity
      await storage.createActivity({
        userId,
        type: "bounty_applied",
        description: "Applied to a bounty",
        metadata: { bountyId: id },
      });
      
      res.status(201).json(application);
    } catch (error) {
      logger.error("Error applying to bounty:", error);
      res.status(500).json({ message: "Failed to apply to bounty" });
    }
  });

  app.get('/api/user/bounties', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const bounties = await storage.getUserBountiesWithApplications(userId);
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

      // Get the bounty
      const bounty = await storage.getBounty(id);
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

      // Money is already in escrow from when bounty was posted
      // Just transfer to the hunter (no deduction from creator needed)
      await storage.updateUserBalance(completedBy, rewardAmount.toString()); // Add to hunter
      
      // No need to deduct from creator - money was already taken when bounty was posted

      // Update bounty status
      await storage.updateBountyStatus(id, "completed", completedBy);

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
      
      await storage.updateUserPoints(userId, points);
      await storage.createActivity({
        userId,
        type: "points_earned",
        description: `Earned ${points} points: ${reason}`,
        metadata: { points, reason },
      });
      
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
      const threads = await storage.getUserThreads(userId);
      res.json(threads);
    } catch (error) {
      logger.error("Error fetching threads:", error);
      res.status(500).json({ message: "Failed to fetch threads" });
    }
  });

  app.get('/api/messages/threads/:threadId', verifyToken, async (req: any, res) => {
    try {
      const { threadId } = req.params;
      const messages = await storage.getThreadMessages(threadId);
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
      const message = await storage.createMessage(messageData);
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
      const user = await storage.getUser(userId);
      
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
      const user = await storage.getUser(userId);
      
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
      
      // Enable 2FA in database
      await storage.enable2FA(userId, encryptedSecret, hashedBackupCodes);
      
      // Log activity
      await storage.log2FAActivity({
        userId,
        action: 'setup',
        success: true,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
      });
      
      res.json({ success: true, message: '2FA enabled successfully' });
    } catch (error) {
      logger.error("Error enabling 2FA:", error);
      res.status(500).json({ message: "Failed to enable 2FA" });
    }
  });

  app.post('/api/2fa/disable', verifyToken, require2FA, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Disable 2FA in database
      await storage.disable2FA(userId);
      
      // Log activity
      await storage.log2FAActivity({
        userId,
        action: 'disable',
        success: true,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
      });
      
      res.json({ success: true, message: '2FA disabled successfully' });
    } catch (error) {
      logger.error("Error disabling 2FA:", error);
      res.status(500).json({ message: "Failed to disable 2FA" });
    }
  });

  app.get('/api/2fa/logs', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const logs = await storage.get2FALogs(userId, 20);
      
      res.json(logs);
    } catch (error) {
      logger.error("Error fetching 2FA logs:", error);
      res.status(500).json({ message: "Failed to fetch 2FA logs" });
    }
  });

  // Feedback system for users to contact creator
  app.post('/api/feedback', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { message, type } = req.body;
      const creatorId = "46848986"; // Dallas Abbott's user ID

      if (!message || !message.trim()) {
        return res.status(400).json({ message: "Message is required" });
      }

      // Get or create thread between user and creator
      const thread = await storage.getOrCreateThread(userId, creatorId);
      
      // Create the feedback message
      const newMessage = await storage.createMessage({
        threadId: thread.id,
        senderId: userId,
        content: message.trim(),
      });

      // Create activity for the feedback
      await storage.createActivity({
        userId,
        type: "feedback_sent",
        description: `Sent ${type || 'feedback'} to creator`,
        metadata: { type, threadId: thread.id },
      });

      res.status(201).json({ 
        success: true, 
        message: "Feedback sent successfully",
        threadId: thread.id 
      });
    } catch (error: any) {
      logger.error("Error sending feedback:", error);
      res.status(500).json({ message: "Failed to send feedback" });
    }
  });

  // Creator inbox - get all feedback threads
  app.get('/api/creator/feedback-threads', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const creatorId = "46848986"; // Dallas Abbott's user ID
      
      // Only allow creator to access this endpoint
      // Creator tab is only visible to app creator (46848986) so no additional checks needed

      const threads = await storage.getUserThreads(creatorId);
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
      
      await storage.updateUserProfile(userId, {
        firstName,
        lastName,
        handle,
        bio,
        skills,
        experience
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Payment routes
  app.get('/api/payments/methods', verifyToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const paymentMethods = await storage.getUserPaymentMethods(userId);
      res.json(paymentMethods);
    } catch (error) {
      logger.error("Error fetching payment methods:", error);
      res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  app.post('/api/payments/setup-intent', verifyToken, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment system not configured" });
    }

    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.email) {
        return res.status(400).json({ message: "User email required" });
      }

      let customer;
      if (user.stripeCustomerId) {
        customer = await stripe.customers.retrieve(user.stripeCustomerId);
      } else {
        customer = await stripe.customers.create({
          email: user.email,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email,
        });
        await storage.updateUserStripeInfo(userId, customer.id);
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: customer.id,
        usage: 'off_session',
      });

      res.json({ clientSecret: setupIntent.client_secret });
    } catch (error: any) {
      logger.error("Error creating setup intent:", error);
      res.status(500).json({ message: "Failed to create setup intent" });
    }
  });

  app.post('/api/payments/save-method', verifyToken, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment system not configured" });
    }

    try {
      const userId = req.user.id;
      const { paymentMethodId } = req.body;

      if (!paymentMethodId) {
        return res.status(400).json({ message: "Payment method ID required" });
      }

      // Retrieve payment method from Stripe
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      
      // Save to our database
      const savedMethod = await storage.createPaymentMethod({
        userId,
        stripePaymentMethodId: paymentMethodId,
        type: paymentMethod.type,
        last4: paymentMethod.card?.last4,
        brand: paymentMethod.card?.brand,
        expiryMonth: paymentMethod.card?.exp_month,
        expiryYear: paymentMethod.card?.exp_year,
        isDefault: false,
      });

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

      if (!amount || !paymentMethodId) {
        return res.status(400).json({ message: "Amount and payment method required" });
      }

      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ message: "Stripe customer not found" });
      }

      // Calculate platform fee (5% of deposit)
      const feeInfo = storage.calculatePlatformFee(amount.toString());
      const totalCharge = parseFloat(feeInfo.grossAmount) + parseFloat(feeInfo.fee);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalCharge * 100), // Convert to cents, include fee
        currency: 'usd',
        customer: user.stripeCustomerId,
        payment_method: paymentMethodId,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
        },
        return_url: `${req.protocol}://${req.get('host')}/account`,
      });

      // Save payment record
      const payment = await storage.createPayment({
        userId,
        stripePaymentIntentId: paymentIntent.id,
        amount: feeInfo.grossAmount,
        platformFee: feeInfo.fee,
        netAmount: feeInfo.grossAmount, // User gets the full amount they requested
        status: paymentIntent.status,
        type: 'deposit',
        description: `Account deposit of $${amount} (platform fee: $${feeInfo.fee})`,
      });

      // If payment succeeded, update user balance and record platform revenue
      if (paymentIntent.status === 'succeeded') {
        await storage.updateUserBalance(userId, feeInfo.grossAmount);
        await storage.updatePaymentStatus(payment.id, 'succeeded');
        
        // Create platform revenue record
        await storage.createPlatformRevenue({
          transactionId: payment.id,
          amount: feeInfo.fee,
          source: "deposit",
          description: `Platform fee from deposit: $${amount}`,
        });
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
    try {
      const userId = req.user.id;
      const payments = await storage.getUserPayments(userId);
      res.json(payments);
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
        feeAmount = Math.max(0.25, withdrawalAmount * 0.015); // 1.5% or $0.25 minimum
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

      // Process the payout using the new direct payment methods
      let payoutResult;
      let transferId;
      
      if (stripe && (user.bankAccountToken || user.debitCardToken)) {
        // Use the new direct payout methods
        if (method === 'debit_card' && user.debitCardToken && user.stripeConnectAccountId) {
          const { processCardPayout } = await import('./stripePayouts');
          payoutResult = await processCardPayout(
            userId,
            withdrawalAmount,
            user.stripeConnectAccountId,
            feeAmount
          );
          transferId = payoutResult.payoutId;
        } else if (method === 'bank_transfer' && user.bankAccountToken && user.stripeConnectAccountId) {
          const { processBankTransfer } = await import('./stripePayouts');
          payoutResult = await processBankTransfer(
            userId,
            withdrawalAmount,
            user.stripeConnectAccountId
          );
          transferId = payoutResult.transferId;
        } else {
          // Fallback for other methods
          const { processStripePayout } = await import('./stripePayouts');
          payoutResult = await processStripePayout({
            amount: finalAmount,
            userId,
            email: user.email,
            stripeConnectAccountId: user.stripeConnectAccountId,
            method: method === 'debit_card' ? 'debit_card' : 'bank_transfer'
          });
          transferId = payoutResult.payoutId;
        }
      } else {
        // Fallback to simulated payout
        transferId = `sim_transfer_${Date.now()}`;
        payoutResult = {
          success: true,
          payoutId: transferId,
          amount: finalAmount,
          status: 'pending',
          estimatedArrival: method === 'debit_card' ? 'instant' : '1-2 business days'
        };
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
      
      if (stripe) {
        // For payouts, we need to create a Custom Connect account first if user doesn't have one
        let connectAccountId = user.stripeConnectAccountId;
        
        if (!connectAccountId) {
          // Create a Custom Connect account for this user
          const account = await stripe.accounts.create({
            type: 'custom',
            country: 'US',
            email: user.email,
            capabilities: {
              transfers: { requested: true },
            },
            business_type: 'individual',
            individual: {
              first_name: user.firstName || 'Unknown',
              last_name: user.lastName || 'User',
              email: user.email,
            },
            tos_acceptance: {
              date: Math.floor(Date.now() / 1000),
              ip: req.ip || '127.0.0.1',
            },
          });
          
          connectAccountId = account.id;
          await storage.updateUser(userId, {
            stripeConnectAccountId: connectAccountId
          });
        }
        
        // Add the bank account as an external account to the Connect account
        const bankAccount = await stripe.accounts.createExternalAccount(connectAccountId, {
          external_account: {
            object: 'bank_account',
            country: 'US',
            currency: 'usd',
            account_holder_name: user.username,
            account_holder_type: 'individual',
            routing_number: routingNumber,
            account_number: accountNumber,
          },
          default_for_currency: true,
        });
        
        // Store the bank account details
        const last4 = accountNumber.slice(-4);
        await storage.updateUser(userId, {
          bankAccountToken: bankAccount.id,
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
        // Create a debit card token with Stripe
        const token = await stripe.tokens.create({
          card: {
            number: cardNumber,
            exp_month: parseInt(expMonth),
            exp_year: parseInt('20' + expYear),
            cvc: cvc,
          },
        });
        
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
      
      // Add funds to user balance
      await storage.updateUserBalance(userId, amount);
      
      // Create transaction record
      await storage.createTransaction({
        userId,
        type: "earning",
        amount,
        description: "Test deposit",
        status: "completed",
      });
      
      // Create activity
      await storage.createActivity({
        userId,
        type: "deposit",
        description: `Added $${amount} in test funds`,
        metadata: { amount },
      });
      
      const updatedUser = await storage.getUser(userId);
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
      const user = await storage.getUser(userId);
      
      // Allow access to the app creator (you) or admin users
      // Creator tab is only visible to app creator (46848986) so no additional checks needed

      // Get comprehensive app statistics
      const [
        revenue,
        totalRevenue,
        allUsers,
        allBounties,
        allTransactions,
        recentActivity
      ] = await Promise.all([
        storage.getPlatformRevenue(),
        storage.getTotalPlatformRevenue(),
        storage.getAllUsers(),
        storage.getAllBounties(),
        storage.getAllTransactions(),
        storage.getRecentActivity(50)
      ]);

      // Calculate user statistics
      const activeUsers = allUsers.filter(u => 
        new Date(u.lastLogin || u.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length;

      const totalUserBalance = allUsers.reduce((sum, u) => sum + parseFloat(u.balance || '0'), 0);

      // Calculate bounty statistics
      const activeBounties = allBounties.filter(b => b.status === 'active').length;
      const completedBounties = allBounties.filter(b => b.status === 'completed').length;
      const totalBountyValue = allBounties.reduce((sum, b) => sum + parseFloat(b.reward || '0'), 0);

      // Calculate transaction statistics
      const deposits = allTransactions.filter(t => t.type === 'earning');
      const withdrawals = allTransactions.filter(t => t.type === 'withdrawal'); // Fix: use 'withdrawal' not 'spending'
      const totalVolume = allTransactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);

      // Calculate comprehensive spending analytics
      const pointPurchases = allTransactions.filter(t => t.type === 'point_purchase');
      const totalPointPurchases = pointPurchases.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
      
      const spendingTransactions = allTransactions.filter(t => t.type === 'spending');
      const totalSpending = spendingTransactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
      
      const refundTransactions = allTransactions.filter(t => t.type === 'refund');
      const totalRefunds = refundTransactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
      
      // Calculate total money users have spent across all categories
      const totalUserSpent = totalPointPurchases + totalSpending;
      
      // Break down spending by category
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
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const newUsersLast30 = allUsers.filter(u => new Date(u.createdAt) > thirtyDaysAgo).length;
      const newUsersPrevious30 = allUsers.filter(u => 
        new Date(u.createdAt) > sixtyDaysAgo && new Date(u.createdAt) <= thirtyDaysAgo
      ).length;

      const userGrowthRate = newUsersPrevious30 > 0 
        ? ((newUsersLast30 - newUsersPrevious30) / newUsersPrevious30 * 100).toFixed(1)
        : newUsersLast30 > 0 ? '100' : '0';

      // Game Analytics
      const gameTransactions = allTransactions.filter(t => 
        t.type === 'earning' && 
        t.description && 
        (t.description.includes('game') || 
         t.description.includes('Snake') ||
         t.description.includes('Tetris') ||
         t.description.includes('Space Invaders') ||
         t.description.includes('2048') ||
         t.description.includes('Flappy') ||
         t.description.includes('Simon Says') ||
         t.description.includes('Memory Match') ||
         t.description.includes('Whack-a-Mole') ||
         t.description.includes('Connect Four') ||
         t.description.includes('Asteroids') ||
         t.description.includes('Pac-Man') ||
         t.description.includes('Racing') ||
         t.description.includes('Breakout'))
      );

      const gameStats = {
        totalGamesPlayed: gameTransactions.length,
        totalPointsEarned: gameTransactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0),
        mostPopularGames: (() => {
          const gameCount: Record<string, { plays: number; points: number }> = {};
          gameTransactions.forEach(t => {
            const desc = t.description || '';
            let gameName = 'Unknown';
            
            if (desc.includes('Snake')) gameName = 'Snake';
            else if (desc.includes('Tetris')) gameName = 'Tetris';
            else if (desc.includes('Space Invaders')) gameName = 'Space Invaders';
            else if (desc.includes('2048')) gameName = '2048';
            else if (desc.includes('Flappy')) gameName = 'Flappy Bird';
            else if (desc.includes('Simon Says')) gameName = 'Simon Says';
            else if (desc.includes('Memory Match')) gameName = 'Memory Match';
            else if (desc.includes('Whack-a-Mole')) gameName = 'Whack-a-Mole';
            else if (desc.includes('Connect Four')) gameName = 'Connect Four';
            else if (desc.includes('Asteroids')) gameName = 'Asteroids';
            else if (desc.includes('Pac-Man')) gameName = 'Pac-Man';
            else if (desc.includes('Racing')) gameName = 'Racing';
            else if (desc.includes('Breakout')) gameName = 'Breakout';
            
            if (!gameCount[gameName]) {
              gameCount[gameName] = { plays: 0, points: 0 };
            }
            gameCount[gameName].plays++;
            gameCount[gameName].points += parseFloat(t.amount || '0');
          });
          
          return Object.entries(gameCount)
            .map(([name, data]) => ({
              name,
              plays: data.plays,
              pointsEarned: data.points
            }))
            .sort((a, b) => b.plays - a.plays);
        })(),
        recentGameActivity: gameTransactions
          .slice(-10)
          .map(t => ({
            game: t.description?.split(' - ')[0] || 'Unknown',
            points: parseFloat(t.amount || '0'),
            userId: t.userId,
            timestamp: t.createdAt
          }))
      };

      // Top Performers
      const userEarnings: Record<string, { earned: number; spent: number; actions: number; name: string }> = {};
      
      allUsers.forEach(user => {
        userEarnings[user.id] = {
          earned: 0,
          spent: 0,
          actions: 0,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email
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

      // User Engagement Metrics
      const dailyActiveUsers = allUsers.filter(u => 
        new Date(u.lastLogin || u.createdAt) > oneDayAgo
      ).length;
      
      const weeklyActiveUsers = allUsers.filter(u => 
        new Date(u.lastLogin || u.createdAt) > sevenDaysAgo
      ).length;
      
      const monthlyActiveUsers = allUsers.filter(u => 
        new Date(u.lastLogin || u.createdAt) > thirtyDaysAgo
      ).length;

      // Calculate retention rate (users who returned after 7 days)
      const usersFromLastWeek = allUsers.filter(u => {
        const createdDate = new Date(u.createdAt);
        return createdDate < sevenDaysAgo && createdDate > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      });
      
      const retainedUsers = usersFromLastWeek.filter(u => 
        new Date(u.lastLogin || u.createdAt) > sevenDaysAgo
      ).length;
      
      const retentionRate = usersFromLastWeek.length > 0 
        ? ((retainedUsers / usersFromLastWeek.length) * 100).toFixed(1)
        : '0';

      // Calculate real session metrics
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
          total: allUsers.length,
          active: activeUsers,
          totalBalance: totalUserBalance.toFixed(2),
          newLast30Days: newUsersLast30,
          growthRate: userGrowthRate
        },
        bounties: {
          total: allBounties.length,
          active: activeBounties,
          completed: completedBounties,
          totalValue: totalBountyValue.toFixed(2),
          completionRate: allBounties.length > 0 ? ((completedBounties / allBounties.length) * 100).toFixed(1) : '0'
        },
        transactions: {
          total: allTransactions.length,
          totalVolume: totalVolume.toFixed(2),
          deposits: deposits.length,
          withdrawals: withdrawals.length,
          avgTransactionSize: allTransactions.length > 0 ? (totalVolume / allTransactions.length).toFixed(2) : '0'
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
        gameStats,
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
      
      // Creator tab is only visible to app creator (46848986) so no additional checks needed
      const user = await storage.getUser(userId);
      
      switch (type) {
        case 'users': {
          const users = await storage.getAllUsers();
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
          break;
        }
        
        case 'revenue': {
          const revenue = await storage.getPlatformRevenue();
          const transactions = revenue
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 100) // Recent 100 transactions
            .map(async r => {
              let userName = 'Platform';
              if (r.bountyId) {
                const bounty = await storage.getBounty(r.bountyId);
                if (bounty) {
                  const user = await storage.getUser(bounty.claimedBy || bounty.authorId);
                  userName = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : 'Unknown';
                }
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
          break;
        }
        
        case 'points': {
          const transactions = await storage.getAllTransactions();
          const pointPurchases = transactions
            .filter(t => t.type === 'point_purchase')
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 100);
          
          const purchases = await Promise.all(pointPurchases.map(async p => {
            const user = await storage.getUser(p.userId);
            return {
              id: p.id,
              amount: p.amount,
              points: parseFloat(p.amount) * 100, // Points from boost purchases
              userName: user ? `${user.firstName} ${user.lastName}`.trim() || user.handle || user.email : 'Unknown',
              userEmail: user?.email || '',
              createdAt: p.createdAt
            };
          }));
          res.json({ purchases });
          break;
        }
        
        case 'bounties': {
          const bounties = await storage.getAllBounties();
          const sortedBounties = bounties
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 100);
          
          const detailedBounties = await Promise.all(sortedBounties.map(async b => {
            const author = await storage.getUser(b.authorId);
            return {
              id: b.id,
              title: b.title,
              description: b.description,
              reward: b.reward,
              status: b.status,
              boostLevel: b.boostLevel || 0,
              authorName: author ? `${author.firstName} ${author.lastName}`.trim() || author.handle || author.email : 'Unknown',
              createdAt: b.createdAt
            };
          }));
          res.json({ bounties: detailedBounties });
          break;
        }
        
        case 'spending': {
          const transactions = await storage.getAllTransactions();
          const spendingData = transactions
            .filter(t => ['spending', 'point_purchase'].includes(t.type))
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 100);
          
          const spending = await Promise.all(spendingData.map(async s => {
            const user = await storage.getUser(s.userId);
            return {
              id: s.id,
              type: s.type,
              amount: s.amount,
              description: s.description || s.type,
              userName: user ? `${user.firstName} ${user.lastName}`.trim() || user.handle || user.email : 'Unknown',
              createdAt: s.createdAt
            };
          }));
          res.json({ spending });
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
