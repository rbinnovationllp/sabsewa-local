import express from "express";
import { sendCreditIssueSms, sendCreditReminderSms } from "../services/msg91Client.js";

const router = express.Router();

/**
 * 📌 Credit Issued Notification
 * POST /api/credit/issue
 */
router.post("/issue", async (req, res) => {
  try {
    const { phone, shopName, amount, dueDate } = req.body;

    const smsResponse = await customerGotCredit({
  phone,
  shopName,
  amount,
  dueDate
});

    return res.status(200).json({
      success: true,
      messageId: smsResponse?.provider_msg_id,
      debug: smsResponse
    });

  } catch (err) {
    console.error("Error in credit issue SMS:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 📌 Credit Reminder SMS
 * POST /api/credit/remind
 */
router.post("/remind", async (req, res) => {
  try {
    const { phone, shopName, amount } = req.body;

    const smsResponse = await sendCreditReminderSms({
      phone,
      shopName,
      amount
    });

    return res.status(200).json({
      success: true,
      messageId: smsResponse?.provider_msg_id,
      debug: smsResponse
    });

  } catch (err) {
    console.error("Error in credit reminder SMS:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
