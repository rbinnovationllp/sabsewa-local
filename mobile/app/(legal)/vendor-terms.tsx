import React from "react";
import LegalDocumentScreen from "@/components/LegalDocumentScreen";
import { SABSEWA_VENDOR_TERMS_VERSION } from "@/lib/legalVersions";

export default function VendorTermsScreen() {
  return (
    <LegalDocumentScreen
      title="SabSewa Local Vendor Terms"
      version={SABSEWA_VENDOR_TERMS_VERSION}
      sections={[
        {
          title: "Independent vendor responsibility",
          body: "Each vendor is independently responsible for lawful registration, licences, tax compliance, product descriptions, prices, daily availability, stock, invoices where legally required, order fulfilment, customer payment collection, refunds, replacements, complaints and credit recovery.",
        },
        {
          title: "Advance balance and platform fee",
          body: "Every vendor must pay Rs 5,500 at initial activation. Of this amount, Rs 500 is a one-time, non-refundable setup, activation and platform-service charge, while Rs 5,000 is credited to the vendor's refundable advance wallet. Subsequent standard top-ups are Rs 5,000 and do not include another activation charge. If the vendor voluntarily discontinues the service, the remaining eligible wallet balance will be refunded after adjustment of valid outstanding platform charges. The initial Rs 500 charge will not be deducted again because it was collected at activation.",
        },
        {
          title: "Order-fee deductions",
          body: "SabSewa Local deducts Rs 15 as a platform facilitation fee for each successfully accepted and confirmed real-world order. The deduction is linked to the order ID, acceptance event, timestamp and wallet balance before and after deduction, and is shown in the vendor wallet history and downloadable statements.",
        },
        {
          title: "Customer data protection",
          body: "Customer phone number, complete address and invoice details remain hidden before formal order acceptance. After acceptance, the vendor may use customer information only for fulfilment, complaint resolution and lawful business purposes connected with that order.",
        },
        {
          title: "Exit and suspension",
          body: "A voluntary closure request stops new orders and triggers a refund preview after permitted deductions, excluding any second deduction of the Rs 500 activation charge already collected at activation. Suspensions or disqualification for fraud, confidentiality breach, NDA breach or policy violation must follow notice, evidence and dispute-resolution rules.",
        },
        {
          title: "Vendor verification and neutrality",
          body: "Every vendor must complete business verification before appearing to customers, including lawful business identity, address, authorised representative, category, licences where applicable, shop photographs, location verification and accuracy declarations. SabSewa Local does not collect, investigate, rank or disclose a vendor's religion and will not treat a vendor differently because religion differs from religious or cultural wording in a shop name.",
        },
      ]}
    />
  );
}
