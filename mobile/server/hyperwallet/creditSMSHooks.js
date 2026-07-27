import { sendCreditIssueSms, sendCreditReminderSms } from "../services/msg91Client.js";

export async function customerGotCredit({ phone, shopName, amount, dueDate }) {
  await customerGotCredit({
  phone,
  shopName,
  amount,
  dueDate
});

}

export async function remindCustomerPayment({ phone, shopName, amount }) {
  await sendCreditReminderSms({
    phone,
    shopName,
    amount
  });
}
