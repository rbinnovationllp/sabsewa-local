import { Router } from "express";
import {
  createPaymentOrder,
  verifyPaymentSignature,
  handleRazorpayWebhook
} from "../controllers/paymentController.js";

export const paymentRouter: Router = Router();

paymentRouter.post("/create-order", createPaymentOrder);
paymentRouter.post("/verify", verifyPaymentSignature);
paymentRouter.post("/razorpay/webhook", handleRazorpayWebhook);