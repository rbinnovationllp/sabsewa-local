# Demo Runbook

Use this runbook for the 3-minute hackathon video.

## Scene 1: Problem

Show a local shop owner and customer scenario:
- Shop owner does not want to type all inventory.
- Customer wants to order in natural language.
- Vendor may reject orders and needs polite support messaging.

## Scene 2: Gemini Inventory Capture

1. Open Vendor Inventory Capture.
2. Upload or capture shelf/list photo.
3. Show Gemini JSON result.
4. Show saved draft items.
5. Show `gemini_agent_logs` row.

## Scene 3: Gemini Conversational Ordering

1. Open customer order screen.
2. Enter: `2 kilo tamatar, 1 packet bread aur 1 liter doodh`.
3. Show Gemini-created cart.
4. Confirm order.

## Scene 4: Vendor Order Action

1. Open vendor dashboard.
2. Accept one order.
3. Reject another order.
4. Show Gemini smart rejection customer message.

## Scene 5: Evidence

Show:
- Supabase order row.
- Gemini audit logs.
- Gemini / Google AI Studio or Vertex AI usage evidence.
- Wallet transaction showing the Rs 15 platform fee linked to the accepted order.
- At least one vendor test/onboarding note.
- A short disclosure slide naming any reused older SabSewa prototype code or boilerplate.

## Final Pitch Line

SabSewa Local uses Gemini as the AI operating layer for small local shops: inventory capture, natural-language ordering, and customer support, while keeping vendors in control.
