import React from "react";
import LegalDocumentScreen from "@/components/LegalDocumentScreen";
import { SABSEWA_REFUND_POLICY_VERSION } from "@/lib/legalVersions";

export default function RefundCancellationScreen() {
  return (
    <LegalDocumentScreen
      title="SabSewa Local Refund and Cancellation Policy"
      version={SABSEWA_REFUND_POLICY_VERSION}
      sections={[
        {
          title: "Customer order refunds",
          body: "Because customer order payments are made directly to vendors, product refunds, replacements, cancellations and settlements are primarily handled between the customer and the concerned vendor, subject to applicable law and statutory consumer rights.",
        },
        {
          title: "Vendor wallet top-ups",
          body: "The first vendor payment is Rs 5,500, made up of a one-time Rs 500 non-refundable activation and platform-service charge plus Rs 5,000 credited to the refundable advance wallet. Later standard top-ups are Rs 5,000 and do not include another activation charge. Incorrect deductions must be disputed through the wallet dispute module. Proven incorrect deductions are reversed through separate wallet reversal entries, not by deleting original records.",
        },
        {
          title: "Vendor closure refund",
          body: "On voluntary closure, new orders stop and the vendor receives a refund preview. The company will not deduct the Rs 500 activation charge again because it was collected at activation. The remaining eligible wallet balance may be adjusted only for valid unpaid Rs 15 completed-order charges, applicable taxes, payment-gateway expenses, refunds, authorised adjustments or other legally payable amounts before refund.",
        },
      ]}
    />
  );
}
