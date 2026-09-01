import { Request, Response, NextFunction } from 'express';
import { ContactSubmission } from '@/database/models/contact-submission.model';
import { mailService } from '@/services/mail';
import logger from '@/utils/logger';

/**
 * Handle Contact Us Form Submissions
 */
export const submitContactForm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { firstName, email, phone, subject, message, honeypot, source = 'contact_us' } = req.body;

    // Honeypot spam check - if filled, silently succeed without saving or emailing
    if (honeypot && typeof honeypot === 'string' && honeypot.trim() !== '') {
      logger.warn(`Spam bot contact submission detected via honeypot field. Suppressed.`, { email, firstName });
      res.status(200).json({
        success: true,
        message: 'Your message has been sent successfully.',
      });
      return;
    }

    // Save submission to database
    const submission = await ContactSubmission.create({
      first_name: firstName,
      email,
      phone: phone || null,
      subject,
      message,
      source,
    });

    logger.info(`Contact Us submission stored in DB: ID ${submission.id}, Source: ${source}`);

    // Determine receiver email (Support / Admin email)
    const adminEmail = process.env.CONTACT_RECEIVER_EMAIL || process.env.SMTP_USER || 'support@glenechonurseries.com';

    // Map source keys to user-friendly labels
    const sourceLabels: { [key: string]: string } = {
      contact_us: 'Contact Us Page',
      order_query: 'Orders Query Page',
      product_inquiry: 'Product Inquiry Page',
      general: 'General Query',
    };
    const friendlySource = sourceLabels[source] || source;

    // 1. Send Email Notification to Admin
    const adminHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #2e7d32; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Glen Echo Nurseries</h2>
          <p style="color: #718096; font-size: 14px; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px;">New Website Submission</p>
        </div>
        <hr style="border: 0; border-top: 1.5px solid #edf2f7; margin-bottom: 25px;">
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
          <tr>
            <td style="padding: 10px 0; font-weight: 600; color: #4a5568; width: 140px; vertical-align: top;">Name:</td>
            <td style="padding: 10px 0; color: #1a202c; vertical-align: top;">${firstName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: 600; color: #4a5568; vertical-align: top;">Email:</td>
            <td style="padding: 10px 0; color: #2b6cb0; vertical-align: top;"><a href="mailto:${email}" style="color: #2b6cb0; text-decoration: none;">${email}</a></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: 600; color: #4a5568; vertical-align: top;">Phone:</td>
            <td style="padding: 10px 0; color: #1a202c; vertical-align: top;">${phone || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: 600; color: #4a5568; vertical-align: top;">Form Source:</td>
            <td style="padding: 10px 0; color: #e53e3e; font-weight: 600; vertical-align: top;">${friendlySource}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: 600; color: #4a5568; vertical-align: top;">Subject:</td>
            <td style="padding: 10px 0; color: #1a202c; font-weight: 600; vertical-align: top;">${subject}</td>
          </tr>
        </table>

        <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #2e7d32; margin-bottom: 30px;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #4a5568; font-size: 14px; text-transform: uppercase;">Message:</p>
          <p style="margin: 0; color: #2d3748; line-height: 1.6; white-space: pre-wrap;">${message}</p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="mailto:${email}?subject=RE: ${encodeURIComponent(subject)}" style="background-color: #2e7d32; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block; transition: background-color 0.2s;">Reply Directly to Customer</a>
        </div>
        
        <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 30px 0 20px 0;">
        <p style="font-size: 11px; color: #a0aec0; text-align: center; margin: 0;">This is an automated notification. Sent from Glen Echo Nurseries.</p>
      </div>
    `;

    const adminEmailSent = await mailService.sendEmail(
      adminEmail,
      `[Contact Us Alert] ${subject} - from ${firstName}`,
      adminHtml
    );

    if (!adminEmailSent) {
      logger.error(`Failed to send Contact Us alert email to admin: ${adminEmail}`);
    }

    // 2. Send Auto-Reply Receipt Email to Customer (Premium confirmation layout)
    const customerHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #2e7d32; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Glen Echo Nurseries</h2>
          <p style="color: #718096; font-size: 14px; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px;">Thank You for Reaching Out</p>
        </div>
        <hr style="border: 0; border-top: 1.5px solid #edf2f7; margin-bottom: 25px;">
        
        <p style="font-size: 16px; line-height: 1.6; color: #2d3748; margin-bottom: 20px;">Hello ${firstName},</p>
        <p style="font-size: 15px; line-height: 1.6; color: #2d3748; margin-bottom: 20px;">Thank you for contacting Glen Echo Nurseries. We have received your inquiry regarding <strong>"${subject}"</strong>.</p>
        <p style="font-size: 15px; line-height: 1.6; color: #2d3748; margin-bottom: 25px;">Our team is reviewing your message and will get back to you as soon as possible, usually within 1–2 business days.</p>
        
        <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #cbd5e0; margin-bottom: 30px;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #718096; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">A copy of your message:</p>
          <p style="margin: 0; color: #4a5568; line-height: 1.5; font-style: italic; white-space: pre-wrap;">"${message}"</p>
        </div>

        <p style="font-size: 14px; color: #718096; margin-bottom: 5px;">Best regards,</p>
        <p style="font-size: 15px; font-weight: 700; color: #2e7d32; margin-top: 0;">The Glen Echo Nurseries Team</p>
        
        <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 30px 0 20px 0;">
        <p style="font-size: 11px; color: #a0aec0; text-align: center; margin: 0;">This is an automated receipt confirmation. Please do not reply to this email directly.</p>
      </div>
    `;

    const customerEmailSent = await mailService.sendEmail(
      email,
      `We have received your message - Glen Echo Nurseries`,
      customerHtml
    );

    if (!customerEmailSent) {
      logger.error(`Failed to send Contact Us auto-reply email to customer: ${email}`);
    }

    res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully.',
    });
  } catch (error) {
    logger.error('Error handling contact form submission:', error);
    next(error);
  }
};
