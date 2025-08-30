import { useState, useEffect } from "react";
import CreatorLogin from "@/pages/CreatorLogin";

export default function CreatorProtected({ children }: { children: React.ReactNode }) {
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    // Check if creator was already verified this session
    const verified = sessionStorage.getItem("creator_verified");
    if (verified === "true") {
      setIsVerified(true);
    }
  }, []);

  const handleVerificationSuccess = () => {
    setIsVerified(true);
  };

  // Show login screen if not verified
  if (!isVerified) {
    return <CreatorLogin onSuccess={handleVerificationSuccess} />;
  }

  return <>{children}</>;
}