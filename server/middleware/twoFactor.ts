import { Request, Response, NextFunction } from 'express';
import { TwoFactorService } from '../utils/twoFactor';
import { storage } from '../storage';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username: string;
    email: string;
    twoFactorEnabled: boolean;
    twoFactorSecret: string | null;
    backupCodesHash: string | null;
  };
}

// Middleware to require 2FA verification for sensitive operations
export const require2FA = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;
    
    // Get fresh user data to check 2FA status
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // If 2FA is not enabled, allow the operation
    if (!user.twoFactorEnabled) {
      return next();
    }

    // Check if 2FA code was provided
    const { twoFactorCode, backupCode } = req.body;
    
    if (!twoFactorCode && !backupCode) {
      return res.status(403).json({ 
        message: 'Two-factor authentication required',
        requires2FA: true 
      });
    }

    let verified = false;
    let logAction = 'verify';

    if (twoFactorCode && user.twoFactorSecret) {
      // Verify TOTP code
      const decryptedSecret = TwoFactorService.decryptSecret(user.twoFactorSecret);
      verified = TwoFactorService.verifyCode(decryptedSecret, twoFactorCode);
      logAction = 'verify';
    } else if (backupCode && user.backupCodesHash) {
      // Verify backup code
      verified = TwoFactorService.verifyBackupCode(backupCode, user.backupCodesHash);
      
      if (verified) {
        // Remove the used backup code
        const updatedCodes = TwoFactorService.removeUsedBackupCode(backupCode, user.backupCodesHash);
        if (updatedCodes) {
          await storage.updateBackupCodes(userId, updatedCodes);
        }
        logAction = 'backup_used';
      }
    }

    // Log the 2FA attempt
    await storage.log2FAActivity({
      userId,
      action: logAction,
      success: verified,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    });

    if (!verified) {
      return res.status(403).json({ 
        message: 'Invalid two-factor authentication code' 
      });
    }

    // 2FA verified, proceed with the operation
    next();
  } catch (error) {
    console.error('2FA verification error:', error);
    return res.status(500).json({ message: 'Two-factor authentication verification failed' });
  }
};

// Check if user has 2FA enabled
export const check2FAStatus = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  req.body.requires2FA = req.user.twoFactorEnabled || false;
  next();
};