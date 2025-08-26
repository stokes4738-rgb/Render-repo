import Stripe from "stripe";
import { logger } from "./utils/logger";
import { storage } from "./storage";

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-07-30.basil" })
  : null;

export interface PayoutOptions {
  amount: number; // in dollars
  userId: string;
  email: string;
  stripeConnectAccountId?: string;
  method: 'bank_transfer' | 'debit_card';
}

export async function processStripePayout(options: PayoutOptions) {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  const { amount, userId, email, stripeConnectAccountId, method } = options;
  const amountInCents = Math.round(amount * 100);

  try {
    // If user has a connected Stripe account, process real payout
    if (stripeConnectAccountId) {
      // Create a transfer to the connected account
      const transfer = await stripe.transfers.create({
        amount: amountInCents,
        currency: 'usd',
        destination: stripeConnectAccountId,
        description: `Payout for user ${userId}`,
        metadata: {
          userId: userId,
          method: method
        }
      });

      // Trigger instant payout if debit card method
      if (method === 'debit_card') {
        try {
          const payout = await stripe.payouts.create({
            amount: amountInCents,
            currency: 'usd',
            method: 'instant',
            description: `Instant payout for ${email}`
          }, {
            stripeAccount: stripeConnectAccountId
          });
          
          logger.info(`Real instant payout created: ${payout.id} for $${amount} to user ${userId}`);
          
          return {
            success: true,
            payoutId: payout.id,
            transferId: transfer.id,
            amount: amount,
            status: 'paid',
            estimatedArrival: 'instant'
          };
        } catch (instantError) {
          // Fall back to standard payout if instant fails
          logger.warn("Instant payout failed, falling back to standard:", instantError);
        }
      }
      
      // Standard payout for bank transfers
      const payout = await stripe.payouts.create({
        amount: amountInCents,
        currency: 'usd',
        method: 'standard',
        description: `Payout for ${email}`
      }, {
        stripeAccount: stripeConnectAccountId
      });
      
      logger.info(`Real payout created: ${payout.id} for $${amount} to user ${userId}`);
      
      return {
        success: true,
        payoutId: payout.id,
        transferId: transfer.id,
        amount: amount,
        status: 'pending',
        estimatedArrival: method === 'debit_card' ? '30 minutes' : '1-2 business days'
      };
    } else {
      // User hasn't connected their account yet
      logger.info(`User ${userId} needs to connect their Stripe account for real payouts`);
      
      return {
        success: false,
        payoutId: null,
        amount: amount,
        status: 'requires_account',
        estimatedArrival: null,
        message: 'Please connect your bank account to receive payouts'
      };
    }

  } catch (error: any) {
    logger.error("Stripe payout error:", error);
    throw new Error(error.message || "Failed to process payout");
  }
}

// Function to create a Stripe Connect account for a user (for real implementation)
export async function createStripeConnectAccount(userId: string, email: string) {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  try {
    const account = await stripe.accounts.create({
      type: 'express',
      email: email,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        userId: userId
      }
    });

    // Create account link for onboarding
    // Detect the correct HTTPS URL based on environment
    let baseUrl: string;
    
    if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
      // Replit development environment - use the HTTPS Replit URL
      baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    } else if (process.env.REPLIT_DEV_DOMAIN) {
      // Alternative Replit domain format
      baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else if (process.env.APP_URL && process.env.APP_URL.startsWith('https')) {
      // Custom domain if set
      baseUrl = process.env.APP_URL;
    } else {
      // Fallback to pocketbounty.life for production
      baseUrl = 'https://pocketbounty.life';
    }
    
    console.log('Using base URL for Stripe Connect:', baseUrl);
    
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${baseUrl}/account?tab=withdraw`,
      return_url: `${baseUrl}/api/payments/connect-return`,
      type: 'account_onboarding',
    });

    return {
      accountId: account.id,
      onboardingUrl: accountLink.url
    };
  } catch (error: any) {
    logger.error("Error creating Stripe Connect account:", error);
    throw new Error(error.message || "Failed to create payment account");
  }
}