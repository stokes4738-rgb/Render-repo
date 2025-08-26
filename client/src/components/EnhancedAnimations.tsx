import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

// Page transition wrapper
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="min-h-full"
    >
      {children}
    </motion.div>
  );
}

// Stagger container for lists
export function StaggerContainer({ 
  children, 
  staggerDelay = 0.1 
}: { 
  children: ReactNode; 
  staggerDelay?: number; 
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay
          }
        }
      }}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

// Individual stagger item
export function StaggerItem({ 
  children, 
  className = "" 
}: { 
  children: ReactNode; 
  className?: string; 
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Floating action button with magnetic effect
export function FloatingButton({ 
  children, 
  onClick, 
  className = "" 
}: { 
  children: ReactNode; 
  onClick: () => void; 
  className?: string; 
}) {
  return (
    <motion.button
      className={`fixed bottom-20 right-4 w-14 h-14 bg-pocket-red hover:bg-pocket-red-dark text-white rounded-full shadow-lg flex items-center justify-center z-50 ${className}`}
      onClick={onClick}
      whileHover={{ 
        scale: 1.1,
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
      }}
      whileTap={{ scale: 0.95 }}
      animate={{ 
        y: [0, -5, 0],
        rotateZ: [0, 5, -5, 0]
      }}
      transition={{ 
        y: { duration: 2, repeat: Infinity, ease: "easeInOut" },
        rotateZ: { duration: 4, repeat: Infinity, ease: "easeInOut" }
      }}
    >
      {children}
    </motion.button>
  );
}

// Success/Error toast animations
export function AnimatedToast({ 
  type, 
  children 
}: { 
  type: 'success' | 'error' | 'info'; 
  children: ReactNode; 
}) {
  const variants = {
    success: { backgroundColor: "#10B981", borderColor: "#059669" },
    error: { backgroundColor: "#EF4444", borderColor: "#DC2626" },
    info: { backgroundColor: "#3B82F6", borderColor: "#2563EB" }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      style={variants[type]}
      className="border-l-4 p-4 rounded text-white shadow-lg"
    >
      {children}
    </motion.div>
  );
}

// Pulse animation for notifications
export function PulseNotification({ 
  children, 
  show = false 
}: { 
  children: ReactNode; 
  show?: boolean; 
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: 1
          }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ 
            scale: { duration: 0.5, repeat: 3 },
            opacity: { duration: 0.3 }
          }}
          className="absolute -top-2 -right-2 bg-pocket-red text-white text-xs rounded-full w-6 h-6 flex items-center justify-center"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}