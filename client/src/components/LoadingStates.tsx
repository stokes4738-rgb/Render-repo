import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";

// Enhanced loading skeleton with animations
export function LoadingSkeleton({ 
  lines = 3, 
  className = "",
  animated = true 
}: { 
  lines?: number; 
  className?: string;
  animated?: boolean;
}) {
  const skeletonLines = Array.from({ length: lines }, (_, i) => (
    <motion.div
      key={i}
      className={`h-4 bg-muted rounded ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
      initial={{ opacity: 0.3 }}
      animate={animated ? { opacity: [0.3, 0.8, 0.3] } : {}}
      transition={{ 
        duration: 1.5, 
        repeat: Infinity, 
        delay: i * 0.1 
      }}
    />
  ));

  return (
    <div className={`space-y-3 ${className}`}>
      {skeletonLines}
    </div>
  );
}

// Premium loading spinner with particles
export function PremiumLoader({ message = "Loading..." }: { message?: string }) {
  return (
    <motion.div 
      className="flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <div className="relative">
        <motion.div
          className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-2 w-12 h-12 border-4 border-pocket-red/20 border-b-pocket-red rounded-full"
          animate={{ rotate: -360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Sparkles className="w-6 h-6 text-pocket-gold" />
        </motion.div>
      </div>
      <motion.p 
        className="text-sm text-muted-foreground mt-4"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        {message}
      </motion.p>
    </motion.div>
  );
}

// Card loading state with shimmer effect
export function CardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <motion.div
          key={i}
          className="bg-card border border-border rounded-xl p-4 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
        >
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent shimmer" />
          <div className="flex gap-3">
            <div className="w-12 h-12 bg-muted rounded-full animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
              <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}