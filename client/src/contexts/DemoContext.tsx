import { createContext, useContext, useState, ReactNode } from 'react';

interface DemoContextType {
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  demoUser: any;
  demoBounties: any[];
  demoMessages: any[];
  demoTransactions: any[];
  demoPaymentMethods: any[];
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

// Sample demo data
const demoUser = {
  id: "demo-user-123",
  email: "demo@pocketbounty.com",
  firstName: "Alex",
  lastName: "Demo",
  handle: "@alexdemo",
  bio: "Freelance designer and developer with 5+ years experience. Love creating beautiful, functional solutions for businesses of all sizes.",
  skills: "UI/UX Design, React, JavaScript, Figma, Photography, Content Writing",
  experience: "Expert level (5+ years)",
  profileImageUrl: null,
  balance: "847.50",
  lifetimeEarned: "2,340.75",
  points: 1250,
  level: 8,
  rating: "4.9",
  reviewCount: 47,
  createdAt: "2024-01-15T10:30:00Z",
  updatedAt: "2024-12-20T15:45:00Z"
};

const demoBounties = [
  {
    id: "bounty-001",
    title: "Design Modern Logo for Tech Startup",
    description: "Looking for a clean, modern logo for our AI-powered productivity app 'FlowState'. Should convey innovation, efficiency, and trust. We prefer minimalist designs with bold typography. Please provide 3 concepts in vector format (AI/SVG). Company colors: #2563EB (blue) and #7C3AED (purple), but open to other suggestions.",
    category: "Design",
    reward: "125.00",
    status: "open",
    authorId: "user-456",
    authorName: "Sarah Chen",
    authorRating: "4.8",
    tags: ["logo", "branding", "vector", "minimalist"],
    createdAt: "2024-12-19T09:15:00Z",
    expiresAt: "2024-12-26T09:15:00Z",
    applicants: 12,
    timeLeft: "6 days"
  },
  {
    id: "bounty-002", 
    title: "Write Product Descriptions (10 Items)",
    description: "Need compelling product descriptions for our handmade jewelry collection. Each description should be 100-150 words, SEO-optimized, and highlight the craftsmanship and materials. Target audience is women 25-45 interested in unique, sustainable jewelry. Include key selling points and emotional connection.",
    category: "Writing",
    reward: "75.00",
    status: "in_progress",
    authorId: "user-789",
    authorName: "Maria Rodriguez",
    authorRating: "4.9",
    tags: ["copywriting", "SEO", "ecommerce", "jewelry"],
    createdAt: "2024-12-18T14:30:00Z",
    expiresAt: "2024-12-23T14:30:00Z",
    applicants: 8,
    timeLeft: "4 days",
    claimedBy: "demo-user-123",
    claimedAt: "2024-12-19T10:00:00Z"
  },
  {
    id: "bounty-003",
    title: "Social Media Content Calendar (1 Month)",
    description: "Create a comprehensive social media content calendar for Instagram and TikTok for a sustainable fashion brand. Include post types, captions, hashtag suggestions, and optimal posting times. Focus on Gen Z audience with themes around sustainability, style, and self-expression. 30 posts total (15 per platform).",
    category: "Marketing", 
    reward: "200.00",
    status: "completed",
    authorId: "user-321",
    authorName: "Jake Wilson",
    authorRating: "4.7",
    tags: ["social media", "content strategy", "sustainability", "fashion"],
    createdAt: "2024-12-10T11:00:00Z",
    expiresAt: "2024-12-17T11:00:00Z",
    completedAt: "2024-12-16T16:30:00Z",
    applicants: 15,
    claimedBy: "demo-user-123",
    rating: 5,
    review: "Outstanding work! Alex delivered exactly what we needed with creative ideas and perfect timing."
  },
  {
    id: "bounty-004",
    title: "Python Script for Data Analysis",
    description: "Need a Python script to analyze customer purchase data from CSV files. Script should generate insights like top products, seasonal trends, customer segments, and create visualizations (charts/graphs). Include proper documentation and requirements.txt. Data involves ~50k records with purchase history, demographics, and product categories.",
    category: "Programming",
    reward: "180.00",
    status: "open",
    authorId: "user-654",
    authorName: "David Kim",
    authorRating: "4.9",
    tags: ["python", "data analysis", "pandas", "matplotlib", "visualization"],
    createdAt: "2024-12-20T08:45:00Z",
    expiresAt: "2024-12-27T08:45:00Z",
    applicants: 6,
    timeLeft: "7 days"
  },
  {
    id: "bounty-005",
    title: "Photography: Product Shots (20 Items)",
    description: "Professional product photography for our artisanal candle collection. Need high-quality images for e-commerce: white background shots, lifestyle shots with props, and detail shots of textures. Include basic editing (color correction, background removal). All items are candles in jars with different scents and colors.",
    category: "Photography",
    reward: "160.00",
    status: "open", 
    authorId: "user-987",
    authorName: "Emma Thompson",
    authorRating: "4.6",
    tags: ["product photography", "e-commerce", "lighting", "editing"],
    createdAt: "2024-12-19T16:20:00Z",
    expiresAt: "2024-12-24T16:20:00Z",
    applicants: 4,
    timeLeft: "4 days"
  }
];

const demoMessages = [
  {
    id: "msg-001",
    threadId: "thread-bounty-002",
    senderId: "user-789",
    senderName: "Maria Rodriguez",
    content: "Hi Alex! I reviewed your portfolio and I'm impressed with your writing samples. The jewelry descriptions project is yours if you're interested. When can you start?",
    timestamp: "2024-12-19T09:30:00Z",
    type: "text"
  },
  {
    id: "msg-002", 
    threadId: "thread-bounty-002",
    senderId: "demo-user-123",
    senderName: "Alex Demo",
    content: "Thank you so much! I'm very excited to work on this project. I can start immediately and have the first 3 descriptions ready by tomorrow. Could you share the product details and any brand guidelines?",
    timestamp: "2024-12-19T09:45:00Z",
    type: "text"
  },
  {
    id: "msg-003",
    threadId: "thread-bounty-002", 
    senderId: "user-789",
    senderName: "Maria Rodriguez",
    content: "Perfect! I'll send you our brand guide and product photos. Looking forward to seeing your creative touch on these descriptions.",
    timestamp: "2024-12-19T10:15:00Z",
    type: "text"
  },
  {
    id: "msg-004",
    threadId: "thread-general-001",
    senderId: "user-456",
    senderName: "Sarah Chen",
    content: "Hey Alex! Saw your logo design work - absolutely stunning! Would love to discuss a potential collaboration for our upcoming rebrand project. Are you available for a quick call this week?",
    timestamp: "2024-12-20T14:20:00Z",
    type: "text"
  }
];

const demoTransactions = [
  {
    id: "txn-001",
    type: "earning",
    amount: "190.00",
    description: "Completed bounty: Social Media Content Calendar (after $10.00 platform fee)",
    status: "completed",
    createdAt: "2024-12-16T16:35:00Z",
    bountyTitle: "Social Media Content Calendar (1 Month)"
  },
  {
    id: "txn-002",
    type: "earning", 
    amount: "142.50",
    description: "Completed bounty: Website Copywriting (after $7.50 platform fee)",
    status: "completed",
    createdAt: "2024-12-14T11:20:00Z",
    bountyTitle: "Website Copywriting"
  },
  {
    id: "txn-003",
    type: "withdrawal",
    amount: "300.00",
    description: "Withdrawal to Bank Account ****1234",
    status: "completed",
    createdAt: "2024-12-13T09:45:00Z"
  },
  {
    id: "txn-004",
    type: "deposit",
    amount: "50.00", 
    description: "Added funds via Credit Card ****5678",
    status: "completed",
    createdAt: "2024-12-10T15:30:00Z"
  },
  {
    id: "txn-005",
    type: "earning",
    amount: "66.50",
    description: "Completed bounty: Logo Design (after $3.50 platform fee)",
    status: "completed", 
    createdAt: "2024-12-08T13:15:00Z",
    bountyTitle: "Logo Design"
  }
];

const demoPaymentMethods = [
  {
    id: "pm-001",
    stripePaymentMethodId: "pm_demo123",
    brand: "visa",
    last4: "4242",
    expiryMonth: 12,
    expiryYear: 2027,
    isDefault: true
  },
  {
    id: "pm-002", 
    stripePaymentMethodId: "pm_demo456",
    brand: "mastercard",
    last4: "5555",
    expiryMonth: 8,
    expiryYear: 2026,
    isDefault: false
  }
];

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(() => {
    // Check localStorage on initialization
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pocketbounty_demo_mode') === 'true';
    }
    return false;
  });

  const setDemoMode = (enabled: boolean) => {
    setIsDemoMode(enabled);
    if (enabled) {
      // Add demo mode indicator to localStorage
      localStorage.setItem('pocketbounty_demo_mode', 'true');
    } else {
      localStorage.removeItem('pocketbounty_demo_mode');
      // Force a refresh of user data when exiting demo mode
      window.location.reload();
    }
  };

  const value: DemoContextType = {
    isDemoMode,
    setDemoMode,
    demoUser,
    demoBounties,
    demoMessages,
    demoTransactions,
    demoPaymentMethods
  };

  return (
    <DemoContext.Provider value={value}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (context === undefined) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return context;
}