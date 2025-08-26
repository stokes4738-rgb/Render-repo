import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
  decimal,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for authentication
export const users: any = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  username: varchar("username").unique(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  handle: varchar("handle").unique(),
  bio: text("bio"),
  points: integer("points").default(0),
  balance: decimal("balance", { precision: 10, scale: 2 }).default("0.00"),
  lifetimeEarned: decimal("lifetime_earned", { precision: 10, scale: 2 }).default("0.00"),
  level: integer("level").default(1),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0.00"),
  reviewCount: integer("review_count").default(0),
  isOnline: boolean("is_online").default(false),
  lastSeen: timestamp("last_seen").defaultNow(),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  stripeConnectAccountId: varchar("stripe_connect_account_id"),
  stripeConnectStatus: varchar("stripe_connect_status"), // 'pending', 'connected', 'disabled'
  referralCode: varchar("referral_code").unique(),
  referredBy: varchar("referred_by").references((): any => users.id),
  referralCount: integer("referral_count").default(0),
  // 2FA Settings
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  twoFactorSecret: varchar("two_factor_secret"), // encrypted OTP secret
  backupCodesHash: text("backup_codes_hash"), // encrypted backup codes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_users_email").on(table.email),
  index("idx_users_username").on(table.username),
  index("idx_users_created_at").on(table.createdAt),
  index("idx_users_last_seen").on(table.lastSeen),
  index("idx_users_referral_code").on(table.referralCode),
  index("idx_users_referred_by").on(table.referredBy),
]);

export const bounties = pgTable("bounties", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  reward: decimal("reward", { precision: 10, scale: 2 }).notNull(),
  tags: text("tags").array(),
  duration: integer("duration").notNull(), // days
  status: varchar("status", { length: 50 }).default("active"), // active, completed, cancelled, expired
  authorId: varchar("author_id").references(() => users.id).notNull(),
  claimedBy: varchar("claimed_by").references(() => users.id),
  completedAt: timestamp("completed_at"),
  boostLevel: integer("boost_level").default(0), // 0 = no boost, 1-3 = boost levels
  boostExpiresAt: timestamp("boost_expires_at"),
  boostPurchasedAt: timestamp("boost_purchased_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_bounties_status").on(table.status),
  index("idx_bounties_author_id").on(table.authorId),
  index("idx_bounties_claimed_by").on(table.claimedBy),
  index("idx_bounties_created_at").on(table.createdAt),
  index("idx_bounties_category").on(table.category),
  index("idx_bounties_boost_level").on(table.boostLevel),
  index("idx_bounties_boost_expires").on(table.boostExpiresAt),
]);

export const bountyApplications = pgTable("bounty_applications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  bountyId: uuid("bounty_id").references(() => bounties.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  message: text("message"),
  status: varchar("status", { length: 50 }).default("pending"), // pending, accepted, rejected
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  bountyId: uuid("bounty_id").references(() => bounties.id),
  type: varchar("type", { length: 50 }).notNull(), // earning, spending, payout
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"), // pending, completed, failed
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_transactions_user_id").on(table.userId),
  index("idx_transactions_created_at").on(table.createdAt),
  index("idx_transactions_type").on(table.type),
]);

export const messageThreads = pgTable("message_threads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user1Id: varchar("user1_id").references(() => users.id).notNull(),
  user2Id: varchar("user2_id").references(() => users.id).notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: uuid("thread_id").references(() => messageThreads.id).notNull(),
  senderId: varchar("sender_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_messages_thread_id").on(table.threadId),
  index("idx_messages_sender_id").on(table.senderId),
  index("idx_messages_created_at").on(table.createdAt),
]);

export const friendships = pgTable("friendships", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  requesterId: varchar("requester_id").references(() => users.id).notNull(),
  addresseeId: varchar("addressee_id").references(() => users.id).notNull(),
  status: varchar("status", { length: 50 }).default("pending"), // pending, accepted, declined
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  bountyId: uuid("bounty_id").references(() => bounties.id).notNull(),
  reviewerId: varchar("reviewer_id").references(() => users.id).notNull(),
  revieweeId: varchar("reviewee_id").references(() => users.id).notNull(),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: varchar("type", { length: 100 }).notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_activities_user_id").on(table.userId),
  index("idx_activities_created_at").on(table.createdAt),
]);

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  stripePaymentMethodId: varchar("stripe_payment_method_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // card, bank_account
  last4: varchar("last4", { length: 4 }),
  brand: varchar("brand", { length: 50 }), // visa, mastercard, etc
  expiryMonth: integer("expiry_month"),
  expiryYear: integer("expiry_year"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id").notNull(),
  paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).default("0.00"), // 5% platform fee
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }).notNull(), // amount after fees
  currency: varchar("currency", { length: 3 }).default("usd"),
  status: varchar("status", { length: 50 }).notNull(), // pending, succeeded, failed
  type: varchar("type", { length: 50 }).notNull(), // deposit, withdrawal, bounty_payout
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Platform revenue tracking
export const platformRevenue = pgTable("platform_revenue", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionId: uuid("transaction_id").references(() => payments.id),
  bountyId: uuid("bounty_id").references(() => bounties.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  source: varchar("source", { length: 50 }).notNull(), // 'bounty_posting', 'bounty_completion', 'deposit', 'boost'
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_platform_revenue_created_at").on(table.createdAt),
  index("idx_platform_revenue_source").on(table.source),
]);

// Boost history table
export const boostHistory = pgTable("boost_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  bountyId: uuid("bounty_id").references(() => bounties.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  boostLevel: integer("boost_level").notNull(), // 1-3
  pointsCost: integer("points_cost").notNull(),
  durationHours: integer("duration_hours").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_boost_history_bounty_id").on(table.bountyId),
  index("idx_boost_history_user_id").on(table.userId),
  index("idx_boost_history_created_at").on(table.createdAt),
]);

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  referralCode: true,
  referredBy: true,
  referralCount: true,
  twoFactorSecret: true,
  backupCodesHash: true,
  lastSeen: true,
  isOnline: true,
});

export const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = insertUserSchema.extend({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().optional().refine((date) => {
    if (!date) return true; // Make optional for now
    const birthDate = new Date(date);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? age - 1 : age;
    return actualAge >= 16;
  }, {
    message: "You must be at least 16 years old to use this platform"
  }),
});

export const insertBountySchema = createInsertSchema(bounties).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  claimedBy: true,
  completedAt: true,
}).extend({
  title: z.string().min(5, "Title must be at least 5 characters").max(255, "Title too long"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  category: z.string().min(1, "Please select a category"),
  reward: z.union([z.string(), z.number()]).transform((val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (num < 5) throw new Error("Minimum reward is $5");
    if (num > 500) throw new Error("Maximum reward is $500");
    return num;
  }),
  duration: z.union([z.string(), z.number()]).transform((val) => {
    const num = typeof val === 'string' ? parseInt(val) : val;
    if (num < 1) throw new Error("Duration must be at least 1 day");
    if (num > 30) throw new Error("Maximum duration is 30 days");
    return num;
  }),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  readAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertFriendshipSchema = createInsertSchema(friendships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
});

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
});

export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBoostHistorySchema = createInsertSchema(boostHistory).omit({
  id: true,
  createdAt: true,
});

export const insertPlatformRevenueSchema = createInsertSchema(platformRevenue).omit({
  id: true,
  createdAt: true,
});

// 2FA verification logs table
export const twoFactorLogs = pgTable("two_factor_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: varchar("action", { length: 100 }).notNull(), // 'setup', 'verify', 'disable', 'backup_used'
  success: boolean("success").notNull(),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_2fa_logs_user_id").on(table.userId),
  index("idx_2fa_logs_created_at").on(table.createdAt),
]);

export const insertTwoFactorLogSchema = createInsertSchema(twoFactorLogs).omit({
  id: true,
  createdAt: true,
});

// Verification requests table for age/ID/background checks
export const verificationRequests = pgTable("verification_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // age_verification, background_check, id_verification
  status: varchar("status", { length: 50 }).default("pending"), // pending, approved, rejected, in_review
  documentType: varchar("document_type", { length: 50 }), // drivers_license, passport, state_id
  documentNumber: varchar("document_number"), // encrypted
  submittedData: jsonb("submitted_data"), // encrypted sensitive data
  adminNotes: text("admin_notes"),
  reviewedBy: varchar("reviewed_by").references(() => users.id), // admin who reviewed
  reviewedAt: timestamp("reviewed_at"),
  expiresAt: timestamp("expires_at"), // for background checks
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_verification_user_id").on(table.userId),
  index("idx_verification_type").on(table.type),
  index("idx_verification_status").on(table.status),
  index("idx_verification_created_at").on(table.createdAt),
]);

export const insertVerificationRequestSchema = createInsertSchema(verificationRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;
export type Bounty = typeof bounties.$inferSelect;
export type InsertBounty = z.infer<typeof insertBountySchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type MessageThread = typeof messageThreads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Friendship = typeof friendships.$inferSelect;
export type InsertFriendship = z.infer<typeof insertFriendshipSchema>;
export type Review = typeof reviews.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type BountyApplication = typeof bountyApplications.$inferSelect;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;
export type Payment = typeof payments.$inferSelect;
export type BoostHistory = typeof boostHistory.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertBoostHistory = z.infer<typeof insertBoostHistorySchema>;
export type PlatformRevenue = typeof platformRevenue.$inferSelect;
export type InsertPlatformRevenue = z.infer<typeof insertPlatformRevenueSchema>;
export type TwoFactorLog = typeof twoFactorLogs.$inferSelect;
export type InsertTwoFactorLog = z.infer<typeof insertTwoFactorLogSchema>;
export type VerificationRequest = typeof verificationRequests.$inferSelect;
export type InsertVerificationRequest = z.infer<typeof insertVerificationRequestSchema>;
