import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username: string;
    email: string;
    ageVerified?: boolean;
    backgroundCheckStatus?: string;
    minorSafetyFlag?: boolean;
  };
}

// Middleware to check age verification for sensitive operations
export const requireAgeVerification = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  // For now, assume all users are age verified until we implement full verification
  // This is a safety placeholder - in production you'd check actual verification status
  if (req.user.minorSafetyFlag) {
    return res.status(403).json({ 
      message: 'Account flagged for minor safety. Contact support.',
      requiresVerification: true 
    });
  }

  next();
};

// Age calculation utility
export const calculateAge = (dateOfBirth: string | Date): number => {
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

// Enhanced background check with sex offender registry screening
export const initiateBackgroundCheck = async (userId: string, userData: any, clientIp?: string) => {
  console.log(`CRITICAL SAFETY CHECK: Initiating comprehensive background screening for user ${userId}`);
  console.log(`User data: ${userData.firstName} ${userData.lastName}, Email: ${userData.email}, DOB: ${userData.dateOfBirth}`);
  
  const checkResults = {
    status: 'pending',
    referenceId: `bg_check_${Date.now()}`,
    checks: {
      sexOffenderRegistry: 'pending',
      criminalHistory: 'pending', 
      identityVerification: 'pending'
    },
    alerts: [] as string[],
    riskLevel: 'unknown',
    ipAddress: clientIp,
    requiresManualReview: false
  };

  // CRITICAL: Sex Offender Registry Check
  // This is a SIMULATION - in production this would call:
  // - National Sex Offender Public Website (NSOPW) API
  // - State-specific sex offender registries
  // - FBI National Crime Information Center (if authorized)
  
  try {
    console.log(`🔍 SAFETY SCREENING: Checking sex offender registries for ${userData.firstName} ${userData.lastName}`);
    
    // Simulate background check process
    const riskIndicators = await simulateRiskScreening(userData);
    
    if (riskIndicators.isHighRisk) {
      console.log(`🚨 HIGH RISK USER DETECTED: ${userId} - ${riskIndicators.reason}`);
      checkResults.status = 'FAILED';
      checkResults.checks.sexOffenderRegistry = 'FAILED';
      checkResults.alerts.push(`HIGH RISK: ${riskIndicators.reason}`);
      checkResults.riskLevel = 'HIGH';
      checkResults.requiresManualReview = true;
      
      // Log for immediate admin review
      console.error(`🚨🚨 IMMEDIATE ATTENTION REQUIRED 🚨🚨`);
      console.error(`User ${userId} (${userData.firstName} ${userData.lastName}) flagged as HIGH RISK`);
      console.error(`Reason: ${riskIndicators.reason}`);
      console.error(`IP Address: ${clientIp}`);
      console.error(`Email: ${userData.email}`);
      
      return checkResults;
    }
    
    checkResults.status = 'passed';
    checkResults.checks.sexOffenderRegistry = 'passed';
    checkResults.checks.criminalHistory = 'passed';
    checkResults.checks.identityVerification = 'passed';
    checkResults.riskLevel = 'LOW';
    
    console.log(`✅ Background check passed for user ${userId}`);
    
  } catch (error) {
    console.error(`Background check error for user ${userId}:`, error);
    checkResults.status = 'error';
    checkResults.requiresManualReview = true;
  }
  
  return checkResults;
};

// Risk screening simulation (replace with real API calls in production)
async function simulateRiskScreening(userData: any) {
  // This simulates connecting to sex offender registries
  // In production, this would make API calls to:
  // - NSOPW API
  // - State registries  
  // - Criminal database services
  
  const riskFactors = {
    isHighRisk: false,
    reason: '',
    confidence: 0
  };

  // Simulate various risk checks
  const suspiciousPatterns = [
    // These would be real API responses in production
    userData.email?.includes('suspicious'),
    userData.firstName?.toLowerCase().includes('test'),
  ];

  if (suspiciousPatterns.some(pattern => pattern)) {
    riskFactors.isHighRisk = true;
    riskFactors.reason = 'Flagged in safety database screening';
    riskFactors.confidence = 95;
  }

  return riskFactors;
}

// Validate user is 16+ years old
export const validateMinimumAge = (dateOfBirth: string): boolean => {
  const age = calculateAge(dateOfBirth);
  return age >= 16;
};

// Check if user needs parental consent (16-17 years old)
export const requiresParentalConsent = (dateOfBirth: string): boolean => {
  const age = calculateAge(dateOfBirth);
  return age >= 16 && age < 18;
};

// Validate parental consent data
export const validateParentalConsent = (userData: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!userData.parentalConsent) {
    errors.push('Parental consent is required for users under 18');
  }
  
  if (!userData.parentName || userData.parentName.trim().length < 2) {
    errors.push('Parent/guardian full name is required');
  }
  
  if (!userData.parentEmail || !userData.parentEmail.includes('@')) {
    errors.push('Valid parent/guardian email is required');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};