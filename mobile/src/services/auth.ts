import { supabase } from '../../lib/supabase';

// Helper function to enforce strict +91 E.164 format across all steps
export const normalizeIndiaPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${phone}`;
};

// Step 1: Request OTP
export const sendMobileOTP = async (rawPhone: string) => {
  const formattedPhone = normalizeIndiaPhone(rawPhone);

  const { data, error } = await supabase.auth.signInWithOtp({
    phone: formattedPhone,
    options: {
      shouldCreateUser: true, // MUST be true for new user registration
    },
  });

  if (error) {
    console.error('Error sending OTP:', error.message);
    throw error;
  }
  return { success: true, phone: formattedPhone, data };
};

// Step 2: Verify OTP
export const verifyMobileOTP = async (rawPhone: string, token: string) => {
  // CRITICAL: Must format EXACTLY the same as Step 1
  const formattedPhone = normalizeIndiaPhone(rawPhone);

  const { data, error } = await supabase.auth.verifyOtp({
    phone: formattedPhone,
    token: token.trim(),
    type: 'sms',
  });

  if (error) {
    console.error('Error verifying OTP:', error.message);
    throw error;
  }

  return data; // Returns { session, user }
};