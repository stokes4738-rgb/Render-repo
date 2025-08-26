import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

// In-memory IP ban list (in production, this would be in Redis or database)
const bannedIPs = new Set<string>();
const suspiciousIPs = new Map<string, { attempts: number; lastAttempt: Date; reason: string }>();

interface BanRecord {
  ip: string;
  reason: string;
  timestamp: Date;
  userId?: string;
  permanent: boolean;
}

// Get client IP address with proxy support
export function getClientIp(req: Request): string {
  const xForwardedFor = req.headers['x-forwarded-for'] as string;
  const xRealIp = req.headers['x-real-ip'] as string;
  const connectionRemoteAddress = req.connection?.remoteAddress;
  const socketRemoteAddress = req.socket?.remoteAddress;
  const connectionSocketRemoteAddress = req.connection?.socket?.remoteAddress;

  const ip = xForwardedFor?.split(',')[0] || 
             xRealIp || 
             connectionRemoteAddress || 
             socketRemoteAddress || 
             connectionSocketRemoteAddress || 
             '0.0.0.0';

  // Clean IPv6 mapped IPv4 addresses
  return ip.replace(/^::ffff:/, '');
}

// Check if IP is banned
export function isIPBanned(ip: string): boolean {
  return bannedIPs.has(ip);
}

// Ban IP address permanently
export function banIP(ip: string, reason: string, userId?: string): BanRecord {
  bannedIPs.add(ip);
  
  const banRecord: BanRecord = {
    ip,
    reason,
    timestamp: new Date(),
    userId,
    permanent: true
  };

  console.log(`🚫 IP BANNED: ${ip} - Reason: ${reason}${userId ? ` (User ID: ${userId})` : ''}`);
  
  // In production, this would be stored in database
  // await db.insert(bannedIPs).values(banRecord);
  
  return banRecord;
}

// Middleware to check for banned IPs
export function checkIPBan(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  
  if (isIPBanned(clientIp)) {
    console.log(`🚫 Blocked request from banned IP: ${clientIp}`);
    return res.status(403).json({ 
      message: 'Access denied. Your IP address has been banned from this platform.',
      code: 'IP_BANNED'
    });
  }
  
  next();
}

// Flag IP as suspicious
export function flagSuspiciousIP(ip: string, reason: string): void {
  const existing = suspiciousIPs.get(ip);
  
  if (existing) {
    existing.attempts += 1;
    existing.lastAttempt = new Date();
    existing.reason = reason;
  } else {
    suspiciousIPs.set(ip, {
      attempts: 1,
      lastAttempt: new Date(),
      reason
    });
  }
  
  console.log(`⚠️ Suspicious IP flagged: ${ip} - ${reason} (${existing?.attempts || 1} incidents)`);
  
  // Auto-ban after multiple incidents
  if ((existing?.attempts || 1) >= 3) {
    banIP(ip, `Multiple suspicious activities: ${reason}`);
  }
}

// Emergency ban for high-risk users
export async function emergencyIPBan(userId: string, ip: string, reason: string): Promise<void> {
  console.log(`🚨 EMERGENCY IP BAN INITIATED 🚨`);
  console.log(`User: ${userId}, IP: ${ip}, Reason: ${reason}`);
  
  // Immediate IP ban
  banIP(ip, `EMERGENCY BAN - ${reason}`, userId);
  
  // Flag user for safety review
  try {
    await storage.flagUserForSafety(userId, `Emergency IP ban: ${reason}`);
  } catch (error) {
    console.error(`Failed to flag user ${userId} for safety:`, error);
  }
  
  // In production, this would also:
  // - Notify security team immediately
  // - Create incident report
  // - Trigger additional monitoring
  
  console.log(`🚫 User ${userId} and IP ${ip} permanently banned from platform`);
}

// Get banned IP list (for admin purposes)
export function getBannedIPs(): string[] {
  return Array.from(bannedIPs);
}

// Get suspicious IP list (for monitoring)
export function getSuspiciousIPs(): Array<{ ip: string; data: any }> {
  return Array.from(suspiciousIPs.entries()).map(([ip, data]) => ({ ip, data }));
}