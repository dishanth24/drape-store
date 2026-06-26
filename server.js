require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// ─── Product Database ──────────────────────────────────────────────────────────
const PRODUCTS = [
  { id: 1, cat: "Tops",        name: "Linen Shirt",  price: 1299, emoji: "👔", badge: "new",  stock: { S:5, M:3, L:8, XL:2 }, desc: "Breathable linen, relaxed fit. Perfect for summers." },
  { id: 2, cat: "Tops",        name: "Crop Tee",     price: 699,  emoji: "👕", badge: "hot",  stock: { XS:4, S:6, M:10, L:2 }, desc: "Soft cotton crop top. Available in 8 colours." },
  { id: 3, cat: "Tops",        name: "Blazer",       price: 2899, emoji: "🧥", badge: "",     stock: { S:2, M:4, L:3, XL:1 }, desc: "Structured blazer, slim fit. Office to evening." },
  { id: 4, cat: "Bottoms",     name: "Wide Pants",   price: 1599, emoji: "👖", badge: "new",  stock: { S:7, M:5, L:4 },        desc: "High-waist wide-leg trousers. Flowy fabric." },
  { id: 5, cat: "Bottoms",     name: "Mini Skirt",   price: 899,  emoji: "🩱", badge: "hot",  stock: { XS:3, S:5, M:6, L:3 }, desc: "Pleated mini skirt. Pairs with everything." },
  { id: 6, cat: "Bottoms",     name: "Denim",        price: 1899, emoji: "🩳", badge: "sale", stock: { S:2, M:1, L:4, XL:3 }, desc: "Classic straight-cut denim. Stone wash finish." },
  { id: 7, cat: "Dresses",     name: "Midi Dress",   price: 2199, emoji: "👗", badge: "new",  stock: { XS:2, S:4, M:6, L:3 }, desc: "Floral midi dress. Flowy and feminine." },
  { id: 8, cat: "Dresses",     name: "Co-ord Set",   price: 2499, emoji: "🩴", badge: "hot",  stock: { S:3, M:5, L:2 },        desc: "Matching set — top + skirt. Festival ready." },
  { id: 9, cat: "Accessories", name: "Tote Bag",     price: 799,  emoji: "👜", badge: "",     stock: { ONE:20 },               desc: "Canvas tote with zip. Daily carry staple." },
  { id: 10,cat: "Accessories", name: "Scarf",        price: 499,  emoji: "🧣", badge: "sale", stock: { ONE:15 },               desc: "Lightweight silk-feel scarf. Versatile styling." },
];

// Simple in-memory order store (use a DB like Supabase in production)
const ORDERS = [];
let orderCounter = 1000;

// ─── AI Agent Core ─────────────────────────────────────────────────────────────
async function callClaude(messages, systemPrompt) {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: systemPrompt,
      messages,
    },
    {
      headers: {
        "x-api-key": process.env.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    }
  );
  return response.data.content[0].text;
}

// ─── Agent: Product Recommendation ────────────────────────────────────────────
app.post("/api/agent/recommend", async (req, res) => {
  const { productId, conversationHistory = [] } = req.body;
  const product = PRODUCTS.find((p) => p.id === productId);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const availableSizes = Object.entries(product.stock)
    .filter(([, qty]) => qty > 0)
    .map(([size]) => size)
    .join(", ");

  const lowStock = Object.values(product.stock).reduce((a, b) => a + b, 0) < 10;

  const systemPrompt = `You are a friendly, stylish AI shopping assistant for DRAPE, a premium fashion store.
Product context:
- Name: ${product.name}
- Price: ₹${product.price.toLocaleString()}
- Category: ${product.cat}
- Description: ${product.desc}
- Available sizes: ${availableSizes}
- ${lowStock ? "LOW STOCK — mention urgency subtly" : "Good stock available"}

Rules:
1. Keep replies to 2-3 sentences max
2. Be warm, trendy, and helpful
3. If low stock, create gentle urgency
4. Suggest 1 complementary product from: ${PRODUCTS.filter(p => p.cat !== product.cat).map(p => p.name).slice(0,3).join(", ")}
5. Always mention the price naturally`;

  const messages =
    conversationHistory.length > 0
      ? conversationHistory
      : [{ role: "user", content: `I'm looking at the ${product.name}.` }];

  const reply = await callClaude(messages, systemPrompt);
  res.json({ reply, product, availableSizes: availableSizes.split(", "), lowStock });
});

// ─── Agent: WhatsApp Incoming Message Handler ──────────────────────────────────
app.post("/webhook/whatsapp", async (req, res) => {
  // Twilio / Interakt format — adjust to your provider
  const body = req.body;
  const from  = body.From  || body.from  || "unknown";
  const text  = body.Body  || body.body  || "";

  console.log(`[WhatsApp] From: ${from} | Message: ${text}`);

  if (!text.trim()) return res.sendStatus(200);

  // Detect intent
  const intent = detectIntent(text);
  console.log(`[Agent] Intent detected: ${intent}`);

  let replyText = "";

  if (intent === "browse") {
    replyText = await browseAgent(text);
  } else if (intent === "order") {
    replyText = await orderAgent(from, text);
  } else if (intent === "track") {
    replyText = trackOrder(from);
  } else if (intent === "greet") {
    replyText = `Hi! Welcome to DRAPE 👗\n\nI'm your AI stylist. I can help you:\n• Browse our collection\n• Check prices & sizes\n• Place an order\n• Track your delivery\n\nWhat are you looking for today?`;
  } else {
    replyText = await generalAgent(text);
  }

  // Send reply via WhatsApp (Twilio example)
  await sendWhatsAppReply(from, replyText);
  res.sendStatus(200);
});

// ─── WhatsApp Verification (Meta/Twilio webhook verify) ────────────────────────
app.get("/webhook/whatsapp", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("[Webhook] Verified successfully");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── Intent Detection ──────────────────────────────────────────────────────────
function detectIntent(text) {
  const t = text.toLowerCase();
  if (/hi|hello|hey|start|namaste/i.test(t))                          return "greet";
  if (/order|buy|purchase|add to cart|checkout/i.test(t))             return "order";
  if (/track|status|delivery|where is|shipped/i.test(t))              return "track";
  if (/show|browse|collection|dress|shirt|pant|skirt|bag|scarf/i.test(t)) return "browse";
  return "general";
}

// ─── Sub-agents ────────────────────────────────────────────────────────────────
async function browseAgent(userMessage) {
  const systemPrompt = `You are a shopping assistant for DRAPE fashion store. 
Available products with prices:
${PRODUCTS.map(p => `• ${p.name} (${p.cat}) — ₹${p.price.toLocaleString()} [${p.badge || "available"}]`).join("\n")}

Help the user find the right product. Keep reply under 5 lines. 
End with: "Reply with the product name to get more details and order!"`;

  const reply = await callClaude(
    [{ role: "user", content: userMessage }],
    systemPrompt
  );
  return reply;
}

async function orderAgent(from, userMessage) {
  // Check if user named a product
  const matched = PRODUCTS.find(p =>
    userMessage.toLowerCase().includes(p.name.toLowerCase())
  );

  if (!matched) {
    return `To place an order, just tell me:\n\n1. Product name\n2. Your size (XS/S/M/L/XL)\n3. Your delivery address\n\nExample: "Order Midi Dress size M, 123 MG Road Bangalore"`;
  }

  // Parse size from message
  const sizeMatch = userMessage.match(/\b(XS|S|M|L|XL|ONE)\b/i);
  const size = sizeMatch ? sizeMatch[1].toUpperCase() : null;

  if (!size) {
    const available = Object.keys(matched.stock).filter(s => matched.stock[s] > 0).join(", ");
    return `Great choice! The *${matched.name}* costs ₹${matched.price.toLocaleString()}.\n\nAvailable sizes: ${available}\n\nReply with your size to confirm the order.`;
  }

  if (!matched.stock[size] || matched.stock[size] < 1) {
    return `Sorry, size ${size} for ${matched.name} is out of stock. Available: ${Object.keys(matched.stock).filter(s => matched.stock[s] > 0).join(", ")}`;
  }

  // Create order
  const orderId = `DRAPE${++orderCounter}`;
  ORDERS.push({
    orderId, from,
    product: matched.name,
    size, price: matched.price,
    status: "confirmed",
    timestamp: new Date().toISOString(),
  });

  matched.stock[size]--;

  return `Order confirmed! 🎉\n\n*Order ID:* ${orderId}\n*Product:* ${matched.emoji} ${matched.name} (${size})\n*Amount:* ₹${matched.price.toLocaleString()}\n\nWe'll ship within 2-3 days. Track anytime by messaging "Track ${orderId}"`;
}

function trackOrder(from) {
  const userOrders = ORDERS.filter(o => o.from === from);
  if (!userOrders.length) return `No orders found for your number. Start shopping by browsing our collection!`;

  return userOrders.map(o =>
    `*${o.orderId}* — ${o.product} (${o.size})\nStatus: ${o.status === "confirmed" ? "Packed & ready to ship" : o.status}\nAmount: ₹${o.price.toLocaleString()}`
  ).join("\n\n");
}

async function generalAgent(userMessage) {
  const systemPrompt = `You are a helpful assistant for DRAPE, a fashion store.
Answer questions about fashion, styling, sizes, or store policies.
Keep replies short (2-3 sentences). Store hours: 9am-9pm, Mon-Sat.
Return/exchange policy: 7-day easy returns. Free delivery above ₹1500.`;

  return await callClaude([{ role: "user", content: userMessage }], systemPrompt);
}

// ─── Send WhatsApp Reply ───────────────────────────────────────────────────────
async function sendWhatsAppReply(to, message) {
  if (!process.env.TWILIO_SID) {
    console.log(`[WhatsApp Reply to ${to}]: ${message}`);
    return;
  }
  try {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`,
      new URLSearchParams({
        From: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        To: to,
        Body: message,
      }),
      {
        auth: { username: process.env.TWILIO_SID, password: process.env.TWILIO_AUTH_TOKEN },
      }
    );
  } catch (err) {
    console.error("[WhatsApp Send Error]", err.response?.data || err.message);
  }
}

// ─── REST APIs for the frontend ────────────────────────────────────────────────
app.get("/api/products", (req, res) => {
  const { cat } = req.query;
  const products = cat ? PRODUCTS.filter(p => p.cat === cat) : PRODUCTS;
  res.json(products);
});

app.get("/api/products/:id", (req, res) => {
  const product = PRODUCTS.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: "Not found" });
  res.json(product);
});

app.get("/api/orders", (req, res) => res.json(ORDERS));

app.listen(PORT, () => {
  console.log(`\n DRAPE AI Store running on port ${PORT}`);
  console.log(` Webhook: POST /webhook/whatsapp`);
  console.log(` Products API: GET /api/products`);
  console.log(` Agent API: POST /api/agent/recommend\n`);
});
