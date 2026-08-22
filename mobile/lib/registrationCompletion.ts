import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/backend";
import { getDeviceMetadata } from "@/lib/deviceIdentity";
import {
  SABSEWA_ACCEPTANCE_STATEMENT,
  SABSEWA_ACCEPTED_DOCUMENT_VERSIONS,
  SABSEWA_POLICY_BUNDLE_VERSION,
  SABSEWA_PRIVACY_VERSION,
  SABSEWA_TERMS_VERSION,
} from "@/lib/legalVersions";

export type RegistrationCompletionResult = {
  role: string;
  profileSaved: boolean;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function addressFromMetadata(metadata: any) {
  return clean(metadata.primary_address);
}

function referralMetadata(metadata: any) {
  const referral = metadata?.partner_referral || {};
  return {
    isPartnerReferral: Boolean(metadata.referred_by_partner_flag && (referral.referral_code || referral.partner_id || referral.entered_referral_id || referral.entered_phone)),
    sourceType: clean(referral.source_type) || (metadata.referred_by_partner_flag ? "approved_partner" : "direct_company"),
    partnerApplicationId: clean(referral.partner_application_id || metadata.attributed_partner_id),
    partnerId: clean(referral.partner_id),
    referralCode: clean(referral.referral_code || metadata.partner_referral_code_used),
    enteredReferralId: clean(referral.entered_referral_id),
    enteredPhone: clean(referral.entered_phone),
    confirmedByVendor: referral.confirmed_by_vendor !== false,
  };
}

export async function completeRegistrationProfile(
  user: User,
  session: Session | null,
  metadataOverride: Record<string, any> = {}
): Promise<RegistrationCompletionResult> {
  const metadata = { ...(user.user_metadata || {}), ...(metadataOverride || {}) };
  const role = clean(metadata.role) || "customer";
  const language = clean(metadata.preferred_language) || "en";
  const phone = clean(user.phone || metadata.phone);
  const email = clean(user.email || metadata.email).toLowerCase();

  const { error: profileError } = await supabase.from("user_profiles").upsert({
    user_id: user.id,
    role,
    full_name: clean(metadata.full_name),
    phone: phone || null,
    city: clean(metadata.city),
    preferred_language: language,
    terms_version: clean(metadata.terms_version) || SABSEWA_TERMS_VERSION,
    privacy_version: clean(metadata.privacy_version) || SABSEWA_PRIVACY_VERSION,
    policy_bundle_version: clean(metadata.policy_bundle_version) || SABSEWA_POLICY_BUNDLE_VERSION,
    accepted_document_versions: metadata.accepted_document_versions || SABSEWA_ACCEPTED_DOCUMENT_VERSIONS,
    policies_accepted_at: new Date().toISOString(),
    policies_accepted_language: clean(metadata.policy_acceptance_language) || language,
    primary_address: addressFromMetadata(metadata) || null,
    registration_completed_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (profileError) throw profileError;

  if (metadata.accepted_policies) {
    const device = metadata.policy_acceptance_device || await getDeviceMetadata();
    const { error: policyError } = await supabase.from("user_policy_acceptances").upsert({
      user_id: user.id,
      role,
      terms_version: clean(metadata.terms_version) || SABSEWA_TERMS_VERSION,
      privacy_version: clean(metadata.privacy_version) || SABSEWA_PRIVACY_VERSION,
      policy_bundle_version: clean(metadata.policy_bundle_version) || SABSEWA_POLICY_BUNDLE_VERSION,
      accepted_document_versions: metadata.accepted_document_versions || SABSEWA_ACCEPTED_DOCUMENT_VERSIONS,
      accepted_statement: clean(metadata.policy_acceptance_statement) || SABSEWA_ACCEPTANCE_STATEMENT,
      displayed_language: clean(metadata.policy_acceptance_language) || language,
      device_id: device.device_id || null,
      device_name: device.device_name || null,
      platform: device.platform || null,
      app_version: device.app_version || null,
      session_id: session?.access_token ? session.access_token.slice(0, 16) : null,
      otp_verified: true,
      marketing_consent: Boolean(metadata.marketing_consent),
    }, { onConflict: "user_id,terms_version,privacy_version,policy_bundle_version,displayed_language" });
    if (policyError) throw policyError;
  }

  if (role === "customer" && addressFromMetadata(metadata)) {
    const { error: addressError } = await supabase.from("customer_addresses").upsert({
      customer_id: user.id,
      label: "Primary",
      full_address: addressFromMetadata(metadata),
      city: clean(metadata.city),
      lat: metadata.location_coordinates?.lat || null,
      lng: metadata.location_coordinates?.lng || null,
      is_primary: true,
    }, { onConflict: "customer_id,label" });
    if (addressError) throw addressError;
  }

  if (role === "vendor") {
    const shopName = clean(metadata.shop_name);
    const shopAddress = addressFromMetadata(metadata);
    const referral = referralMetadata(metadata);
    const { data: existingVendor, error: existingError } = await supabase
      .from("vendors")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (existingError) throw existingError;

    const vendorPayload = {
      owner_user_id: user.id,
      shop_name: shopName || clean(metadata.full_name) || "SabSewa Local Vendor",
      owner_name: clean(metadata.full_name),
      phone: phone || null,
      category: clean(metadata.service_type_or_area) || "kirana",
      address: shopAddress || null,
      lat: metadata.location_coordinates?.lat || null,
      lng: metadata.location_coordinates?.lng || null,
      status: "pending",
      referral_source_type: referral.isPartnerReferral ? "approved_partner" : "direct_company",
      referral_status: referral.isPartnerReferral ? "pending_backend_validation" : "direct_company",
      referral_confirmed_by_vendor: referral.confirmedByVendor,
      attribution_method: referral.isPartnerReferral ? "vendor_registration_form" : "no_referral_selected",
      commission_eligibility_status: referral.isPartnerReferral ? "pending_partner_validation" : "not_partner_referred",
    };

    let vendorId = existingVendor?.id || null;
    if (existingVendor?.id) {
      const { data: updatedVendor, error: updateError } = await supabase.from("vendors").update(vendorPayload).eq("id", existingVendor.id).select("id").single();
      if (updateError) throw updateError;
      vendorId = updatedVendor?.id || existingVendor.id;
    } else {
      const { data: createdVendor, error: vendorError } = await supabase.from("vendors").insert(vendorPayload).select("id").single();
      if (vendorError) throw vendorError;
      vendorId = createdVendor?.id || null;
    }

    if (referral.isPartnerReferral && vendorId) {
      const response = await fetch(apiUrl("/api/partner/referrals/attribute"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          vendor_id: vendorId,
          partner_id: referral.partnerApplicationId || referral.partnerId || referral.enteredReferralId,
          referral_id: referral.enteredReferralId,
          referral_code: referral.referralCode || referral.enteredReferralId,
          phone: referral.enteredPhone,
          referral_confirmed_by_vendor: referral.confirmedByVendor,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Partner referral could not be verified and saved.");
      }
    }
  }

  return { role, profileSaved: true };
}

export async function recoverIncompleteRegistration(user: User | null, session: Session | null) {
  if (!user?.id || !user.user_metadata?.role) return null;
  const { data: existingProfile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingProfile?.role) return { role: existingProfile.role, profileSaved: true };
  return completeRegistrationProfile(user, session);
}

