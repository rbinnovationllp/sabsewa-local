// mobile/server/services/whatsappService.js
import twilio from 'twilio';
import dotenv from 'dotenv';

// Ensures environment variables are loaded
dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

const client = twilio(accountSid, authToken);

/**
 * Sends a WhatsApp OTP to a user
 * @param {string} toPhone - Recipient phone number (e.g. '8178113449')
 * @param {string} otpCode - The 6-digit OTP code
 */
export async function sendWhatsAppOtp(toPhone, otpCode) {
  try {
    // Standardize to E.164 international format (+91 for India)
    const formattedPhone = toPhone.startsWith('+') ? toPhone : `+91${toPhone}`;

    const message = await client.messages.create({
      from: fromNumber,
      to: `whatsapp:${formattedPhone}`,
      body: `Your SabSewa Local verification code is: ${otpCode}`
    });

    console.log(`[WhatsApp Service] Message sent successfully! SID: ${message.sid}`);
    return { success: true, sid: message.sid };
  } catch (error) {
    console.error('[WhatsApp Service] Failed to send message:', error.message);
    throw error;
  }
}