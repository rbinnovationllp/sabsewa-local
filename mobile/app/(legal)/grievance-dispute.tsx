import React from "react";
import LegalDocumentScreen from "@/components/LegalDocumentScreen";
import { SABSEWA_GRIEVANCE_POLICY_VERSION } from "@/lib/legalVersions";

export default function GrievanceDisputeScreen() {
  return (
    <LegalDocumentScreen
      title="SabSewa Local Grievance and Dispute Policy"
      version={SABSEWA_GRIEVANCE_POLICY_VERSION}
      sections={[
        {
          title: "In-app complaint channel",
          body: "Customers and vendors may raise complaints through the app or contact support at support@sabsewa.in, +91 8450092846 or +91 8178113449. SabSewa Local may preserve order, wallet, audit, device/session and communication records to assist review and platform action.",
        },
        {
          title: "Customer-vendor disputes",
          body: "Disputes about product quality, quantity, price, delivery, refund, replacement, direct payment or customer credit remain primarily between the concerned customer and vendor. SabSewa Local may facilitate communication but does not guarantee recovery, compensation or settlement.",
        },
        {
          title: "Vendor-company wallet disputes",
          body: "For wallet balance, Rs 15 deductions, order acceptance or platform-charge disputes, the Company CRM and Vendor CRM must show transaction IDs, order IDs, timestamps, balances, acceptance events and audit timelines. Records are prima facie evidence subject to verification and correction of proven errors.",
        },
        {
          title: "Jurisdiction",
          body: "Subject to mandatory consumer forums, statutory remedies and any court that has jurisdiction under applicable law, disputes between the company and a user or vendor are governed by Indian law and the competent courts at Gurugram, Haryana.",
        },
      ]}
    />
  );
}
