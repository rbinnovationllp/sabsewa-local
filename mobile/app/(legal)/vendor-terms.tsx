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
          body: "Platform fees and monthly terminal-subscription charges are exclusive of statutory taxes. Applicable GST will be charged additionally at the prevailing rate. SabSewa Local deducts the backend-resolved category platform base fee plus GST only when the vendor finally accepts an original order or customer-approved modified order, unless that order is covered by an active monthly accepted-order plan. Current category base fees are Rs 15 for fruits/vegetables, Rs 20 for kirana/general stores and Rs 25 for restaurants/pharmacies/other default categories, plus applicable GST. The deduction is linked to the order ID, acceptance event, timestamp, pricing snapshot, GST snapshot and wallet balance before and after deduction, and is shown in the vendor wallet history and downloadable statements.",
        },
        {
          title: "No reversal after vendor acceptance",
          body: "Once the vendor formally accepts an order through SabSewa Local and the applicable category base fee plus GST or monthly-plan usage record is created, the company will not refund, reverse or adjust the charge merely because the vendor later claims that the order was cancelled, not completed, settled privately or handled outside the platform. Reversal may be considered only for a company-confirmed duplicate deduction, technical error, unauthorised transaction or any correction required by applicable law.",
        },
        {
          title: "Delivery estimates and safe fulfilment",
          body: "Vendors must provide reasonable estimated delivery windows and may configure delivery charge, free-delivery threshold, service radius, delivery availability and pickup availability for each terminal. SabSewa Local does not permit guaranteed ultra-fast countdown promises, speed pressure or unsafe delivery practices. Vendors and delivery personnel must follow traffic laws and safe working practices.",
        },
        {
          title: "Customer data protection",
          body: "Customer phone number, complete address and invoice details remain hidden before formal order acceptance. Before acceptance, any clarification, availability response or alternative-product proposal must use the SabSewa Local order conversation. Vendors and customers must not share phone numbers, email addresses, WhatsApp links, UPI IDs, external payment links or other direct-contact details to bypass the platform's privacy controls. After acceptance, the vendor may use customer information only for fulfilment, complaint resolution and lawful business purposes connected with that order.",
        },
        {
          title: "Exit and suspension",
          body: "A voluntary closure request stops new orders and triggers a refund preview after permitted deductions, excluding any second deduction of the Rs 500 activation charge already collected at activation. Suspensions or disqualification for fraud, confidentiality breach, NDA breach or policy violation must follow notice, evidence and dispute-resolution rules.",
        },
        {
          title: "Vendor verification and neutrality",
          body: "Every vendor must complete business verification before appearing to customers, including lawful business identity, address, business-establishment/occupancy address proof for the declared shop or branch premises, authorised representative, category, licences where applicable, shop photographs, location verification and accuracy declarations. If any information, document, declaration, business detail, KYC information, licence or other information provided by a vendor is subsequently found to be false, incorrect, misleading, or materially inaccurate, SabSewa Local may temporarily suspend the vendor's access to the platform pending verification or investigation. After completion of the investigation, the vendor may be permitted to resume operations if the issue is satisfactorily resolved, or the vendor account may be terminated if the violation is established. SabSewa Local does not collect, investigate, rank or disclose a vendor's religion and will not treat a vendor differently because religion differs from religious or cultural wording in a shop name.",
        },
      ]}
    />
  );
}

