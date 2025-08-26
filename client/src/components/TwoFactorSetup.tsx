import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, ShieldCheck, Copy, Eye, EyeOff, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TwoFactorStatus {
  enabled: boolean;
  hasBackupCodes: boolean;
}

interface SetupData {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export default function TwoFactorSetup() {
  const [verificationCode, setVerificationCode] = useState("");
  const [currentSecret, setCurrentSecret] = useState("");
  const [currentBackupCodes, setCurrentBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [step, setStep] = useState<'status' | 'setup' | 'verify'>('status');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery<TwoFactorStatus>({
    queryKey: ["/api/2fa/status"],
  });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/2fa/setup");
      return await res.json();
    },
    onSuccess: (data: SetupData) => {
      setCurrentSecret(data.secret);
      setCurrentBackupCodes(data.backupCodes);
      setStep('verify');
      toast({
        title: "2FA Setup Started",
        description: "Scan the QR code with your authenticator app, then enter the 6-digit code.",
      });
    },
    onError: () => {
      toast({
        title: "Setup Failed",
        description: "Failed to setup 2FA. Please try again.",
        variant: "destructive",
      });
    },
  });

  const enableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/2fa/enable", {
        secret: currentSecret,
        code: verificationCode,
        backupCodes: currentBackupCodes,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/2fa/status"] });
      setStep('status');
      setVerificationCode("");
      setShowBackupCodes(false);
      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication has been successfully enabled for your account.",
      });
    },
    onError: () => {
      toast({
        title: "Verification Failed",
        description: "Invalid verification code. Please check your authenticator app and try again.",
        variant: "destructive",
      });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (data: { twoFactorCode?: string; backupCode?: string }) => {
      const res = await apiRequest("POST", "/api/2fa/disable", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/2fa/status"] });
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled for your account.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to Disable",
        description: "Could not disable 2FA. Please verify your code and try again.",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
    });
  };

  const downloadBackupCodes = () => {
    const content = `Pocket Bounty - Backup Codes\n\nThese are your backup codes for two-factor authentication.\nEach code can only be used once.\n\n${currentBackupCodes.join('\n')}\n\nGenerated: ${new Date().toLocaleString()}\n\nKeep these codes in a safe place!`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pocket-bounty-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (statusLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Two-Factor Authentication
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 'status' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Security Status</h3>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security to protect your wallet and sensitive operations.
                </p>
              </div>
              <Badge variant={status?.enabled ? "default" : "secondary"} className="flex items-center gap-1">
                {status?.enabled ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                {status?.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                When enabled, you'll need to enter a code from your authenticator app for wallet operations like deposits and withdrawals.
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              {!status?.enabled ? (
                <Button 
                  onClick={() => setupMutation.mutate()}
                  disabled={setupMutation.isPending}
                >
                  {setupMutation.isPending ? "Setting up..." : "Enable 2FA"}
                </Button>
              ) : (
                <Button 
                  variant="destructive"
                  onClick={() => {
                    const code = prompt("Enter your 6-digit authenticator code to disable 2FA:");
                    if (code) {
                      disableMutation.mutate({ twoFactorCode: code });
                    }
                  }}
                  disabled={disableMutation.isPending}
                >
                  {disableMutation.isPending ? "Disabling..." : "Disable 2FA"}
                </Button>
              )}
            </div>
          </>
        )}

        {step === 'verify' && setupMutation.data && (
          <>
            <div className="text-center space-y-4">
              <h3 className="font-medium">Scan QR Code</h3>
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </p>
              
              <div className="flex justify-center">
                <img 
                  src={setupMutation.data.qrCodeUrl} 
                  alt="2FA QR Code"
                  className="border rounded-lg"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="verification-code">Enter 6-digit code from your app:</Label>
                <Input
                  id="verification-code"
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  data-testid="input-2fa-code"
                />
              </div>
              
              <div className="flex gap-3">
                <Button 
                  onClick={() => enableMutation.mutate()}
                  disabled={enableMutation.isPending || verificationCode.length !== 6}
                  data-testid="button-verify-2fa"
                >
                  {enableMutation.isPending ? "Verifying..." : "Verify & Enable"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setStep('status')}
                >
                  Cancel
                </Button>
              </div>
            </div>

            {/* Backup Codes Section */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Backup Codes</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBackupCodes(!showBackupCodes)}
                >
                  {showBackupCodes ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showBackupCodes ? "Hide" : "Show"}
                </Button>
              </div>
              
              {showBackupCodes && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Save these backup codes in a safe place. Each can only be used once if you lose access to your authenticator.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                    {currentBackupCodes.map((code, index) => (
                      <div 
                        key={index}
                        className="flex items-center justify-between p-2 border rounded cursor-pointer hover:bg-muted"
                        onClick={() => copyToClipboard(code)}
                      >
                        {code}
                        <Copy className="h-3 w-3 opacity-50" />
                      </div>
                    ))}
                  </div>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={downloadBackupCodes}
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Backup Codes
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}