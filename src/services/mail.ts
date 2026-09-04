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

  /**
   * Send an order confirmation email to the customer
   */
  public async sendOrderConfirmationEmail(to: string, order: any): Promise<boolean> {
    const orderNumber = order.order_uuid || order.id;
    const itemsHtml = (order.items || [])
      .map((item: any) => {
        const productName = item.product?.name || `Product #${item.product_id}`;
        const itemPrice = typeof item.price === 'number' ? item.price.toFixed(2) : item.price;
        const totalLinePrice = (parseFloat(itemPrice) * item.quantity).toFixed(2);
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${productName}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${itemPrice}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${totalLinePrice}</td>
          </tr>
        `;
      })
      .join('');

    const subtotal = typeof order.subtotal_amount === 'number' ? order.subtotal_amount.toFixed(2) : order.subtotal_amount || '0.00';
    const tax = typeof order.tax_amount === 'number' ? order.tax_amount.toFixed(2) : order.tax_amount || '0.00';
    const total = typeof order.total_amount === 'number' ? order.total_amount.toFixed(2) : order.total_amount || '0.00';
    const shipping = typeof order.shipping_amount === 'number' ? order.shipping_amount.toFixed(2) : order.shipping_amount || '0.00';

    const shippingAddress = order.shipping_address || {};
    const addressStr = [
      shippingAddress.address1,
      shippingAddress.address2,
      shippingAddress.city,
      shippingAddress.state,
      shippingAddress.zip,
      shippingAddress.country || 'Canada',
    ]
      .filter(Boolean)
      .join(', ');

    const subject = `Order Confirmation #${orderNumber} - Glen Echo Nurseries`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333;">
        <h2 style="color: #2c3e50; text-align: center; margin-bottom: 5px;">Glen Echo Nurseries</h2>
        <p style="text-align: center; color: #7f8c8d; margin-top: 0;">Thank you for your order!</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        
        <p>Your order <strong>#${orderNumber}</strong> has been confirmed and is being prepared.</p>
        
        ${addressStr ? `<p><strong>Shipping To:</strong><br>${addressStr}</p>` : ''}
        
        <h3 style="color: #2c3e50; margin-top: 25px;">Order Summary</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Item</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Qty</th>
              <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Price</th>
              <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml || '<tr><td colspan="4" style="padding: 8px; text-align: center;">Order Items</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 8px; text-align: right; font-weight: bold;">Subtotal:</td>
              <td style="padding: 8px; text-align: right;">$${subtotal}</td>
            </tr>
            <tr>
              <td colspan="3" style="padding: 8px; text-align: right; font-weight: bold;">HST (13%):</td>
              <td style="padding: 8px; text-align: right;">$${tax}</td>
            </tr>
            ${parseFloat(shipping) > 0 ? `
            <tr>
              <td colspan="3" style="padding: 8px; text-align: right; font-weight: bold;">Shipping:</td>
              <td style="padding: 8px; text-align: right;">$${shipping}</td>
            </tr>` : ''}
            <tr style="border-top: 2px solid #2c3e50;">
              <td colspan="3" style="padding: 8px; text-align: right; font-weight: bold; font-size: 16px;">Total Paid:</td>
              <td style="padding: 8px; text-align: right; font-weight: bold; font-size: 16px; color: #27ae60;">$${total}</td>
            </tr>
          </tfoot>
        </table>

        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0 20px 0;">
        <p style="font-size: 12px; color: #7f8c8d; text-align: center;">If you have any questions, please reply to this email or call our team. Glen Echo Nurseries.</p>
      </div>
    `;

    return this.sendEmail(to, subject, html);
  }

  /**
   * Send a shipment notification email when an order is shipped
   */
  public async sendOrderShippedEmail(to: string, order: any): Promise<boolean> {
    const orderNumber = order.order_uuid || order.id;
    const carrier = order.carrier || 'Standard Courier';
    const trackingNumber = order.tracking_number;
    const estimatedDelivery = order.estimated_delivery
      ? new Date(order.estimated_delivery).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;

    const shippingAddress = order.shipping_address || {};
    const addressStr = [
      shippingAddress.address1,
      shippingAddress.address2,
      shippingAddress.city,
      shippingAddress.state,
      shippingAddress.zip,
      shippingAddress.country || 'Canada',
    ]
      .filter(Boolean)
      .join(', ');

    const subject = `Your Order #${orderNumber} Has Shipped! - Glen Echo Nurseries`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333;">
        <h2 style="color: #2c3e50; text-align: center; margin-bottom: 5px;">Glen Echo Nurseries</h2>
        <p style="text-align: center; color: #27ae60; font-weight: bold; margin-top: 0; font-size: 18px;">Your Package is on the Way!</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        
        <p>Great news! Your order <strong>#${orderNumber}</strong> has shipped and is heading to your address.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Shipping Carrier:</strong> ${carrier}</p>
          ${trackingNumber ? `<p style="margin: 5px 0;"><strong>Tracking Number:</strong> <span style="font-family: monospace; font-size: 14px; background: #eee; padding: 2px 6px; border-radius: 3px;">${trackingNumber}</span></p>` : ''}
          ${estimatedDelivery ? `<p style="margin: 5px 0;"><strong>Estimated Delivery:</strong> ${estimatedDelivery}</p>` : ''}
          ${addressStr ? `<p style="margin: 5px 0;"><strong>Shipping Destination:</strong> ${addressStr}</p>` : ''}
        </div>

        <p>Thank you for choosing Glen Echo Nurseries for your garden and landscape needs.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0 15px 0;">
        <p style="font-size: 12px; color: #7f8c8d; text-align: center;">This is an automated email from Glen Echo Nurseries.</p>
      </div>
    `;

    return this.sendEmail(to, subject, html);
  }

  /**
   * Send critical alert email to store managers
   */
  public async sendManagerAlertEmail(subject: string, message: string): Promise<boolean> {
    const managerEmail = process.env.MANAGER_ALERT_EMAIL || config.mail.from || 'admin@glenecho.ca';
    const alertSubject = `🚨 [CRITICAL ALERT] ${subject}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #e74c3c; border-radius: 8px;">
        <h2 style="color: #e74c3c;">System Alert - Glen Echo Backend</h2>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;">
        <p style="font-size: 15px; line-height: 1.5;">${message}</p>
        <p style="margin-top: 20px; font-size: 13px; color: #7f8c8d;">Timestamp: ${new Date().toISOString()}</p>
      </div>
    `;

    return this.sendEmail(managerEmail, alertSubject, html);
  }
}

export const mailService = new MailService();
export default mailService;
