import React from "react";
import LegalDocumentScreen from "@/components/LegalDocumentScreen";
import { SABSEWA_CUSTOMER_TERMS_VERSION } from "@/lib/legalVersions";

export default function CustomerTermsScreen() {
  return (
    <LegalDocumentScreen
      title="SabSewa Local Customer Terms"
      version={SABSEWA_CUSTOMER_TERMS_VERSION}
      sections={[
        {
          title: "Direct customer-vendor transaction",
          body: "SabSewa Local is a technology marketplace. The customer purchases products or services directly from the selected local vendor. SabSewa Local does not sell the product, collect the purchase price on behalf of the vendor, guarantee product quality or guarantee refunds, replacements or settlements between customer and vendor.",
        },
        {
          title: "Order confirmation",
          body: "An order becomes confirmed only when the vendor accepts it through the app. Before acceptance, prices and availability may change where the vendor has marked the item as hidden price, ask vendor or market price. For quoted-price or partial-fulfilment orders, the customer must approve the revised order before it becomes final.",
        },
        {
          title: "Payments",
          body: "The customer pays the concerned vendor directly using the payment methods accepted by that vendor, such as UPI, cash, card or other permitted methods. SabSewa Local may maintain transaction records but is not responsible for collecting, settling, refunding or recovering the order amount.",
        },
        {
          title: "Complaints",
          body: "Customers may use the in-app complaint channel. SabSewa Local may preserve records, facilitate communication and take platform action for fraud or policy violations, but customer-vendor disputes remain subject to applicable law and statutory consumer rights.",
        },
        {
          title: "Product quantity and quality checks",
          body: "Vendors are responsible for the accuracy, legality, safety, quality, quantity, price, packaging and description of products supplied through SabSewa Local. Customers should check, where reasonably possible, the product and quantity, packaging and seals, expiry date, visible condition, invoice and price, and whether delivered items match the confirmed order.",
        },
        {
          title: "Vendor responsibility",
          body: "Complaints about product quality, quantity, substitution, price, refund or replacement should initially be resolved between the customer and the concerned vendor. SabSewa Local may provide transaction evidence and a complaint channel, but it does not manufacture, own or independently inspect every product. Nothing in these terms removes statutory consumer rights or responsibilities that cannot lawfully be excluded.",
        },
      ]}
    />
  );
}
