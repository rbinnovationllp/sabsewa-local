import React from "react";
import LegalDocumentScreen from "@/components/LegalDocumentScreen";
import { SABSEWA_TERMS_VERSION } from "@/lib/legalVersions";

export default function TermsScreen() {
  return (
    <LegalDocumentScreen
      title="SabSewa Local Terms of Use"
      version={SABSEWA_TERMS_VERSION}
      sections={[
        {
          title: "Platform operator",
          body: "SabSewa Local is operated by Rashi Bhartiya Innovation LLP, having its registered office in Gurugram, Haryana. SabSewa Local provides a technology platform through which customers can discover and transact directly with registered local vendors.",
        },
        {
          title: "Role of SabSewa Local",
          body: "SabSewa Local acts only as a digital marketplace and technology-service provider. The company is not the seller, owner, manufacturer or supplier of products displayed by vendors. Every sale is made directly between the customer and the selected vendor.",
        },
        {
          title: "Direct payment model",
          body: "Customer payments for orders are made directly to vendors using payment methods accepted by them. SabSewa Local does not charge customers a platform fee and does not collect the purchase price on behalf of vendors.",
        },
        {
          title: "Vendor obligations",
          body: "Product quality, quantity, pricing, availability, delivery, warranty, replacement, refund obligations, licences, invoices and sector-specific legal compliance remain with the vendor, subject to applicable law.",
        },
        {
          title: "Vendor activation payment",
          body: "Every vendor must pay Rs 5,500 at initial activation. Rs 500 is a one-time, non-refundable setup, activation and platform-service charge. Rs 5,000 is credited to the vendor's refundable advance wallet for Rs 15 order-fee deductions. Later standard top-ups are Rs 5,000 and no second activation charge is deducted at voluntary closure.",
        },
        {
          title: "Credit records",
          body: "Any customer credit facility is offered solely by the concerned vendor. SabSewa Local does not approve, finance, guarantee, collect or recover credit. The platform only maintains vendor-wise records for transparency.",
        },
        {
          title: "Records and disputes",
          body: "SabSewa Local may maintain electronic records of orders, acceptance, delivery status, vendor-wallet deductions, credit entries, device/session events and complaints. These records may be used as prima facie evidence, subject to verification, correction of proven errors and applicable law.",
        },
        {
          title: "Governing law",
          body: "These Terms are governed by the laws of India. Subject to mandatory consumer forums, statutory remedies and courts having jurisdiction under applicable law, company-user disputes shall fall under the competent courts at Gurugram, Haryana.",
        },
        {
          title: "Statutory rights",
          body: "Nothing in these Terms excludes any responsibility, remedy or statutory right that cannot legally be excluded.",
        },
      ]}
    />
  );
}
