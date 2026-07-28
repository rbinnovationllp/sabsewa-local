import React from "react";
import LegalDocumentScreen from "@/components/LegalDocumentScreen";
import { SABSEWA_CREDIT_DISCLAIMER_VERSION } from "@/lib/legalVersions";

export default function CreditDisclaimerScreen() {
  return (
    <LegalDocumentScreen
      title="SabSewa Local Credit Record Disclaimer"
      version={SABSEWA_CREDIT_DISCLAIMER_VERSION}
      sections={[
        {
          title: "Vendor-controlled credit",
          body: "Any customer credit facility is offered solely by the concerned vendor. SabSewa Local and Rashi Bhartiya Innovation LLP do not approve, finance, guarantee, collect, recover or compensate vendors for unpaid customer dues.",
        },
        {
          title: "Record-keeping role only",
          body: "The application maintains vendor-wise records of credit limits, credit purchases, repayments, adjustments, outstanding balances, due dates and transaction history to improve transparency and reduce disputes.",
        },
        {
          title: "No recovery responsibility",
          body: "Credit recovery, dispute, settlement or legal action remains solely between the vendor and customer. The customer may still place prepaid or immediate-payment orders unless separately restricted for a valid reason.",
        },
      ]}
    />
  );
}
