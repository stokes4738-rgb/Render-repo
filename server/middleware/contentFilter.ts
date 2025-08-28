import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// List of inappropriate words and patterns that should be blocked
const inappropriateWords = [
  // Adult content terms
  'porn', 'xxx', 'nsfw', 'nude', 'sex',
  // Violence and illegal activities
  'kill', 'murder', 'drug', 'cocaine', 'heroin', 'meth',
  // Hate speech and discrimination
  'hate', 'racist',
  // Gambling
  'casino', 'gambling', 'bet365',
  // Scam indicators
  'nigerian prince', 'lottery winner', 'bitcoin doubler',
  // Other inappropriate content
  'escort', 'onlyfans'
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
  
  // Check for excessive capital letters (spam indicator)
  const capitalRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (text.length > 20 && capitalRatio > 0.7) {
    logger.warn('Inappropriate content detected: excessive capitals');
    return true;
  }
  
  // Check for repeated characters (spam indicator)
  if (/(.)\1{4,}/.test(text)) {
    logger.warn('Inappropriate content detected: repeated characters');
    return true;
  }
  
  // Check for suspicious URLs
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlPattern);
  if (urls) {
    for (const url of urls) {
      if (url.includes('bit.ly') || url.includes('tinyurl') || url.includes('t.co')) {
        logger.warn('Inappropriate content detected: suspicious shortened URL');
        return true;
      }
    }
  }
  
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