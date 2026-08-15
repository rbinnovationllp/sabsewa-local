import request from "supertest";
import express from "express";
import { inventoryRouter } from "../src/routes/geminiInventory";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use("/api/gemini/inventory", inventoryRouter);

describe("Bulk Product Catalogue Pipeline", () => {
  it("processes spreadsheet payload and sanitizes formula injection characters", async () => {
    const csvContent = Buffer.from(
      "Product name,Selling price,Unit\n=CMD|' /C calc'!A0,50,kg\nPotato,25,kg"
    ).toString("base64");

    const res = await request(app)
      .post("/api/gemini/inventory/spreadsheet")
      .send({
        fileBase64: csvContent,
        fileName: "inventory.csv",
        vendorId: "00000000-0000-0000-0000-000000000001",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.items[0].rawName.startsWith("'=")).toBe(true);
  });

  it("handles empty spreadsheet validation cleanly", async () => {
    const emptyCsv = Buffer.from("").toString("base64");

    const res = await request(app)
      .post("/api/gemini/inventory/spreadsheet")
      .send({
        fileBase64: emptyCsv,
        fileName: "empty.csv",
        vendorId: "00000000-0000-0000-0000-000000000001",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});