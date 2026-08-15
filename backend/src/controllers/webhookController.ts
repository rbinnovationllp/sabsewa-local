// backend/src/controllers/webhookController.ts
import { Request, Response } from 'express';
import { verifyRazorpayWebhook } from '../utils/razorpayWebhook';
import { processSuccessfulPayment } from '../services/walletService';

export async function handleRazorpayWebhook(req: Request, res: Response) {
  const signature = req.headers['x-razorpay-signature'] as string;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

  // 1. Validate signature using raw body
  const isValid = verifyRazorpayWebhook(
    (req as any).rawBody || JSON.stringify(req.body),
    signature,
    webhookSecret
  );

  if (!isValid) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body.event;
  const paymentEntity = req.body.payload.payment.entity;

  // 2. Handle successful payment idempotently
  if (event === 'payment.captured' || event === 'order.paid') {
    await processSuccessfulPayment(paymentEntity);
  }

  // 3. Always return 200 OK to acknowledge receipt
  return res.status(200).json({ status: 'ok' });
}