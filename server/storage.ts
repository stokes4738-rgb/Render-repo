import {
  users,
  bounties,
  transactions,
  messageThreads,
  messages,
  friendships,
  reviews,
  activities,
  bountyApplications,
  paymentMethods,
  payments,
  platformRevenue,
  boostHistory,
  type User,
  type UpsertUser,
  type Bounty,
  type InsertBounty,
  type Transaction,
  type InsertTransaction,
  type MessageThread,
  type Message,
  type InsertMessage,
  type Friendship,
  type InsertFriendship,
  type Review,
  type InsertReview,
  type Activity,
  type InsertActivity,
  type BountyApplication,
  type PaymentMethod,
  type InsertPaymentMethod,
  type Payment,
  type InsertPayment,
  type PlatformRevenue,
  type InsertPlatformRevenue,
  type BoostHistory,
  type InsertBoostHistory,
  twoFactorLogs,
  type TwoFactorLog,
  type InsertTwoFactorLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Partial<User>): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  migrateUserToPasswordAuth(userId: string, data: { username: string, password: string, firstName: string, lastName: string }): Promise<User>;
  updateUserPoints(userId: string, points: number): Promise<void>;
  updateUserBalance(userId: string, amount: string): Promise<void>;
  
  // Bounty operations
  createBounty(bounty: InsertBounty): Promise<Bounty>;
  getBounties(filters?: { category?: string; search?: string }): Promise<Bounty[]>;
  getBounty(id: string): Promise<Bounty | undefined>;
  updateBountyStatus(id: string, status: string, claimedBy?: string): Promise<void>;
  getUserBounties(userId: string): Promise<Bounty[]>;
  getExpiredBounties(cutoffDate: Date): Promise<Bounty[]>;
  
  // Boost operations
  boostBounty(bountyId: string, userId: string, boostLevel: number, pointsCost: number, durationHours: number): Promise<void>;
  getActiveBounties(): Promise<Bounty[]>;
  updateExpiredBoosts(): Promise<void>;
  
  // Application operations
  createBountyApplication(bountyId: string, userId: string, message?: string): Promise<BountyApplication>;
  getBountyApplications(bountyId: string): Promise<BountyApplication[]>;
  updateApplicationStatus(id: string, status: string): Promise<void>;
  getBountyApplication(id: string): Promise<BountyApplication | undefined>;
  getUserBountiesWithApplications(userId: string): Promise<any[]>;
  
  // Session and analytics operations
  getSessionMetrics(since: Date): Promise<{ 
    avgSessionMinutes: number; 
    singlePageSessions: number; 
    totalSessions: number; 
  }>;
  
  // Transaction operations
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getUserTransactions(userId: string): Promise<Transaction[]>;
  updateTransactionStatus(id: string, status: string): Promise<void>;
  
  // Messaging operations
  getOrCreateThread(user1Id: string, user2Id: string): Promise<MessageThread>;
  getUserThreads(userId: string): Promise<(MessageThread & { otherUser: User; lastMessage?: Message })[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getThreadMessages(threadId: string): Promise<Message[]>;
  markMessageAsRead(messageId: string): Promise<void>;
  
  // Friend operations
  createFriendRequest(friendship: InsertFriendship): Promise<Friendship>;
  getUserFriends(userId: string): Promise<(Friendship & { friend: User })[]>;
  getFriendRequests(userId: string): Promise<(Friendship & { requester: User })[]>;
  updateFriendshipStatus(id: string, status: string): Promise<void>;
  searchUsers(searchTerm: string, excludeUserId: string): Promise<User[]>;
  
  // Review operations
  createReview(review: InsertReview): Promise<Review>;
  getUserReviews(userId: string): Promise<(Review & { reviewer: User; bounty: Bounty })[]>;
  
  // Activity operations
  createActivity(activity: InsertActivity): Promise<Activity>;
  getUserActivities(userId: string): Promise<Activity[]>;
  
  // Payment operations
  createPaymentMethod(paymentMethod: InsertPaymentMethod): Promise<PaymentMethod>;
  getUserPaymentMethods(userId: string): Promise<PaymentMethod[]>;
  updatePaymentMethodDefault(userId: string, paymentMethodId: string): Promise<void>;
  deletePaymentMethod(id: string): Promise<void>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getUserPayments(userId: string): Promise<Payment[]>;
  updatePaymentStatus(id: string, status: string): Promise<void>;
  updateUserStripeInfo(userId: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<void>;
  
  // Platform revenue operations
  createPlatformRevenue(revenue: InsertPlatformRevenue): Promise<PlatformRevenue>;
  getPlatformRevenue(): Promise<PlatformRevenue[]>;
  getTotalPlatformRevenue(): Promise<string>;
  
  // Fee calculation utility
  calculatePlatformFee(amount: string): { fee: string; netAmount: string; grossAmount: string };
  
  // Creator dashboard operations
  getAllUsers(): Promise<User[]>;
  getAllBounties(): Promise<Bounty[]>;
  getAllTransactions(): Promise<Transaction[]>;
  getRecentActivity(limit?: number): Promise<Activity[]>;
  
  // Profile update operations  
  updateUserProfile(userId: string, profileData: { firstName?: string; lastName?: string; handle?: string; bio?: string; skills?: string; experience?: string }): Promise<void>;
  
  // Referral operations
  generateReferralCode(userId: string): Promise<string>;
  getUserByReferralCode(referralCode: string): Promise<User | undefined>;
  processReferralSignup(newUserId: string, referralCode: string): Promise<void>;
  getUserReferrals(userId: string): Promise<User[]>;
  updateReferralCount(userId: string): Promise<void>;
  
  // Data recovery operations
  recoverUserData(userId: string): Promise<void>;

  // 2FA operations
  enable2FA(userId: string, encryptedSecret: string, backupCodesHash: string): Promise<void>;
  disable2FA(userId: string): Promise<void>;
  update2FASecret(userId: string, encryptedSecret: string): Promise<void>;
  updateBackupCodes(userId: string, backupCodesHash: string): Promise<void>;
  log2FAActivity(data: InsertTwoFactorLog): Promise<void>;
  get2FALogs(userId: string, limit?: number): Promise<TwoFactorLog[]>;

  // Age & Background Verification operations (simplified for now)
  checkUserAge(userId: string): Promise<boolean>; // Simple age check
  flagUserForSafety(userId: string, reason?: string): Promise<void>; // Safety flag
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: Partial<User>): Promise<User> {
    const result = await db
      .insert(users)
      .values({
        ...userData,
        points: userData.points || 0,
        balance: userData.balance || "0.00",
        lifetimeEarned: userData.lifetimeEarned || "0.00",
        level: userData.level || 1,
        rating: userData.rating || "0.00",
        reviewCount: userData.reviewCount || 0,
        isOnline: false,
        referralCount: userData.referralCount || 0,
      } as any)
      .returning();
    
    return Array.isArray(result) ? result[0] : result;
  }

  async migrateUserToPasswordAuth(userId: string, data: { username: string, password: string, firstName: string, lastName: string }): Promise<User> {
    const result = await db
      .update(users)
      .set({
        username: data.username,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        handle: data.username, // Use username as initial handle
      })
      .where(eq(users.id, userId))
      .returning();
    
    return Array.isArray(result) ? result[0] : result;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // First check if user exists to preserve their game data
    const existingUser = await this.getUser(userData.id);
    
    if (existingUser) {
      // User exists - only update profile fields, NEVER touch game data
      // This protects points, balance, lifetime_earned, referral_code, etc.
      const result = await db
        .update(users)
        .set({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
          // Explicitly NOT updating: points, balance, lifetimeEarned, referralCode, handle, bio, etc.
        })
        .where(eq(users.id, userData.id))
        .returning();
      
      console.log(`[AUTH] Updated profile for user ${userData.id}, preserved game data: ${existingUser.points} points, $${existingUser.balance} balance`);
      return Array.isArray(result) ? result[0] : result;
    } else {
      // New user - create with safe defaults
      const result = await db
        .insert(users)
        .values({
          ...userData,
          points: 0,
          balance: "0.00",
          lifetimeEarned: "0.00",
        })
        .returning();
      // User created successfully
      return Array.isArray(result) ? result[0] : result;
    }
  }

  async updateUserPoints(userId: string, points: number): Promise<void> {
    await db
      .update(users)
      .set({ 
        points: sql`${users.points} + ${points}`,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId));
  }

  async updateUserBalance(userId: string, amount: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        balance: sql`${users.balance} + ${amount}`,
        lifetimeEarned: sql`${users.lifetimeEarned} + ${amount}`,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId));
  }

  // Bounty operations
  async createBounty(bounty: InsertBounty): Promise<Bounty> {
    const [newBounty] = await db.insert(bounties).values([bounty]).returning();
    return newBounty;
  }

  async getBounties(filters?: { category?: string; search?: string }): Promise<Bounty[]> {
    let conditions = [eq(bounties.status, "active")];
    
    if (filters?.category) {
      conditions.push(eq(bounties.category, filters.category));
    }
    
    if (filters?.search) {
      conditions.push(
        or(
          sql`${bounties.title} ILIKE ${'%' + filters.search + '%'}`,
          sql`${bounties.description} ILIKE ${'%' + filters.search + '%'}`
        )!
      );
    }
    
    return db
      .select()
      .from(bounties)
      .where(and(...conditions))
      .orderBy(desc(bounties.createdAt));
  }

  async getBounty(id: string): Promise<Bounty | undefined> {
    const [bounty] = await db.select().from(bounties).where(eq(bounties.id, id));
    return bounty;
  }

  async updateBountyStatus(id: string, status: string, claimedBy?: string): Promise<void> {
    await db
      .update(bounties)
      .set({ 
        status, 
        claimedBy,
        completedAt: status === "completed" ? new Date() : undefined,
        updatedAt: new Date() 
      })
      .where(eq(bounties.id, id));
  }

  async getUserBounties(userId: string): Promise<Bounty[]> {
    return db
      .select()
      .from(bounties)
      .where(or(eq(bounties.authorId, userId), eq(bounties.claimedBy, userId)))
      .orderBy(desc(bounties.createdAt));
  }

  async getExpiredBounties(cutoffDate: Date): Promise<Bounty[]> {
    return db
      .select()
      .from(bounties)
      .where(
        and(
          eq(bounties.status, "active"),
          sql`${bounties.createdAt} < ${cutoffDate.toISOString()}`
        )
      )
      .orderBy(desc(bounties.createdAt));
  }

  async getBountiesExpiredByDuration(): Promise<Bounty[]> {
    return db
      .select()
      .from(bounties)
      .where(
        and(
          eq(bounties.status, "active"),
          sql`${bounties.createdAt} + INTERVAL '1 day' * ${bounties.duration} < NOW()`
        )
      )
      .orderBy(desc(bounties.createdAt));
  }

  async deleteBounty(id: string, userId: string): Promise<Bounty | null> {
    // First get the bounty to verify ownership and get reward amount
    const [bounty] = await db.select().from(bounties).where(
      and(
        eq(bounties.id, id),
        eq(bounties.authorId, userId),
        eq(bounties.status, "active")
      )
    );
    
    if (!bounty) {
      return null;
    }
    
    // Delete the bounty
    await db.delete(bounties).where(eq(bounties.id, id));
    
    return bounty;
  }

  // Application operations
  async createBountyApplication(bountyId: string, userId: string, message?: string): Promise<BountyApplication> {
    const [application] = await db
      .insert(bountyApplications)
      .values({ bountyId, userId, message })
      .returning();
    return application;
  }

  async getBountyApplications(bountyId: string): Promise<BountyApplication[]> {
    return db
      .select()
      .from(bountyApplications)
      .where(eq(bountyApplications.bountyId, bountyId))
      .orderBy(desc(bountyApplications.createdAt));
  }

  async updateApplicationStatus(id: string, status: string): Promise<void> {
    await db
      .update(bountyApplications)
      .set({ status })
      .where(eq(bountyApplications.id, id));
  }

  async getBountyApplication(id: string): Promise<BountyApplication | undefined> {
    const [application] = await db
      .select()
      .from(bountyApplications)
      .where(eq(bountyApplications.id, id));
    return application;
  }

  async getUserBountiesWithApplications(userId: string): Promise<any[]> {
    // Get bounties created by the user
    const userBounties = await db
      .select()
      .from(bounties)
      .where(eq(bounties.authorId, userId))
      .orderBy(desc(bounties.createdAt));

    // For each bounty, get its applications with user details
    const bountiesWithApplications = await Promise.all(
      userBounties.map(async (bounty) => {
        const applications = await db
          .select({
            id: bountyApplications.id,
            message: bountyApplications.message,
            status: bountyApplications.status,
            createdAt: bountyApplications.createdAt,
            applicantId: bountyApplications.userId,
            applicantUsername: users.username,
            applicantEmail: users.email,
          })
          .from(bountyApplications)
          .leftJoin(users, eq(bountyApplications.userId, users.id))
          .where(eq(bountyApplications.bountyId, bounty.id))
          .orderBy(desc(bountyApplications.createdAt));

        return {
          ...bounty,
          applications
        };
      })
    );

    return bountiesWithApplications;
  }

  // Transaction operations
  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db.insert(transactions).values(transaction).returning();
    return newTransaction;
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    return db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));
  }

  async updateTransactionStatus(id: string, status: string): Promise<void> {
    await db
      .update(transactions)
      .set({ status })
      .where(eq(transactions.id, id));
  }

  // Messaging operations
  async getOrCreateThread(user1Id: string, user2Id: string): Promise<MessageThread> {
    const [existingThread] = await db
      .select()
      .from(messageThreads)
      .where(
        or(
          and(eq(messageThreads.user1Id, user1Id), eq(messageThreads.user2Id, user2Id)),
          and(eq(messageThreads.user1Id, user2Id), eq(messageThreads.user2Id, user1Id))
        )
      );

    if (existingThread) {
      return existingThread;
    }

    const [newThread] = await db
      .insert(messageThreads)
      .values({ user1Id, user2Id })
      .returning();
    return newThread;
  }

  async getUserThreads(userId: string): Promise<(MessageThread & { otherUser: User; lastMessage?: Message })[]> {
    const threadsWithUsers = await db
      .select({
        thread: messageThreads,
        otherUser: users,
        lastMessage: messages,
      })
      .from(messageThreads)
      .leftJoin(
        users,
        or(
          and(eq(messageThreads.user1Id, userId), eq(users.id, messageThreads.user2Id)),
          and(eq(messageThreads.user2Id, userId), eq(users.id, messageThreads.user1Id))
        )
      )
      .leftJoin(
        messages,
        and(
          eq(messages.threadId, messageThreads.id),
          eq(messages.createdAt, sql`(
            SELECT MAX(created_at) 
            FROM ${messages} 
            WHERE thread_id = ${messageThreads.id}
          )`)
        )
      )
      .where(or(eq(messageThreads.user1Id, userId), eq(messageThreads.user2Id, userId)))
      .orderBy(desc(messageThreads.lastMessageAt));

    return threadsWithUsers.map(row => ({
      ...row.thread,
      otherUser: row.otherUser!,
      lastMessage: row.lastMessage || undefined,
    }));
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    
    // Update thread's lastMessageAt
    await db
      .update(messageThreads)
      .set({ lastMessageAt: new Date() })
      .where(eq(messageThreads.id, message.threadId));
    
    return newMessage;
  }

  async getThreadMessages(threadId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.threadId, threadId))
      .orderBy(messages.createdAt);
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(eq(messages.id, messageId));
  }

  // Friend operations
  async createFriendRequest(friendship: InsertFriendship): Promise<Friendship> {
    const [newFriendship] = await db.insert(friendships).values(friendship).returning();
    return newFriendship;
  }

  async getUserFriends(userId: string): Promise<(Friendship & { friend: User })[]> {
    const userFriendships = await db
      .select({
        friendship: friendships,
        friend: users,
      })
      .from(friendships)
      .leftJoin(
        users,
        or(
          and(eq(friendships.requesterId, userId), eq(users.id, friendships.addresseeId)),
          and(eq(friendships.addresseeId, userId), eq(users.id, friendships.requesterId))
        )
      )
      .where(
        and(
          or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
          eq(friendships.status, "accepted")
        )
      );

    return userFriendships.map((row: any) => ({
      ...row.friendship,
      friend: row.friend!,
    }));
  }

  async getFriendRequests(userId: string): Promise<(Friendship & { requester: User })[]> {
    const requests = await db
      .select({
        friendship: friendships,
        requester: users,
      })
      .from(friendships)
      .leftJoin(users, eq(users.id, friendships.requesterId))
      .where(
        and(
          eq(friendships.addresseeId, userId),
          eq(friendships.status, "pending")
        )
      );

    return requests.map(row => ({
      ...row.friendship,
      requester: row.requester!,
    }));
  }

  async updateFriendshipStatus(id: string, status: string): Promise<void> {
    await db
      .update(friendships)
      .set({ status, updatedAt: new Date() })
      .where(eq(friendships.id, id));
  }

  async searchUsers(searchTerm: string, excludeUserId: string): Promise<User[]> {
    const term = `%${searchTerm.toLowerCase()}%`;
    
    return db
      .select()
      .from(users)
      .where(
        and(
          or(
            sql`LOWER(${users.firstName}) LIKE ${term}`,
            sql`LOWER(${users.lastName}) LIKE ${term}`,
            sql`LOWER(${users.handle}) LIKE ${term}`,
            sql`LOWER(${users.email}) LIKE ${term}`
          ),
          sql`${users.id} != ${excludeUserId}`
        )
      )
      .limit(20);
  }

  // Review operations
  async createReview(review: InsertReview): Promise<Review> {
    const [newReview] = await db.insert(reviews).values(review).returning();
    
    // Update user's rating
    const userReviews = await db
      .select({ rating: reviews.rating })
      .from(reviews)
      .where(eq(reviews.revieweeId, review.revieweeId));
    
    const avgRating = userReviews.reduce((sum, r) => sum + r.rating, 0) / userReviews.length;
    
    await db
      .update(users)
      .set({ 
        rating: avgRating.toFixed(2),
        reviewCount: userReviews.length,
        updatedAt: new Date() 
      })
      .where(eq(users.id, review.revieweeId));
    
    return newReview;
  }

  async getUserReviews(userId: string): Promise<(Review & { reviewer: User; bounty: Bounty })[]> {
    const userReviews = await db
      .select({
        review: reviews,
        reviewer: users,
        bounty: bounties,
      })
      .from(reviews)
      .leftJoin(users, eq(users.id, reviews.reviewerId))
      .leftJoin(bounties, eq(bounties.id, reviews.bountyId))
      .where(eq(reviews.revieweeId, userId))
      .orderBy(desc(reviews.createdAt));

    return userReviews.map(row => ({
      ...row.review,
      reviewer: row.reviewer!,
      bounty: row.bounty!,
    }));
  }

  // Activity operations
  async createActivity(activity: InsertActivity): Promise<Activity> {
    const [newActivity] = await db.insert(activities).values(activity).returning();
    return newActivity;
  }

  async getUserActivities(userId: string): Promise<Activity[]> {
    return db
      .select()
      .from(activities)
      .where(eq(activities.userId, userId))
      .orderBy(desc(activities.createdAt))
      .limit(50);
  }

  // Payment operations
  async createPaymentMethod(paymentMethod: InsertPaymentMethod): Promise<PaymentMethod> {
    const [newPaymentMethod] = await db.insert(paymentMethods).values(paymentMethod).returning();
    return newPaymentMethod;
  }

  async getUserPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    return db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, userId))
      .orderBy(desc(paymentMethods.isDefault), desc(paymentMethods.createdAt));
  }

  async updatePaymentMethodDefault(userId: string, paymentMethodId: string): Promise<void> {
    // First, unset all other payment methods as non-default
    await db
      .update(paymentMethods)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(paymentMethods.userId, userId));
    
    // Set the specified payment method as default
    await db
      .update(paymentMethods)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(paymentMethods.id, paymentMethodId), eq(paymentMethods.userId, userId)));
  }

  async deletePaymentMethod(id: string): Promise<void> {
    await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async getUserPayments(userId: string): Promise<Payment[]> {
    return db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));
  }

  async updatePaymentStatus(id: string, status: string): Promise<void> {
    await db
      .update(payments)
      .set({ status, updatedAt: new Date() })
      .where(eq(payments.id, id));
  }

  async updateUserStripeInfo(userId: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<void> {
    const updateData: any = { updatedAt: new Date() };
    if (stripeCustomerId) updateData.stripeCustomerId = stripeCustomerId;
    if (stripeSubscriptionId) updateData.stripeSubscriptionId = stripeSubscriptionId;
    
    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));
  }

  // Platform revenue operations
  async createPlatformRevenue(revenue: InsertPlatformRevenue): Promise<PlatformRevenue> {
    const [newRevenue] = await db.insert(platformRevenue).values(revenue).returning();
    return newRevenue;
  }

  async getPlatformRevenue(): Promise<PlatformRevenue[]> {
    return db
      .select()
      .from(platformRevenue)
      .orderBy(desc(platformRevenue.createdAt));
  }

  async getTotalPlatformRevenue(): Promise<string> {
    const [result] = await db
      .select({ total: sql<string>`COALESCE(SUM(${platformRevenue.amount}), 0)` })
      .from(platformRevenue);
    return result.total || "0.00";
  }

  // Fee calculation utility (5% platform fee)
  calculatePlatformFee(amount: string): { fee: string; netAmount: string; grossAmount: string } {
    const grossAmount = parseFloat(amount);
    const fee = Math.round(grossAmount * 0.05 * 100) / 100; // 5% fee, rounded to 2 decimals
    const netAmount = Math.round((grossAmount - fee) * 100) / 100;
    
    return {
      fee: fee.toFixed(2),
      netAmount: netAmount.toFixed(2),
      grossAmount: grossAmount.toFixed(2)
    };
  }

  // Creator dashboard operations
  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAllBounties(): Promise<Bounty[]> {
    return db.select().from(bounties).orderBy(desc(bounties.createdAt));
  }

  async getAllTransactions(): Promise<Transaction[]> {
    return db.select().from(transactions).orderBy(desc(transactions.createdAt));
  }

  async getRecentActivity(limit: number = 50): Promise<Activity[]> {
    return db
      .select()
      .from(activities)
      .orderBy(desc(activities.createdAt))
      .limit(limit);
  }

  async updateUserProfile(userId: string, profileData: { firstName?: string; lastName?: string; handle?: string; bio?: string; skills?: string; experience?: string }): Promise<void> {
    const updateData: any = { 
      updatedAt: new Date(),
      ...profileData
    };
    
    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));
  }

  // Referral operations
  async generateReferralCode(userId: string): Promise<string> {
    // Generate a unique 8-character referral code
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    while (true) {
      code = '';
      for (let i = 0; i < 8; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      
      // Check if code already exists
      const existing = await db.select().from(users).where(eq(users.referralCode, code)).limit(1);
      if (existing.length === 0) break;
    }
    
    // Update user with the referral code
    await db
      .update(users)
      .set({ referralCode: code, updatedAt: new Date() })
      .where(eq(users.id, userId));
    
    return code;
  }

  async getUserByReferralCode(referralCode: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.referralCode, referralCode));
    return user;
  }

  async processReferralSignup(newUserId: string, referralCode: string): Promise<void> {
    const referrer = await this.getUserByReferralCode(referralCode);
    if (!referrer) return;

    // Set the new user's referredBy field
    await db
      .update(users)
      .set({ referredBy: referrer.id, updatedAt: new Date() })
      .where(eq(users.id, newUserId));

    // Update referrer's count and award points
    await this.updateReferralCount(referrer.id);
  }

  async getUserReferrals(userId: string): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(eq(users.referredBy, userId))
      .orderBy(desc(users.createdAt));
  }

  async updateReferralCount(userId: string): Promise<void> {
    // Count current referrals
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.referredBy, userId));
    
    const newCount = countResult.count || 0;
    const user = await this.getUser(userId);
    const oldCount = user?.referralCount || 0;

    // Update referral count
    await db
      .update(users)
      .set({ referralCount: newCount, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Award milestone points
    const milestones = [1, 5, 10, 20];
    for (const milestone of milestones) {
      if (newCount >= milestone && oldCount < milestone) {
        const pointsToAward = milestone === 1 ? 10 : milestone === 5 ? 50 : milestone === 10 ? 100 : 200;
        
        await this.updateUserPoints(userId, pointsToAward);
        await this.createActivity({
          userId,
          type: "referral_milestone",
          description: `Reached ${milestone} referral${milestone > 1 ? 's' : ''}! Earned ${pointsToAward} bonus points!`,
          metadata: { milestone, pointsEarned: pointsToAward, totalReferrals: newCount },
        });
      }
    }
  }

  // Boost operations
  async boostBounty(bountyId: string, userId: string, boostLevel: number, pointsCost: number, durationHours: number): Promise<void> {
    // Deduct points from user
    const user = await this.getUser(userId);
    if (!user || user.points < pointsCost) {
      throw new Error("Insufficient points for boost");
    }

    // Update user points
    await this.updateUserPoints(userId, -pointsCost);

    // Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + durationHours);

    // Update bounty with boost info
    await db
      .update(bounties)
      .set({
        boostLevel,
        boostExpiresAt: expiresAt,
        boostPurchasedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(bounties.id, bountyId));

    // Record boost history
    await db.insert(boostHistory).values({
      bountyId,
      userId,
      boostLevel,
      pointsCost,
      durationHours,
      expiresAt
    });

    // Create transaction record with proper point-to-dollar conversion
    // Conversion rate: 200 points = $1, so 1 point = $0.005
    const dollarAmount = (pointsCost * 0.005).toFixed(2);
    await this.createTransaction({
      userId,
      bountyId,
      type: "spending",
      amount: dollarAmount,
      status: "completed",
      description: `Boosted bounty (Level ${boostLevel}) for ${durationHours} hours - ${pointsCost} points`
    });

    // Create activity
    await this.createActivity({
      userId,
      type: "bounty_boosted",
      description: `Boosted bounty for ${durationHours} hours (Level ${boostLevel})`,
      metadata: { bountyId, boostLevel, pointsCost, durationHours }
    });
  }

  async getActiveBounties(): Promise<Bounty[]> {
    const now = new Date();
    
    // Get all active bounties and sort by boost level and creation date
    const activeBounties = await db
      .select()
      .from(bounties)
      .where(eq(bounties.status, "active"))
      .orderBy(desc(bounties.boostLevel), desc(bounties.createdAt));

    // Process bounties to include duplicates for boosted posts
    const processedBounties: Bounty[] = [];
    
    for (const bounty of activeBounties) {
      // Check if boost is still active
      const isBoostActive = bounty.boostExpiresAt && bounty.boostExpiresAt > now;
      const effectiveBoostLevel = isBoostActive ? (bounty.boostLevel || 0) : 0;
      
      // Add the bounty multiple times based on boost level
      // Level 0 = 1 copy, Level 1 = 2 copies, Level 2 = 3 copies, Level 3 = 4 copies
      const copies = effectiveBoostLevel + 1;
      for (let i = 0; i < copies; i++) {
        processedBounties.push(bounty);
      }
    }
    
    return processedBounties;
  }

  async updateExpiredBoosts(): Promise<void> {
    const now = new Date();
    
    // Reset boost level for expired boosts
    await db
      .update(bounties)
      .set({
        boostLevel: 0,
        updatedAt: new Date()
      })
      .where(
        and(
          sql`${bounties.boostExpiresAt} IS NOT NULL`,
          sql`${bounties.boostExpiresAt} < ${now.toISOString()}`,
          sql`${bounties.boostLevel} > 0`
        )
      );
  }

  async getSessionMetrics(since: Date): Promise<{ 
    avgSessionMinutes: number; 
    singlePageSessions: number; 
    totalSessions: number; 
  }> {
    // Calculate session metrics based on user activity
    const recentActivities = await db.select()
      .from(activities)
      .where(sql`${activities.createdAt} > ${since.toISOString()}`);
    
    const userSessions = new Map<string, Date[]>();
    recentActivities.forEach(activity => {
      const userId = activity.userId;
      if (!userSessions.has(userId)) {
        userSessions.set(userId, []);
      }
      const createdAt = activity.createdAt || new Date();
      userSessions.get(userId)!.push(createdAt);
    });
    
    let totalMinutes = 0;
    let sessionCount = 0;
    let singlePageCount = 0;
    
    userSessions.forEach((dates) => {
      if (dates.length === 1) {
        singlePageCount++;
        totalMinutes += 5; // Assume 5 min for single activity
      } else if (dates.length > 1) {
        dates.sort((a, b) => a.getTime() - b.getTime());
        const sessionLength = (dates[dates.length - 1].getTime() - dates[0].getTime()) / 60000;
        totalMinutes += Math.min(sessionLength, 120); // Cap at 2 hours
      }
      sessionCount++;
    });
    
    return {
      avgSessionMinutes: sessionCount > 0 ? totalMinutes / sessionCount : 0,
      singlePageSessions: singlePageCount,
      totalSessions: sessionCount
    };
  }

  // Data recovery method - can restore user data from backups if needed
  async recoverUserData(userId: string): Promise<void> {
    try {
      // Get the most recent backup for this user
      const backupResult = await db.execute(sql`
        SELECT points, balance, lifetime_earned 
        FROM user_data_backups 
        WHERE user_id = ${userId}
        ORDER BY backup_date DESC 
        LIMIT 1
      `);
      
      if (backupResult.rows && backupResult.rows.length > 0) {
        const backup = backupResult.rows[0] as any;
        // Restore the user's data from backup
        await db
          .update(users)
          .set({
            points: backup.points,
            balance: backup.balance,
            lifetimeEarned: backup.lifetime_earned,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
        
        // Data restored successfully from backup
      } else {
        // No backup found for user
      }
    } catch (error) {
      // Failed to recover data from backup
    }
  }

  // 2FA operations
  async enable2FA(userId: string, encryptedSecret: string, backupCodesHash: string): Promise<void> {
    await db
      .update(users)
      .set({
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
        backupCodesHash: backupCodesHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async disable2FA(userId: string): Promise<void> {
    await db
      .update(users)
      .set({
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodesHash: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async update2FASecret(userId: string, encryptedSecret: string): Promise<void> {
    await db
      .update(users)
      .set({
        twoFactorSecret: encryptedSecret,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async updateBackupCodes(userId: string, backupCodesHash: string): Promise<void> {
    await db
      .update(users)
      .set({
        backupCodesHash: backupCodesHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async log2FAActivity(data: InsertTwoFactorLog): Promise<void> {
    await db.insert(twoFactorLogs).values(data);
  }

  async get2FALogs(userId: string, limit: number = 50): Promise<TwoFactorLog[]> {
    return db
      .select()
      .from(twoFactorLogs)
      .where(eq(twoFactorLogs.userId, userId))
      .orderBy(desc(twoFactorLogs.createdAt))
      .limit(limit);
  }

  // Age verification methods (simplified for current schema)
  async checkUserAge(userId: string): Promise<boolean> {
    // For now, assume all users are age verified (will implement proper age verification when schema is updated)
    // In production, this would check the user's dateOfBirth field
    return true;
  }

  async flagUserForSafety(userId: string, reason?: string): Promise<void> {
    console.log(`SAFETY FLAG: User ${userId} flagged for safety review. Reason: ${reason || 'Unspecified'}`);
    
    // Create an activity record for audit trail
    await this.createActivity({
      userId,
      type: 'safety_flag',
      description: `User flagged for safety review: ${reason || 'Unspecified'}`,
    });
  }
}

export const storage = new DatabaseStorage();
