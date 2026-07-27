import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { inventoryRouter } from "./routes/geminiInventory.js";
import { orderRouter } from "./routes/geminiOrder.js";
import { rejectionRouter } from "./routes/geminiRejection.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5001);

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "sabsewa-local-backend" });
});

app.use("/api/gemini/inventory", inventoryRouter);
app.use("/api/gemini/order", orderRouter);
app.use("/api/gemini/rejection", rejectionRouter);

app.listen(port, () => {
  console.log(`SabSewa Local backend running on http://localhost:${port}`);
});

