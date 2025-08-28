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

export default function Home() {
  const [activeSection, setActiveSection] = useState("board");

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
    <Layout 
      activeSection={activeSection} 
      onSectionChange={setActiveSection}
    >
      {renderSection()}
    </Layout>
  );
}
