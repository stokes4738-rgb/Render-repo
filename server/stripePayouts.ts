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
// Process direct bank transfer (ACH) - using transfers to connected account
export async function processBankTransfer(
  userId: string,
  amount: number,
  connectAccountId: string
): Promise<{ success: boolean; transferId?: string; estimatedArrival?: string; error?: string }> {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }
  
  try {
    // Create a real transfer to the connected account
    logger.info(`Processing real bank transfer of $${amount} for user ${userId}`);
    
    // Transfer funds to the connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      destination: connectAccountId,
      description: `Transfer to user ${userId}`,
      metadata: {
        userId: userId,
        type: 'bank_transfer'
      }
    });
    
    // Trigger payout from connected account to their bank
    const payout = await stripe.payouts.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      description: `Payout for user ${userId}`,
      metadata: {
        userId: userId,
        transferId: transfer.id
      }
    }, {
      stripeAccount: connectAccountId // Payout on behalf of connected account
    });
    
    logger.info(`Stripe transfer ${transfer.id} and payout ${payout.id} created for $${amount}`);
    
    return {
      success: true,
      transferId: payout.id,
      estimatedArrival: '1-2 business days'
    };
  } catch (error: any) {
    logger.error('Bank transfer error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Process instant debit card payout - using connected account
export async function processCardPayout(
  userId: string,
  amount: number,
  connectAccountId: string,
  feeAmount: number
): Promise<{ success: boolean; payoutId?: string; estimatedArrival?: string; error?: string }> {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }
  
  try {
    const netAmount = amount - feeAmount;
    
    // Create a real instant payout using connected account
    logger.info(`Processing real instant card payout of $${netAmount} (after $${feeAmount} fee) for user ${userId}`);
    
    // Transfer funds to the connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(netAmount * 100), // Convert to cents (after fee)
      currency: 'usd',
      destination: connectAccountId,
      description: `Instant transfer to user ${userId}`,
      metadata: {
        userId: userId,
        type: 'instant_payout',
        grossAmount: amount.toString(),
        fee: feeAmount.toString()
      }
    });
    
    // Trigger instant payout from connected account
    const payout = await stripe.payouts.create({
      amount: Math.round(netAmount * 100),
      currency: 'usd',
      method: 'instant', // Instant payout
      description: `Instant payout for user ${userId}`,
      metadata: {
        userId: userId,
        transferId: transfer.id
      }
    }, {
      stripeAccount: connectAccountId // Payout on behalf of connected account
    });
    
    logger.info(`Stripe instant transfer ${transfer.id} and payout ${payout.id} created for $${netAmount}`);
    
    return {
      success: true,
      payoutId: payout.id,
      estimatedArrival: 'Within 30 minutes'
    };
  } catch (error: any) {
    logger.error('Card payout error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

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