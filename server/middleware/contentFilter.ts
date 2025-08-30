import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// List of inappropriate words and patterns that should be blocked
// RELAXED FILTER - Only blocking explicit sexual content and extreme cases
const inappropriateWords = [
  // Adult content terms (very explicit only)
  'porn', 'xxx', 'nsfw', 'nude pics', 'sex videos',
  // Extreme illegal activities only
  'cocaine', 'heroin', 'meth',
  // Clear scam indicators
  'nigerian prince', 'lottery winner', 'bitcoin doubler'
];

// Check if content contains inappropriate material
export function containsInappropriateContent(text: string): boolean {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  
  // Check for inappropriate words
  for (const word of inappropriateWords) {
    if (lowerText.includes(word)) {
      logger.warn(`Inappropriate content detected: contains "${word}"`);
      return true;
    }
  }
  
  // Check for excessive capital letters (spam indicator) - RELAXED
  const capitalRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (text.length > 50 && capitalRatio > 0.9) {
    logger.warn('Inappropriate content detected: excessive capitals');
    return true;
  }
  
  // Check for repeated characters (spam indicator) - VERY RELAXED
  // Only block if someone types like 20+ of the same letter/number
  if (/([a-zA-Z0-9])\1{19,}/.test(text)) {
    logger.warn('Inappropriate content detected: excessive repeated characters');
    return true;
  }
  
  // URL checking disabled - too restrictive for legitimate use
  // Users should be able to share links freely
  
  return false;
}

// Middleware to filter content in requests
export function contentFilterMiddleware(req: Request, res: Response, next: NextFunction) {
  // Check various request fields for inappropriate content
  const fieldsToCheck = [
    req.body?.title,
    req.body?.description,
    req.body?.message,
    req.body?.text,
    req.body?.content,
    req.body?.name,
    req.body?.bio
  ];
  
  for (const field of fieldsToCheck) {
    if (field && containsInappropriateContent(field)) {
      logger.warn(`Content filter blocked request from user ${(req as any).user?.id || 'unknown'}`);
      return res.status(400).json({ 
        message: 'Your content contains inappropriate material. Please review our community guidelines.' 
      });
    }
  }
  
  next();
}

// Clean text for display (removes inappropriate content)
export function sanitizeText(text: string): string {
  if (!text) return '';
  
  let cleaned = text;
  
  // Replace inappropriate words with asterisks
  for (const word of inappropriateWords) {
    const regex = new RegExp(word, 'gi');
    cleaned = cleaned.replace(regex, '*'.repeat(word.length));
  }
  
  return cleaned;
}