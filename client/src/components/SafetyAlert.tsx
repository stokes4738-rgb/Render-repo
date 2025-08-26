import { AlertTriangle, Shield, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

interface SafetyAlertProps {
  level: 'warning' | 'info' | 'success' | 'critical';
  title: string;
  message: string;
  actionRequired?: boolean;
}

export function SafetyAlert({ level, title, message, actionRequired }: SafetyAlertProps) {
  const getIcon = () => {
    switch (level) {
      case 'critical':
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'info':
        return <Shield className="h-4 w-4" />;
      case 'success':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getAlertClass = () => {
    switch (level) {
      case 'critical':
        return 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-100';
      case 'warning':
        return 'border-yellow-500 bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-100';
      case 'info':
        return 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100';
      case 'success':
        return 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-100';
      default:
        return 'border-gray-500 bg-gray-50 text-gray-800 dark:bg-gray-950 dark:text-gray-100';
    }
  };

  return (
    <Alert className={`${getAlertClass()} mb-4`} data-testid="safety-alert">
      <div className="flex items-start gap-2">
        {getIcon()}
        <div className="flex-1">
          <h4 className="font-semibold text-sm mb-1">{title}</h4>
          <AlertDescription className="text-sm">
            {message}
            {actionRequired && (
              <span className="block mt-2 font-medium">
                Action required to continue using platform features.
              </span>
            )}
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}

// Age verification banner component
export function AgeVerificationBanner() {
  return (
    <Card className="bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800 mb-4">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-5 w-5 text-orange-600" />
          <h3 className="font-semibold text-orange-800 dark:text-orange-100">
            Platform Safety Notice
          </h3>
        </div>
        <p className="text-sm text-orange-700 dark:text-orange-200">
          This platform is designed for users 16 years and older. We implement comprehensive safety measures 
          including age verification and background screening to protect our community, especially minors.
        </p>
        <p className="text-xs text-orange-600 dark:text-orange-300 mt-2">
          All users undergo verification processes to ensure a safe environment for task completion and collaboration.
        </p>
      </div>
    </Card>
  );
}

// Child safety protection notice
export function ChildSafetyNotice() {
  return (
    <SafetyAlert
      level="info"
      title="Child Protection Policy"
      message="Our platform implements strict safety measures including age verification, background checks, and content moderation to protect minors. Users must be 16+ to participate."
    />
  );
}

// Parental consent pending notice for minors
export function ParentalConsentPendingAlert() {
  return (
    <SafetyAlert
      level="warning"
      title="Parental Consent Required"
      message="Your account is pending parental approval. We've sent a verification email to your parent/guardian. You'll have limited access until consent is confirmed."
      actionRequired={true}
    />
  );
}