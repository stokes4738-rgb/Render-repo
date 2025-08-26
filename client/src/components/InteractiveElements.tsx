import { motion } from "framer-motion";
import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Interactive card with hover effects
export function InteractiveCard({ 
  children, 
  onClick, 
  className = "",
  glowOnHover = false 
}: { 
  children: ReactNode; 
  onClick?: () => void; 
  className?: string;
  glowOnHover?: boolean;
}) {
  return (
    <motion.div
      className={`cursor-pointer ${className}`}
      onClick={onClick}
      whileHover={{ 
        scale: 1.02,
        y: -5,
        boxShadow: glowOnHover 
          ? "0 20px 25px -5px rgba(220, 38, 38, 0.1), 0 10px 10px -5px rgba(220, 38, 38, 0.04)"
          : "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
      }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      <Card className="h-full">
        {children}
      </Card>
    </motion.div>
  );
}

// Morphing button with state changes
export function MorphingButton({ 
  children, 
  onClick, 
  loading = false,
  success = false,
  className = "" 
}: { 
  children: ReactNode; 
  onClick: () => void; 
  loading?: boolean;
  success?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      animate={{
        backgroundColor: success ? "#10B981" : loading ? "#6B7280" : "#DC2626",
        scale: success ? [1, 1.1, 1] : 1
      }}
      transition={{ duration: 0.3 }}
    >
      <Button
        onClick={onClick}
        disabled={loading}
        className={`relative overflow-hidden ${className}`}
      >
        <motion.div
          animate={{ opacity: loading ? 0 : 1 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            transition={{ 
              opacity: { duration: 0.2 },
              rotate: { duration: 1, repeat: Infinity, ease: "linear" }
            }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            ✓
          </motion.div>
        )}
      </Button>
    </motion.div>
  );
}

// Gradient background animation
export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute inset-0 opacity-30"
        animate={{
          background: [
            "radial-gradient(circle at 20% 50%, rgba(220, 38, 38, 0.1) 0%, transparent 50%)",
            "radial-gradient(circle at 80% 20%, rgba(220, 38, 38, 0.1) 0%, transparent 50%)",
            "radial-gradient(circle at 40% 80%, rgba(220, 38, 38, 0.1) 0%, transparent 50%)",
            "radial-gradient(circle at 20% 50%, rgba(220, 38, 38, 0.1) 0%, transparent 50%)"
          ]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

// Particle system for celebrations
export function ParticleSystem({ 
  show = false, 
  particleCount = 20 
}: { 
  show?: boolean; 
  particleCount?: number; 
}) {
  const particles = Array.from({ length: particleCount }, (_, i) => (
    <motion.div
      key={i}
      className="absolute w-2 h-2 bg-pocket-gold rounded-full"
      initial={{ 
        opacity: 0,
        scale: 0,
        x: Math.random() * 400 - 200,
        y: Math.random() * 400 - 200
      }}
      animate={show ? {
        opacity: [0, 1, 0],
        scale: [0, 1, 0],
        y: [0, -100],
        rotate: 360
      } : {}}
      transition={{
        duration: 2,
        delay: Math.random() * 0.5,
        ease: "easeOut"
      }}
      style={{
        left: `${50 + (Math.random() - 0.5) * 20}%`,
        top: `${50 + (Math.random() - 0.5) * 20}%`
      }}
    />
  ));

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {particles}
    </div>
  );
}