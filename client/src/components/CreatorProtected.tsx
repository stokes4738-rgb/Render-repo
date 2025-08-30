import { useState, useEffect } from "react";
import CreatorLogin from "@/pages/CreatorLogin";

export default function CreatorProtected({ children }: { children: React.ReactNode }) {
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    // Always require fresh verification - don't trust session storage
    // This ensures only Dallas1221 can access even if someone else was logged in
    sessionStorage.removeItem("creator_verified");
    setIsVerified(false);
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