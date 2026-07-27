const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:5001";

export async function captureInventoryWithGemini(input: {
  imageBase64: string;
  mimeType: string;
  vendorId?: string;
  userId?: string;
}) {
  const response = await fetch(`${BACKEND_URL}/api/gemini/inventory/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return response.json();
}

export async function parseOrderWithGemini(input: {
  orderText: string;
  languageHint?: string;
  userId?: string;
  vendorId?: string;
}) {
  const response = await fetch(`${BACKEND_URL}/api/gemini/order/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return response.json();
}

export async function createSmartRejectionMessage(input: {
  orderId: string;
  vendorId?: string;
  userId?: string;
  vendorReason: string;
  customerLanguage?: string;
  unavailableItems?: string[];
}) {
  const response = await fetch(`${BACKEND_URL}/api/gemini/rejection/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return response.json();
}

