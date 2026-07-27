// server/services/msg91Client.js
import axios from "axios";

const MSG91_API_KEY = process.env.MSG91_API_KEY;
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID;

// These should be set in your server/.env
// For example:
// MSG91_FLOW_ID_CREDIT=xxxx
// MSG91_FLOW_ID_REMINDER=yyyy
// MSG91_FLOW_ID_TRACKING=zzzz
const FLOW_CREDIT = process.env.MSG91_FLOW_ID_CREDIT;
const FLOW_REMINDER = process.env.MSG91_FLOW_ID_REMINDER;
const FLOW_TRACKING = process.env.MSG91_FLOW_ID_TRACKING;

const BASE_URL = "https://control.msg91.com/api/v5/flow/";

function baseHeaders() {
  return {
    authkey: MSG91_API_KEY,
    "Content-Type": "application/json",
  };
}

export async function sendCreditIssueSms({ phone, shopName, amount, dueDate }) {
  const payload = {
    flow_id: FLOW_CREDIT,
    sender: MSG91_SENDER_ID,
    recipients: [
      {
        mobiles: phone,
        AMOUNT: amount,
        SHOP: shopName,
        DUEDATE: dueDate,
      },
    ],
  };

  const res = await axios.post(BASE_URL, payload, { headers: baseHeaders() });
  return res.data;
}

export async function sendCreditReminderSms({ phone, shopName, amount }) {
  const payload = {
    flow_id: FLOW_REMINDER,
    sender: MSG91_SENDER_ID,
    recipients: [
      {
        mobiles: phone,
        AMOUNT: amount,
        SHOP: shopName,
      },
    ],
  };

  const res = await axios.post(BASE_URL, payload, { headers: baseHeaders() });
  return res.data;
}

// 🔔 NEW – Tracking SMS when rider starts delivery
export async function sendTrackingSms({ phone, shopName, trackLink }) {
  if (!FLOW_TRACKING) {
    console.log("⚠ MSG91_TRACKING_FLOW not configured, skipping SMS");
    return null;
  }

  const payload = {
    flow_id: FLOW_TRACKING,
    sender: MSG91_SENDER_ID,
    recipients: [
      {
        mobiles: phone,
        SHOP: shopName || "SabSewa Vendor",
        TRACK_LINK: trackLink,
      },
    ],
  };

  const res = await axios.post(BASE_URL, payload, { headers: baseHeaders() });
  return res.data;
}
