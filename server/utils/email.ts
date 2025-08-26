import sgMail from '@sendgrid/mail';
import { logger } from './logger';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  logger.info('SendGrid email service initialized');
} else {
  logger.warn('SendGrid API key not found - email sending disabled');
}

interface EmailOptions {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    logger.warn('Email not sent - SendGrid not configured');
    return false;
  }

  try {
    await sgMail.send({
      to: options.to,
      from: options.from,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text,
    });
    
    logger.info(`Email sent successfully to ${options.to}`);
    return true;
  } catch (error: any) {
    logger.error('Failed to send email:', error);
    
    // Log more specific error details if available
    if (error.response) {
      logger.error('SendGrid error details:', error.response.body);
    }
    
    return false;
  }
}

export async function sendSupportEmail(
  userEmail: string,
  username: string,
  subject: string,
  message: string
): Promise<boolean> {
  const supportEmail = 'pocketbounty@zohomail.com';
  const fromEmail = 'pocketbounty@zohomail.com'; // Using the same email for both from and to
  
  const emailSubject = `[Support Request] ${subject}`;
  
  const emailText = `
New support request received from Pocket Bounty:

From: ${username}
Email: ${userEmail}
Subject: ${subject}

Message:
${message}

---
This is an automated message from the Pocket Bounty support system.
  `.trim();
  
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">New Support Request</h2>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
        <p><strong>From:</strong> ${username}</p>
        <p><strong>Email:</strong> <a href="mailto:${userEmail}">${userEmail}</a></p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr style="border: 1px solid #ddd; margin: 20px 0;">
        <p><strong>Message:</strong></p>
        <div style="background: white; padding: 15px; border-radius: 5px;">
          ${message.replace(/\n/g, '<br>')}
        </div>
      </div>
      <p style="color: #666; font-size: 12px; margin-top: 20px;">
        This is an automated message from the Pocket Bounty support system.
      </p>
    </div>
  `.trim();
  
  return await sendEmail({
    to: supportEmail,
    from: fromEmail,
    subject: emailSubject,
    text: emailText,
    html: emailHtml,
  });
}