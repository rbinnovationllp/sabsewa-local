import React from "react";
import LegalDocumentScreen from "@/components/LegalDocumentScreen";
import { SABSEWA_PRIVACY_VERSION } from "@/lib/legalVersions";

export default function PrivacyScreen() {
  return (
    <LegalDocumentScreen
      title="SabSewa Local Privacy Notice"
      version={SABSEWA_PRIVACY_VERSION}
      sections={[
        {
          title: "Data collected",
          body: "SabSewa Local may collect name, verified mobile number, role, preferred language, customer addresses, vendor or rider business details, product catalogue data, order records, delivery status, wallet records, customer credit records, complaints, device/session information and audit logs.",
        },
        {
          title: "Purpose of processing",
          body: "Data is processed for registration, OTP verification, order fulfilment, vendor discovery, delivery tracking, wallet operation, customer-credit record keeping, dispute resolution, fraud prevention, legal compliance, support and service improvement.",
        },
        {
          title: "Customer privacy before acceptance",
          body: "Customer phone number, complete address, invoice and detailed delivery information remain hidden from vendors until the vendor formally accepts the order through the secure backend workflow.",
        },
        {
          title: "Vendor verification privacy",
          body: "Vendor verification may collect lawful business details such as legal proprietor or entity name, public shop or trade name, business address, verified business phone number, authorised representative, category, PAN or GSTIN where applicable, category-specific licences, shop photographs, location verification and accuracy declarations. Customer-facing profiles may show verified business information where legally appropriate and consented to, but private residential addresses, private numbers and unnecessary identity documents must not be displayed publicly.",
        },
        {
          title: "No religion-based verification",
          body: "SabSewa Local does not collect, investigate, rank or disclose a vendor's religion, and does not treat vendors differently because their religion differs from religious or cultural wording in a shop name. Religion is sensitive personal information and is irrelevant to product quality, marketplace eligibility and business verification.",
        },
        {
          title: "Service providers",
          body: "Data may be processed through Supabase, AWS S3, Razorpay, notification providers and Gemini/Google Cloud only where needed for authentication, database operations, storage, top-ups, notifications, security or AI-assisted workflows.",
        },
        {
          title: "Gemini and audit data",
          body: "Gemini prompts and logs must avoid passwords, payment credentials, complete customer addresses, full phone numbers and unnecessary personal information. Redacted logs may be retained for audit, support and hackathon evidence.",
        },
        {
          title: "Retention and deletion",
          body: "Users may request correction, account closure or deletion through support or grievance channels. Some records may be retained for accounting, tax, dispute, fraud-prevention, refund, audit or legal compliance.",
        },
        {
          title: "User rights and grievance",
          body: "Users may contact the SabSewa Local grievance channel for privacy, account, correction or deletion requests at support@sabsewa.in or by phone at +91 8450092846 / +91 8178113449.",
        },
      ]}
    />
  );
}
