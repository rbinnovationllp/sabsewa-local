import cron from "node-cron";
import { runVendorCreditReminderJob } from "../credit/creditReminderJob.js";

cron.schedule("0 20 * * *", async () => {
  console.log("Running vendor credit reminder cron...");

  try {
    const result = await runVendorCreditReminderJob();
    console.log("Vendor credit reminders queued:", result);
  } catch (error) {
    console.error("Vendor credit reminder cron failed:", error.message);
  }
});
