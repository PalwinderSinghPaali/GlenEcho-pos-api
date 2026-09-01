import nodemailer from 'nodemailer';
import config from '@/config';
import logger from '@/utils/logger';

class MailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      auth: config.mail.user && config.mail.pass ? {
        user: config.mail.user,
        pass: config.mail.pass,
      } : undefined,
      secure: config.mail.port === 465, // true for port 465, false for other ports
    });
  }

  /**
   * Send a general email
   */
  public async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const mailOptions = {
        from: config.mail.from,
        to,
        subject,
        html,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully to ${to}. Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error(`Error sending email to ${to}:`, error);
      return false;
    }
  }

  /**
   * Send a password reset email
   */
  public async sendPasswordResetEmail(to: string, token: string, firstName: string): Promise<boolean> {
    const frontendUrl = process.env.FRONTEND_URL || (config.app.corsOrigin && config.app.corsOrigin[0]) || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    
    const subject = 'Reset Your Password - Glen Echo Nurseries';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2c3e50; text-align: center;">Glen Echo Nurseries</h2>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p>Hello ${firstName},</p>
        <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>
        <p>To reset your password, click the button below. This link is valid for 1 hour.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #27ae60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p>Or copy and paste this URL into your browser:</p>
        <p style="word-break: break-all; color: #2980b9;">${resetUrl}</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #7f8c8d; text-align: center;">This is an automated email, please do not reply.</p>
      </div>
    `;

    return this.sendEmail(to, subject, html);
  }
}

export const mailService = new MailService();
export default mailService;
