import crypto from "crypto";
import express from "express";
import { supabase } from "../connection.js";
import { requireUserJwt } from "../security/apiSecurity.js";

const router = express.Router();
const requireAuth = requireUserJwt(supabase);

const MESSAGE_TYPES = new Set([
  "TEXT",
  "CLARIFICATION_REQUEST",
  "AVAILABILITY_RESPONSE",
  "ALTERNATIVE_PROPOSAL",
  "PARTIAL_AVAILABILITY",
  "PRICE_CHANGE_NOTICE",
  "CUSTOMER_DECISION",
  "SYSTEM_MESSAGE",
  "ORDER_EXPIRED",
]);

const CONTACT_PATTERNS = [
  { type: "phone", pattern: /(?:\+?\d[\s().-]*){10,}/g },
  { type: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { type: "whatsapp_or_external_link", pattern: /\b(?:https?:\/\/|wa\.me\/|api\.whatsapp\.com|t\.me\/|telegram\.me\/|instagram\.com\/|facebook\.com\/)\S+/gi },
  { type: "upi_or_external_payment", pattern: /\b[a-z0-9._-]{2,}@[a-z]{2,}\b/gi },
  { type: "qr_or_payment_link", pattern: /\b(?:upi:\/\/|paytm|phonepe|gpay|googlepay|bharatpe|qr code|scan this)\b/gi },
];

function clean(value) {
  return String(value || "").trim();
}

function hashMessage(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function detectBlockedContent(message) {
  const text = clean(message);
  const matches = [];
  let sanitized = text;

  for (const item of CONTACT_PATTERNS) {
    sanitized = sanitized.replace(item.pattern, (value) => {
      matches.push({ type: item.type, value: String(value).slice(0, 80) });
      return "[blocked direct-contact detail]";
    });
  }

  return {
    blocked: matches.length > 0,
    matches,
    sanitized,
  };
}

function safeActorRole(order, userId, explicitRole) {
  const requested = clean(explicitRole).toLowerCase();
  if (requested === "customer" && order.customer_id === userId) return "customer";
  return "vendor";
}

async function loadOrderForActor(orderId, auth) {
  const { data: order, error } = await supabase
    .from("hyperlocal_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) {
    const err = new Error("Order not found.");
    err.statusCode = 404;
    throw err;
  }

  const isCustomer = order.customer_id === auth.user_id;
  const isAdmin = ["master_admin", "super_admin", "company_admin", "admin"].includes(String(auth.role || ""));

  let vendor = null;
  let isVendorOwner = false;
  if (order.vendor_id) {
    const { data: vendorData, error: vendorError } = await supabase
      .from("vendors")
      .select("id, owner_user_id, shop_name, locality, category")
      .eq("id", order.vendor_id)
      .maybeSingle();
    if (vendorError) throw vendorError;
    vendor = vendorData;
    isVendorOwner = vendor?.owner_user_id === auth.user_id;
  }

  if (!isCustomer && !isVendorOwner && !isAdmin) {
    const err = new Error("You are not authorized to access this order conversation.");
    err.statusCode = 403;
    throw err;
  }

  return { order, vendor, isCustomer, isVendorOwner, isAdmin };
}

async function ensureConversation(order, vendor = null) {
  const expiresAt = order.vendor_response_deadline_at || null;
  const { data: existing, error: existingError } = await supabase
    .from("order_conversations")
    .select("*")
    .eq("order_id", order.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("order_conversations")
    .insert({
      order_id: order.id,
      vendor_id: order.vendor_id,
      terminal_id: order.terminal_id || null,
      customer_id: order.customer_id,
      status: order.status === "accepted" ? "accepted_order_coordination" : "open",
      pre_acceptance_privacy_locked: order.status !== "accepted",
      expires_at: expiresAt,
      metadata: {
        customer_identity: "Customer",
        vendor_display_name: vendor?.shop_name || "Verified SabSewa Local shop",
        vendor_locality: vendor?.locality || null,
        privacy_rule: "No phone, address, email, UPI, WhatsApp or external payment/contact sharing before final vendor acceptance.",
      },
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function writeConversationAudit({ conversation, order, actor, action, metadata = {} }) {
  await supabase.from("conversation_audit_log").insert({
    conversation_id: conversation?.id || null,
    order_id: order?.id || null,
    actor_user_id: actor?.user_id || null,
    actor_role: actor?.role || null,
    action,
    metadata,
  });
}

async function insertSystemDeliveryStatus(message, recipientRole) {
  await supabase.from("message_delivery_status").insert({
    message_id: message.id,
    recipient_role: recipientRole,
    delivery_status: "queued",
    metadata: {
      notification_preview: "New SabSewa Local order message",
      sensitive_preview_suppressed: true,
    },
  });
}

router.get("/orders/:order_id/conversation", requireAuth, async (req, res) => {
  try {
    const { order, vendor, isCustomer } = await loadOrderForActor(req.params.order_id, req.auth);
    const conversation = await ensureConversation(order, vendor);

    const { data: messages, error: messageError } = await supabase
      .from("order_messages")
      .select("id, sender_role, message_type, template_code, body_sanitized, status, created_at, metadata")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (messageError) throw messageError;

    const { data: proposals, error: proposalError } = await supabase
      .from("alternative_proposals")
      .select("*, alternative_proposal_items(*)")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (proposalError) throw proposalError;

    await writeConversationAudit({
      conversation,
      order,
      actor: req.auth,
      action: "conversation_view",
      metadata: { actor_view: isCustomer ? "customer" : "vendor_or_admin" },
    });

    return res.json({
      success: true,
      conversation: {
        ...conversation,
        customer_display_name: "Customer",
        customer_contact_hidden: conversation.pre_acceptance_privacy_locked,
        vendor_display_name: vendor?.shop_name || conversation.metadata?.vendor_display_name || "Verified SabSewa Local shop",
        vendor_locality: vendor?.locality || conversation.metadata?.vendor_locality || null,
      },
      messages: messages || [],
      alternative_proposals: proposals || [],
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message || "Unable to load order conversation." });
  }
});

router.post("/orders/:order_id/conversation/messages", requireAuth, async (req, res) => {
  try {
    const { order, vendor } = await loadOrderForActor(req.params.order_id, req.auth);
    const conversation = await ensureConversation(order, vendor);
    if (conversation.status === "expired") {
      return res.status(409).json({ success: false, error: "This order conversation has expired." });
    }

    const body = clean(req.body?.body);
    if (!body) return res.status(400).json({ success: false, error: "Message text is required." });

    const messageType = MESSAGE_TYPES.has(clean(req.body?.message_type).toUpperCase())
      ? clean(req.body?.message_type).toUpperCase()
      : "TEXT";
    const senderRole = safeActorRole(order, req.auth.user_id, req.body?.sender_role);
    const detected = detectBlockedContent(body);

    if (detected.blocked) {
      await supabase.from("blocked_contact_sharing_events").insert({
        conversation_id: conversation.id,
        order_id: order.id,
        actor_user_id: req.auth.user_id,
        actor_role: senderRole,
        detection_type: detected.matches.map((item) => item.type).join(","),
        original_preview: body.slice(0, 160),
        sanitized_preview: detected.sanitized.slice(0, 160),
        metadata: { matches: detected.matches, message_type: messageType },
      });
      await writeConversationAudit({
        conversation,
        order,
        actor: req.auth,
        action: "blocked_contact_sharing_attempt",
        metadata: { sender_role: senderRole, matches: detected.matches.map((item) => item.type) },
      });
      return res.status(400).json({
        success: false,
        error: "For your privacy and security, direct contact details cannot be exchanged before the vendor accepts the order. Please continue this conversation within SabSewa Local.",
      });
    }

    const { data: message, error } = await supabase
      .from("order_messages")
      .insert({
        conversation_id: conversation.id,
        order_id: order.id,
        sender_user_id: req.auth.user_id,
        sender_role: senderRole,
        message_type: messageType,
        template_code: clean(req.body?.template_code) || null,
        body,
        body_sanitized: detected.sanitized,
        immutable_hash: hashMessage(`${conversation.id}:${req.auth.user_id}:${body}:${Date.now()}`),
        metadata: {
          privacy_locked: conversation.pre_acceptance_privacy_locked,
          fee_triggered: false,
          direct_contact_block_checked: true,
        },
      })
      .select()
      .single();
    if (error) throw error;

    await supabase
      .from("order_conversations")
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    await insertSystemDeliveryStatus(message, senderRole === "customer" ? "vendor" : "customer");
    await writeConversationAudit({
      conversation,
      order,
      actor: req.auth,
      action: "message_sent",
      metadata: { message_id: message.id, sender_role: senderRole, message_type: messageType, fee_triggered: false },
    });

    return res.json({ success: true, message: { ...message, body: message.body_sanitized } });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message || "Unable to send order message." });
  }
});

router.post("/orders/:order_id/conversation/alternative-proposals", requireAuth, async (req, res) => {
  try {
    const { order, vendor, isVendorOwner, isAdmin } = await loadOrderForActor(req.params.order_id, req.auth);
    if (!isVendorOwner && !isAdmin) {
      return res.status(403).json({ success: false, error: "Only the assigned vendor can propose alternatives for this order." });
    }
    if (order.status !== "pending") {
      return res.status(409).json({ success: false, error: "Alternatives can be proposed only before final order acceptance." });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, error: "At least one alternative item is required." });

    const conversation = await ensureConversation(order, vendor);
    const note = clean(req.body?.message || "Please review the suggested alternative.");
    const detected = detectBlockedContent(note);
    if (detected.blocked) {
      await supabase.from("blocked_contact_sharing_events").insert({
        conversation_id: conversation.id,
        order_id: order.id,
        actor_user_id: req.auth.user_id,
        actor_role: "vendor",
        detection_type: detected.matches.map((item) => item.type).join(","),
        original_preview: note.slice(0, 160),
        sanitized_preview: detected.sanitized.slice(0, 160),
        metadata: { proposal_blocked: true },
      });
      return res.status(400).json({
        success: false,
        error: "For your privacy and security, direct contact details cannot be exchanged before the vendor accepts the order. Please continue this conversation within SabSewa Local.",
      });
    }

    const { data: proposal, error: proposalError } = await supabase
      .from("alternative_proposals")
      .insert({
        conversation_id: conversation.id,
        order_id: order.id,
        vendor_id: order.vendor_id,
        proposed_by_user_id: req.auth.user_id,
        metadata: {
          fee_triggered: false,
          customer_details_unlocked: false,
          medical_disclaimer_required: Boolean(req.body?.medical_disclaimer_required),
        },
      })
      .select()
      .single();
    if (proposalError) throw proposalError;

    const normalizedItems = items.map((item) => ({
      proposal_id: proposal.id,
      original_item: clean(item.original_item || item.originalItem || item.name),
      suggested_item: clean(item.suggested_item || item.suggestedItem),
      brand_or_variety: clean(item.brand_or_variety || item.brand) || null,
      pack_size: clean(item.pack_size || item.packSize || item.quantity) || null,
      available_quantity: item.available_quantity == null ? null : Number(item.available_quantity),
      price_amount: item.price_amount == null ? null : Number(item.price_amount),
      product_image_path: clean(item.product_image_path || item.productImagePath) || null,
      substitution_reason: clean(item.substitution_reason || item.reason) || null,
      medicine_composition: clean(item.medicine_composition || item.composition) || null,
      requires_review: Boolean(item.requires_review),
    })).filter((item) => item.original_item && item.suggested_item);

    if (!normalizedItems.length) {
      return res.status(400).json({ success: false, error: "Each alternative must include original item and suggested item." });
    }

    const { error: itemError } = await supabase.from("alternative_proposal_items").insert(normalizedItems);
    if (itemError) throw itemError;

    const { data: message, error: messageError } = await supabase
      .from("order_messages")
      .insert({
        conversation_id: conversation.id,
        order_id: order.id,
        sender_user_id: req.auth.user_id,
        sender_role: "vendor",
        message_type: "ALTERNATIVE_PROPOSAL",
        body: note,
        body_sanitized: detected.sanitized,
        immutable_hash: hashMessage(`${conversation.id}:${proposal.id}:${note}`),
        metadata: { proposal_id: proposal.id, fee_triggered: false, customer_details_unlocked: false },
      })
      .select()
      .single();
    if (messageError) throw messageError;

    await insertSystemDeliveryStatus(message, "customer");
    await writeConversationAudit({
      conversation,
      order,
      actor: req.auth,
      action: "alternative_proposal_sent_without_fee",
      metadata: { proposal_id: proposal.id, item_count: normalizedItems.length },
    });

    return res.json({ success: true, proposal, items: normalizedItems, fee_triggered: false, customer_details_unlocked: false });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message || "Unable to create alternative proposal." });
  }
});

export default router;
