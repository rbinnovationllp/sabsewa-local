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
          body: "Every vendor must pay Rs 5,500 at initial activation. Rs 500 is a one-time, non-refundable setup, activation and platform-service charge. Rs 5,000 is credited to the vendor's refundable advance wallet for applicable category-based order-fee deductions. Later standard top-ups are Rs 5,000 and no second activation charge is deducted at voluntary closure.",
        },
        {
          title: "Platform facilitation fee after acceptance",
          body: "Platform fees and monthly terminal-subscription charges are exclusive of statutory taxes. Applicable GST will be charged additionally at the prevailing rate. The applicable category-based platform base fee plus GST is charged only when the vendor formally accepts an original order or customer-approved modified order through SabSewa Local, unless that order is covered by an active monthly accepted-order plan. In-app messages, clarification questions and alternative-product proposals do not trigger this fee. Customer contact and complete delivery details remain hidden unless the backend confirms final vendor acceptance and the required fee-plus-GST deduction or monthly-plan coverage. Once the applicable fee or monthly-plan usage record has been created, the company will not refund, reverse or adjust the charge merely because the vendor later claims that the order was cancelled, not completed, settled privately or handled outside the platform. This does not prevent correction of a company-confirmed duplicate deduction, technical error, unauthorised transaction or correction required by applicable law.",
        },
        {
          title: "Delivery estimate and safety",
          body: "Any delivery time shown in SabSewa Local is an estimated window provided or confirmed by the vendor and is not a guaranteed delivery deadline. Actual delivery time may vary because of stock availability, preparation time, distance, traffic, weather, safety conditions or other operational circumstances. SabSewa Local does not support unsafe or unrealistic delivery commitments, speed-based pressure, countdown delivery promises or penalties based solely on missing unrealistic delivery deadlines.",
        },
        {
          title: "Delivery charges",
          body: "Each vendor may set a minimum order value for free delivery and may charge a delivery fee for orders below that value. The applicable minimum order value, delivery fee, estimated delivery window and total payable amount must be displayed before the customer confirms the order. These settings may differ between vendors and terminals and must be preserved as an order snapshot after confirmation.",
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
