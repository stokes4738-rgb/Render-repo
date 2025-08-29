import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import Bank from "./Bank";
import Board from "./Board";
import Post from "./Post";
import Messages from "./Messages";
import Profile from "./Profile";
import Friends from "./Friends";
import Activity from "./Activity";
import Settings from "./Settings";
import Account from "./Account";
import CreatorDashboard from "./CreatorDashboard";
import CreatorInbox from "./CreatorInbox";
import Referrals from "./Referrals";
import PointsStore from "./PointsStore";
import Games from "./Games";
import { CreatorAuthModal } from "@/components/CreatorAuthModal";

export default function Home() {
  const [activeSection, setActiveSection] = useState("board");
  const [showCreatorAuth, setShowCreatorAuth] = useState(false);
  const [pendingCreatorSection, setPendingCreatorSection] = useState<string | null>(null);

  useEffect(() => {
    const handleNavigateToMessages = (event: any) => {
      setActiveSection("messages");
      // Could also pass userId to Messages component if needed
    };

    window.addEventListener('navigate-to-messages', handleNavigateToMessages);
    return () => {
      window.removeEventListener('navigate-to-messages', handleNavigateToMessages);
    };
  }, []);

  const checkCreatorAuth = () => {
    const authTime = sessionStorage.getItem("creatorAuthTime");
    const isAuthenticated = sessionStorage.getItem("creatorAuthenticated");
    
    // Check if authenticated and within 30 minute session
    if (isAuthenticated === "true" && authTime) {
      const timeDiff = Date.now() - parseInt(authTime);
      if (timeDiff < 30 * 60 * 1000) { // 30 minutes
        return true;
      } else {
        // Session expired
        sessionStorage.removeItem("creatorAuthenticated");
        sessionStorage.removeItem("creatorAuthTime");
      }
    }
    return false;
  };

  const handleSectionChange = (section: string) => {
    // Check if trying to access creator sections
    if (section === "admin" || section === "inbox") {
      if (!checkCreatorAuth()) {
        // Need creator authentication
        setPendingCreatorSection(section);
        setShowCreatorAuth(true);
        return;
      }
    }
    setActiveSection(section);
  };

  const handleCreatorAuthSuccess = () => {
    setShowCreatorAuth(false);
    if (pendingCreatorSection) {
      setActiveSection(pendingCreatorSection);
      setPendingCreatorSection(null);
    }
  };

  const renderSection = () => {
    switch (activeSection) {
      case "bank": // Legacy support - redirect to account
      case "account":
        return <Account />;
      case "board":
        return <Board />;
      case "post":
        return <Post />;
      case "messages":
        return <Messages />;
      case "arcade":
        return <Games />;
      case "profile":
        return <Profile />;
      case "friends":
        return <Friends />;
      case "activity":
        return <Activity />;
      case "settings":
        return <Settings />;
      case "referrals":
        return <Referrals />;
      case "points":
        return <PointsStore />;
      case "admin":
        return <CreatorDashboard />;
      case "inbox":
        return <CreatorInbox />;
      default:
        return <Board />;
    }
  };

  return (
    <>
      <Layout 
        activeSection={activeSection} 
        onSectionChange={handleSectionChange}
      >
        {renderSection()}
      </Layout>
      
      <CreatorAuthModal
        isOpen={showCreatorAuth}
        onClose={() => {
          setShowCreatorAuth(false);
          setPendingCreatorSection(null);
        }}
        onSuccess={handleCreatorAuthSuccess}
      />
    </>
  );
}
