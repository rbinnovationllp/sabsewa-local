import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
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

export async function completeRegistrationProfile(user: User, session: Session | null): Promise<RegistrationCompletionResult> {
  const metadata = user.user_metadata || {};
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
    };

    if (existingVendor?.id) {
      const { error: updateError } = await supabase.from("vendors").update(vendorPayload).eq("id", existingVendor.id);
      if (updateError) throw updateError;
    } else {
      const { error: vendorError } = await supabase.from("vendors").insert(vendorPayload);
      if (vendorError) throw vendorError;
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
