import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { inventoryRouter } from "./routes/geminiInventory.js";
import { orderRouter } from "./routes/geminiOrder.js";
import { rejectionRouter } from "./routes/geminiRejection.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5001);
const rateLimitWindowMs = 60 * 1000;
const rateLimitMax = Number(process.env.API_RATE_LIMIT_PER_MINUTE || 120);
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function securityHeaders(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
}

function rateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  const now = Date.now();
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const key = `${ip}:${req.method}:${req.path}`;
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + rateLimitWindowMs });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > rateLimitMax) return res.status(429).json({ ok: false, error: "Too many requests. Please try again shortly." });
  return next();
}

app.use(securityHeaders);
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || true }));
app.use(rateLimiter);
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "sabsewa-local-backend" });
});

app.use("/api/gemini/inventory", inventoryRouter);
app.use("/api/gemini/order", orderRouter);
app.use("/api/gemini/rejection", rejectionRouter);

app.listen(port, () => {
  console.log(`SabSewa Local backend running on port ${port}`);
});


