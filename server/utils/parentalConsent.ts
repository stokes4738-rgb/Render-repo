import { sendSupportEmail } from "./email";
import { calculateAge } from "../middleware/ageVerification";

interface ParentalConsentData {
  minorName: string;
  minorEmail: string;
  minorAge: number;
  parentName: string;
  parentEmail: string;
  username: string;
  dateOfBirth: string;
}

export async function sendParentalConsentVerification(consentData: ParentalConsentData): Promise<boolean> {
  const subject = `Parental Consent Required - Pocket Bounty Account for ${consentData.minorName}`;
  
  const message = `
Dear ${consentData.parentName},

Your child, ${consentData.minorName} (${consentData.minorAge} years old), has requested to create an account on Pocket Bounty, a task marketplace platform.

Account Details:
- Child's Name: ${consentData.minorName}
- Username: ${consentData.username}
- Email: ${consentData.minorEmail}
- Age: ${consentData.minorAge}
- Date of Birth: ${consentData.dateOfBirth}

IMPORTANT SAFETY INFORMATION:
Pocket Bounty is a platform where users can post and complete tasks for monetary rewards. We take child safety very seriously and have implemented the following protections:

1. Age Verification: Users must be 16+ years old
2. Parental Consent: Users 16-17 require parental approval
3. Background Checks: All users undergo safety screening
4. Content Moderation: All tasks and communications are monitored
5. Payment Protection: Secure escrow system for all transactions

Your child has indicated they have your permission to create this account. If this is correct and you approve of their participation, please reply to this email with "I CONSENT" to activate their account.

If you did not give permission or have concerns, please contact us immediately at this email address.

For questions about platform safety or to discuss restrictions, please reach out to our support team.

Thank you for helping us keep our platform safe for all users.

Best regards,
Pocket Bounty Safety Team

---
This is an automated safety verification email. Your child's account will remain inactive until parental consent is confirmed.
  `;

  try {
    const emailSent = await sendSupportEmail(
      consentData.parentEmail,
      consentData.parentName,
      subject,
      message
    );

    if (emailSent) {
      console.log(`Parental consent email sent successfully to ${consentData.parentEmail} for minor ${consentData.minorName}`);
    }

    return emailSent;
  } catch (error) {
    console.error(`Failed to send parental consent email for ${consentData.minorName}:`, error);
    return false;
  }
}

export function createMinorAccountNotice(minorName: string, parentName: string, age: number): string {
  return `Account created for ${minorName} (age ${age}). Parental consent verification email sent to ${parentName}. Account will remain restricted until parent responds with consent confirmation.`;
}