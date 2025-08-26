// Bundle optimization utilities

// Lazy load components to reduce initial bundle size
import { lazy } from 'react';

// Lazy load heavy components
export const LazyBoard = lazy(() => import('@/pages/Board'));
export const LazyProfile = lazy(() => import('@/pages/Profile'));
export const LazyMessages = lazy(() => import('@/pages/Messages'));
// export const LazyGame = lazy(() => import('@/pages/Game')); // Currently not available

// Code splitting for chart components
export const LazyChart = lazy(() => 
  import('recharts').then(module => ({ default: module.LineChart }))
);

// Dynamic imports for features that may not be immediately needed
export const loadStripe = () => import('@stripe/stripe-js');
// export const loadQRCode = () => import('qrcode'); // Optional dependency

// Preload critical resources
export function preloadCriticalResources() {
  // Preload fonts
  const fontLink = document.createElement('link');
  fontLink.rel = 'preload';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap';
  fontLink.as = 'style';
  document.head.appendChild(fontLink);

  // Preload critical images
  const criticalImages = ['/icon-192.png', '/icon-512.png'];
  criticalImages.forEach(src => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = src;
    link.as = 'image';
    document.head.appendChild(link);
  });
}

// Remove unused imports and dead code
export function cleanupConsole() {
  if (process.env.NODE_ENV === 'production') {
    // Remove console.log, console.debug in production
    const originalConsole = window.console;
    window.console = {
      ...originalConsole,
      log: () => {},
      debug: () => {},
      info: () => {},
    };
  }
}

// Tree shaking helpers - only import what you need
export const optimizedIcons = {
  // Instead of importing all of lucide-react, we use regular imports
  // as the build tool will handle tree shaking automatically
};

// Efficient date formatting without moment.js
export function formatDateOptimized(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}

// Efficient number formatting
export function formatCurrencyOptimized(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

// Memory cleanup
export function cleanupMemory() {
  // Clear any intervals or timeouts
  if (typeof window !== 'undefined') {
    // Force garbage collection if available (dev tools)
    if ('gc' in window) {
      (window as any).gc();
    }
  }
}

// Efficient state updates
export function batchStateUpdates<T>(
  updates: Array<{ setState: (value: T) => void; value: T }>
) {
  // Use React's automatic batching (React 18+)
  updates.forEach(({ setState, value }) => setState(value));
}