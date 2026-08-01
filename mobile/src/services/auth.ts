import { supabase } from '../../lib/supabase';

/**
 * Formats raw Indian phone input into strict E.164 standard.
 * Examples:
 *   "9876543210"    -> "+919876543210"
 *   "+919876543210" -> "+919876543210"
 *   "09876543210"   -> "+919876543210"
 */
export const formatIndianPhoneNumber = (input: string): string => {
  const digitsOnly = input.replace(/\D/g, '');
  
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return `+91${digitsOnly.slice(1)}`;
  }
  
  throw new Error('Please enter a valid 10-digit Indian mobile number.');
};

/**
 * Initiates Phone OTP Authentication via Supabase & Twilio Verify
 */
export const requestPhoneOTP = async (rawPhone: string) => {
  const phoneAuthEnabled = process.env.EXPO_PUBLIC_PHONE_AUTH_ENABLED === 'true';
  
  if (!phoneAuthEnabled) {
    throw new Error('Phone OTP authentication is disabled in current runtime environment.');
  }

  const formattedPhone = formatIndianPhoneNumber(rawPhone);

  const { data, error } = await supabase.auth.signInWithOtp({
    phone: formattedPhone,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error('[AuthService] signInWithOtp Error:', error.status, error.message);
    throw error;
  }

  return { success: true, phone: formattedPhone, data };
};

/**
 * Verifies submitted OTP against Supabase Auth session
 */
export const verifyPhoneOTP = async (rawPhone: string, token: string) => {
  const formattedPhone = formatIndianPhoneNumber(rawPhone);

  const { data, error } = await supabase.auth.verifyOtp({
    phone: formattedPhone,
    token: token.trim(),
    type: 'sms',
  });

  if (error) {
    console.error('[AuthService] verifyOtp Error:', error.status, error.message);
    throw error;
  }

  return data; // Returns { session, user }
};