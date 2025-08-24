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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserPoints(userId: string, points: number): Promise<void>;
  updateUserBalance(userId: string, amount: string): Promise<void>;
  
  // Bounty operations
  createBounty(bounty: InsertBounty): Promise<Bounty>;
  getBounties(filters?: { category?: string; search?: string }): Promise<Bounty[]>;
  getBounty(id: string): Promise<Bounty | undefined>;
  updateBountyStatus(id: string, status: string, claimedBy?: string): Promise<void>;
  getUserBounties(userId: string): Promise<Bounty[]>;
  getExpiredBounties(cutoffDate: Date): Promise<Bounty[]>;
  
  // Application operations
  createBountyApplication(bountyId: string, userId: string, message?: string): Promise<BountyApplication>;
  getBountyApplications(bountyId: string): Promise<BountyApplication[]>;
  updateApplicationStatus(id: string, status: string): Promise<void>;
  
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
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
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
    const [newBounty] = await db.insert(bounties).values(bounty).returning();
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
}

export const storage = new DatabaseStorage();
