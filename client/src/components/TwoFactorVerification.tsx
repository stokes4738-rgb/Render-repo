import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2 } from "lucide-react";

interface TwoFactorVerificationProps {
  onVerify: (code: string) => Promise<void>;
  onCancel: () => void;
  isVerifying?: boolean;
  title?: string;
  description?: string;
}

export default function TwoFactorVerification({
  onVerify,
  onCancel,
  isVerifying = false,
  title = "Two-Factor Authentication Required",
  description = "Enter the 6-digit code from your authenticator app to continue."
}: TwoFactorVerificationProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (code.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }
    
    try {
      setError("");
      await onVerify(code);
    } catch (err: any) {
      setError(err.message || "Invalid verification code");
    }
  };

  const handleCodeChange = (value: string) => {
    // Only allow numbers and limit to 6 digits
    const numericValue = value.replace(/\D/g, "").slice(0, 6);
    setCode(numericValue);
    if (error) setError("");
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
          <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          {description}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="twofa-code">Verification Code</Label>
            <Input
              id="twofa-code"
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              className="text-center text-lg tracking-widest font-mono"
              maxLength={6}
              disabled={isVerifying}
              data-testid="input-2fa-code"
            />
            {error && (
              <p className="text-sm text-red-500 mt-1" data-testid="error-2fa">
                {error}
              </p>
            )}
          </div>
          
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isVerifying}
              className="flex-1"
              data-testid="button-cancel-2fa"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={code.length !== 6 || isVerifying}
              className="flex-1"
              data-testid="button-verify-2fa"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify"
              )}
            </Button>
          </div>
        </form>
        
        <div className="mt-4 pt-4 border-t text-center">
          <p className="text-xs text-muted-foreground">
            Can't access your authenticator? Use a backup code instead.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}