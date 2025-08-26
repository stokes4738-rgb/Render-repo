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

// Background check integration placeholder
export const initiateBackgroundCheck = async (userId: string, userData: any) => {
  // This would integrate with a real background check service
  // For now, return a placeholder response
  console.log(`Background check initiated for user ${userId}`);
  
  // In a real implementation, this would call:
  // - National Sex Offender Registry API
  // - State criminal background check services  
  // - Identity verification services
  
  return {
    status: 'pending',
    referenceId: `bg_check_${Date.now()}`,
    message: 'Background check initiated. Results typically available within 1-2 business days.'
  };
};

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