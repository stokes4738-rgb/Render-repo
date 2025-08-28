import { Request, Response, NextFunction } from "express";

export function timeoutMiddleware(seconds: number = 30) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set timeout for the response
    res.setTimeout(seconds * 1000, () => {
      if (!res.headersSent) {
        res.status(408).json({ 
          error: 'Request timeout',
          message: `Request took longer than ${seconds} seconds to complete`
        });
      }
    });
    
    next();
  };
}