import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

// --- ROUTES ---
import catalogRoutes from "./catalog/catalogRoutes.js";
import catalogueSetupRoutes from "./catalog/catalogueSetupRoutes.js";
import inventoryRoutes from "./catalog/inventoryRoutes.js";

import creditNotificationsRouter from "./hyperwallet/creditNotifications.js";
import placeOrderRoutes from "./hyperlocal/placeOrder.js";
import orderHistoryRoutes from "./hyperlocal/orderHistory.js";
import vendorOrderActions from "./hyperlocal/vendorOrderActions.js";
import discoveryRoutes from "./hyperlocal/discoveryRoutes.js";
import pricingRoutes from "./hyperlocal/pricingRoutes.js";
import availabilityRoutes from "./hyperlocal/availabilityRoutes.js";
import deliverySettingsRoutes from "./hyperlocal/deliverySettingsRoutes.js";
import vendorOnboardingRouter from "./vendor/onboardingRoutes.js";
import platformBillingRouter from "./billing/platformBillingRoutes.js";
import securityWalletRouter from "./securityWallet/securityWalletRoutes.js";
import vendorCreditRouter from "./credit/vendorCreditRoutes.js";
import geminiRouter from "./gemini/geminiRoutes.js";
import s3Router from "./storage/s3Routes.js";
import deliveryRoutes from "./delivery/deliveryRoutes.js";
import riderLocationRouter from "./routes/riderLocation.js";
import riderRoutes from "./rider/riderRoutes.js";
import deliveryAssignRouter from "./routes/deliveryAssign.js";
import riderListRouter from "./routes/riders.js";
import pendingOrderRouter from "./routes/orders.js";
import riderActionsRouter from "./routes/riderActions.js";
import deviceAuthRouter from "./auth/deviceRoutes.js";
import masterAdminRouter from "./auth/masterAdminRoutes.js";
import vendorDirectoryRouter from "./company/vendorDirectoryRoutes.js";
import { getPaymentReadiness } from "./payments/paymentEnvironment.js";
import razorpayWebhookRouter from "./payments/razorpayWebhookRoutes.js";
import supabaseWebhookRouter from "./webhooks/supabaseWebhookRoutes.js";
import webPushRouter from "./notifications/webPushRoutes.js";
import notificationRoutes from "./notifications/notificationRoutes.js";
import partnerRouter from "./partner/partnerRoutes.js";
import settlementRouter from "./settlement/settlementRoutes.js";
import { createRateLimiter, securityHeaders } from "./security/apiSecurity.js";

// Database connection
import { supabase } from "./connection.js";

// --- INITIALIZE EXPRESS APP FIRST ---
const app = express();

// --- MIDDLEWARE ---
app.use(securityHeaders);
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || true }));
app.use("/api/payments", razorpayWebhookRouter);
app.use("/api/webhooks", razorpayWebhookRouter);
app.use("/api/webhooks", supabaseWebhookRouter);
app.use(createRateLimiter({ windowMs: 60 * 1000, max: Number(process.env.API_RATE_LIMIT_PER_MINUTE || 180), keyPrefix: "sabsewa" }));
app.use(express.json({ limit: "2mb" }));

// --- ROUTE MOUNTING ---
app.use("/api/notifications", notificationRoutes);
app.use("/api/notifications", webPushRouter);

app.use("/api/rider", riderRoutes);
app.use("/api/hyperwallet/credit", creditNotificationsRouter);

app.use("/api/catalog", catalogRoutes);
app.use("/api/catalog", catalogueSetupRoutes);
app.use("/api/inventory", inventoryRoutes);

app.use("/api/order", placeOrderRoutes);
app.use("/api/order", orderHistoryRoutes);
app.use("/api/vendor/orders", vendorOrderActions);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/vendor/pricing", pricingRoutes);
app.use("/api/vendor/availability", availabilityRoutes);
app.use("/api/vendor/delivery-settings", deliverySettingsRoutes);
app.use("/api/vendor/onboarding", vendorOnboardingRouter);
app.use("/api/vendor/billing", platformBillingRouter);
app.use("/api/vendor/security-wallet", securityWalletRouter);
app.use("/api/vendor/credit", vendorCreditRouter);
app.use("/api/gemini", geminiRouter);
app.use("/api/storage/s3", s3Router);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/rider", riderLocationRouter);
app.use("/api/vendor/assign-delivery", deliveryAssignRouter);
app.use("/api/riders", riderListRouter);
app.use("/api/orders", pendingOrderRouter);
app.use("/api/rider", riderActionsRouter);
app.use("/api/auth", deviceAuthRouter);
app.use("/api/admin/master", masterAdminRouter);
app.use("/api/company", vendorDirectoryRouter);
app.use("/api/partner", partnerRouter);
app.use("/api/settlement", settlementRouter);

// --- HEALTH CHECK & ENVIRONMENT ENDPOINTS ---
app.get("/", (req, res) => {
  res.json({ status: "SabSewa Backend is running" });
});

app.get("/api/admin/payment-environment", (req, res) => {
  res.json({ success: true, payment_environment: getPaymentReadiness() });
});

// --- AUTOMATED CRON JOBS ---
try {
  await import("./cron/reminders.js");
  console.log("Cron jobs loaded");
} catch (err) {
  console.log("No cron jobs loaded");
}

// --- SERVER START ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`SabSewa Backend running on port ${PORT}`);
});