import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";

// --- ROUTES ---
import catalogRoutes from "./catalog/catalogRoutes.js";
import inventoryRoutes from "./catalog/inventoryRoutes.js";

import creditNotificationsRouter from "./hyperwallet/creditNotifications.js";
import placeOrderRoutes from "./hyperlocal/placeOrder.js";
import orderHistoryRoutes from "./hyperlocal/orderHistory.js";
import vendorOrderActions from "./hyperlocal/vendorOrderActions.js";
import discoveryRoutes from "./hyperlocal/discoveryRoutes.js";
import pricingRoutes from "./hyperlocal/pricingRoutes.js";
import availabilityRoutes from "./hyperlocal/availabilityRoutes.js";
import deliverySettingsRoutes from "./hyperlocal/deliverySettingsRoutes.js";
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
import vendorDirectoryRouter from "./company/vendorDirectoryRoutes.js";
import { getPaymentReadiness } from "./payments/paymentEnvironment.js";
import razorpayWebhookRouter from "./payments/razorpayWebhookRoutes.js";
import webPushRouter from "./notifications/webPushRoutes.js";
// Database connection
import { supabase } from "./connection.js";

const app = express();

// Middleware
app.use(cors());
app.use("/api/payments", razorpayWebhookRouter);
app.use(express.json());

// --- ROUTE MOUNTING ---
app.use("/api/rider", riderRoutes);
app.use("/api/hyperwallet/credit", creditNotificationsRouter);

app.use("/api/catalog", catalogRoutes);
app.use("/api/inventory", inventoryRoutes);

app.use("/api/order", placeOrderRoutes);
app.use("/api/order", orderHistoryRoutes);
app.use("/api/vendor/orders", vendorOrderActions);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/vendor/pricing", pricingRoutes);
app.use("/api/vendor/availability", availabilityRoutes);
app.use("/api/vendor/delivery-settings", deliverySettingsRoutes);
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
app.use("/api/company", vendorDirectoryRouter);
app.use("/api/notifications", webPushRouter);
// Health Check
app.get("/", (req, res) => {
  res.json({ status: "SabSewa Backend is running 🚀" });
});

app.get("/api/admin/payment-environment", (req, res) => {
  res.json({ success: true, payment_environment: getPaymentReadiness() });
});

// --- OPTIONAL: AUTOMATED CRON JOBS ---
// (Only import AFTER all routes & BEFORE listen)
try {
  await import("./cron/reminders.js");
  console.log("⏱️ Cron Jobs Loaded");
} catch (err) {
  console.log("⚠️ No cron folder found — skipping reminder jobs");
}

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🔥 SabSewa Backend running at http://localhost:${PORT}`);
});
