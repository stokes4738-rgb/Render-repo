import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';

const APP_NAME = 'Pocket Bounty';
const APP_ISSUER = 'pocketbounty.life';

export class TwoFactorService {
  // Generate a new secret for 2FA setup
  static generateSecret(): string {
    const secret = new Secret({ size: 20 });
    return secret.base32;
  }

  // Generate QR code URL for authenticator apps
  static async generateQRCode(username: string, secret: string): Promise<string> {
    const totp = new TOTP({
      issuer: APP_ISSUER,
      label: `${APP_NAME}:${username}`,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });

    const uri = totp.toString();
    return await QRCode.toDataURL(uri);
  }

  // Verify a TOTP code
  static verifyCode(secret: string, code: string, window: number = 1): boolean {
    const totp = new TOTP({
      issuer: APP_ISSUER,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });

    // Allow some time window for clock drift
    const delta = totp.validate({ 
      token: code, 
      window: window // Allow codes from 1 period before/after
    });

    return delta !== null;
  }

  // Generate backup codes (8-digit codes)
  static generateBackupCodes(count: number = 10): string[] {
    const codes = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-digit backup codes
      const code = Math.floor(10000000 + Math.random() * 90000000).toString();
      codes.push(code);
    }
    return codes;
  }

  // Hash backup codes for secure storage
  static hashBackupCodes(codes: string[]): string {
    const hashedCodes = codes.map(code => {
      const hash = crypto.createHash('sha256');
      hash.update(code);
      return hash.digest('hex');
    });
    return JSON.stringify(hashedCodes);
  }

  // Verify a backup code against hashed codes
  static verifyBackupCode(code: string, hashedCodesJson: string): boolean {
    try {
      const hashedCodes: string[] = JSON.parse(hashedCodesJson);
      const hash = crypto.createHash('sha256');
      hash.update(code);
      const codeHash = hash.digest('hex');
      
      return hashedCodes.includes(codeHash);
    } catch {
      return false;
    }
  }

  // Remove a used backup code from the stored hash
  static removeUsedBackupCode(code: string, hashedCodesJson: string): string | null {
    try {
      const hashedCodes: string[] = JSON.parse(hashedCodesJson);
      const hash = crypto.createHash('sha256');
      hash.update(code);
      const codeHash = hash.digest('hex');
      
      const codeIndex = hashedCodes.indexOf(codeHash);
      if (codeIndex > -1) {
        hashedCodes.splice(codeIndex, 1);
        return JSON.stringify(hashedCodes);
      }
      return null;
    } catch {
      return null;
    }
  }

  // Encrypt secret for database storage (simple base64 for demo - use proper encryption in production)
  static encryptSecret(secret: string): string {
    // In production, use proper encryption with env vars
    return Buffer.from(secret).toString('base64');
  }

  // Decrypt secret from database storage
  static decryptSecret(encryptedSecret: string): string {
    // In production, use proper decryption with env vars
    return Buffer.from(encryptedSecret, 'base64').toString('utf8');
  }
}