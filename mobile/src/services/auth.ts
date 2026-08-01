import { supabase } from '../../lib/supabase';
/**
 * Standardizes any Indian phone input into exact E.164 format (+91XXXXXXXXXX)
 */
export const formatE164India = (phone: string): string => {
  const digits = phone.replace(/\D/g, ''); // Remove non-numeric characters
  
  if (digits.length === 10) {
    return `+91${digits}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  return phone.startsWith('+') ? phone : `+${phone}`;
};

/**
 * Step 1: Request Mobile OTP
 */
export const requestMobileOTP = async (rawPhone: string) => {
  const formattedPhone = formatE164India(rawPhone);

  console.log('[Auth] Requesting OTP for:', formattedPhone);

  const { data, error } = await supabase.auth.signInWithOtp({
    phone: formattedPhone,
    options: {
      shouldCreateUser: true, // Allows new customers/vendors to register
    },
  });

  if (error) {
    console.error('[Auth] Request OTP Failed:', error.message);
    throw error;
  }

  // Store the exact formatted phone string in memory/state for the verification step
  return { success: true, formattedPhone, data };
};

/**
 * Step 2: Verify Mobile OTP
 */
export const verifyMobileOTP = async (rawPhone: string, token: string) => {
  const formattedPhone = formatE164India(rawPhone);

  console.log('[Auth] Verifying OTP for:', formattedPhone);

  const { data, error } = await supabase.auth.verifyOtp({
    phone: formattedPhone,
    token: token.trim(),
    type: 'sms', // Required type for SMS OTP verification
  });

  if (error) {
    console.error('[Auth] Verify OTP Failed:', error.message);
    throw error;
  }

  return data; // Successfully authenticated session
};