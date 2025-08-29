import Stripe from 'stripe';
import { db } from './db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { config } from './config';

const stripe = new Stripe(config.stripe.secretKey, { 
  apiVersion: '2024-11-20.acacia' 
});

export async function ensureStripeCustomer(user: { 
  id: string; 
  email?: string | null; 
  username?: string | null; 
  firstName?: string | null;
  lastName?: string | null;
  stripeCustomerId?: string | null; 
}): Promise<string> {
  // Return existing customer ID if it exists
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Create new Stripe customer
  const customerName = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user.username || undefined;

  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name: customerName,
    metadata: { 
      appUserId: user.id 
    },
  });

  // Update user record with Stripe customer ID
  await db.update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, user.id));

  return customer.id;
}

export async function getStripeCustomerByUserId(userId: string): Promise<string | null> {
  const [user] = await db.select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  return user?.stripeCustomerId || null;
}

export { stripe };