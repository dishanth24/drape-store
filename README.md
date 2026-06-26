# DRAPE — AI Fashion Store + WhatsApp Agent

A complete AI-powered clothing store with:
- Product catalogue with categories
- AI agent that recommends products when clicked
- WhatsApp bot that takes orders, answers questions, and tracks deliveries
- One-click deploy to Railway (free)

---

## What it does

| User action | AI agent does |
|---|---|
| Clicks a product | Reads stock, generates personalised recommendation |
| Asks a question | Answers using product context + conversation history |
| Messages on WhatsApp | Detects intent (browse/order/track), responds intelligently |
| Says "Order Midi Dress size M" | Creates order, deducts stock, sends confirmation |
| Says "Track my order" | Looks up their orders and replies with status |

---

## Deploy in 10 minutes

### Step 1 — Get your API keys (all free)

**Claude API key**
1. Go to https://console.anthropic.com
2. Sign up → API Keys → Create Key
3. Copy the key (starts with `sk-ant-`)

**Twilio WhatsApp (free sandbox)**
1. Go to https://twilio.com → Sign up free
2. Console → Messaging → Try WhatsApp
3. You get a sandbox number to test with
4. Note your: Account SID, Auth Token, Sandbox number (+14155238886)

---

### Step 2 — Deploy to Railway

1. Go to https://railway.app → Sign up with GitHub (free)
2. Click "New Project" → "Deploy from GitHub repo"
3. Upload this folder OR connect your GitHub repo
4. Railway auto-detects Node.js and deploys

**Set environment variables in Railway dashboard:**
```
CLAUDE_API_KEY      = sk-ant-your-actual-key
TWILIO_SID          = ACxxxxxxxxx
TWILIO_AUTH_TOKEN   = your_token
TWILIO_WHATSAPP_NUMBER = +14155238886
VERIFY_TOKEN        = any_secret_word
```

5. Railway gives you a public URL like: `https://drape-store-production.up.railway.app`

---

### Step 3 — Connect WhatsApp webhook

1. In Twilio → WhatsApp Sandbox Settings
2. Set webhook URL to: `https://your-railway-url.up.railway.app/webhook/whatsapp`
3. Method: POST
4. Save

Now WhatsApp messages → your server → AI agent → reply back!

---

### Step 4 — Test it

Send a WhatsApp message to your Twilio sandbox number:
- "Hi" → welcome message
- "Show me dresses" → browse agent responds
- "Order Midi Dress size M" → creates order
- "Track my order" → shows order status

---

## File structure

```
drape-store/
├── server.js          ← Main backend (Express + AI agent + WhatsApp)
├── public/
│   └── index.html     ← Frontend store website
├── package.json       ← Dependencies
├── railway.toml       ← Railway deploy config
└── .env.example       ← Environment variables template
```

---

## Upgrading for production

| Feature | Free option | Paid option |
|---|---|---|
| Database | JSON file / Supabase free tier | PostgreSQL on Railway |
| WhatsApp | Twilio sandbox | Interakt / WATI (₹1000/mo) |
| Payments | WhatsApp manual | Razorpay integration |
| Images | Emoji placeholders | Cloudinary free tier |
| Analytics | console.log | PostHog free tier |

---

## How the AI agent works (simplified)

```
User message arrives
        ↓
detectIntent() — is it browse / order / track / greet?
        ↓
Route to right sub-agent:
  browseAgent()  → Claude lists products + prices
  orderAgent()   → Parse product + size → create order → confirm
  trackOrder()   → Look up orders by phone number
  generalAgent() → Claude answers any question about the store
        ↓
Send reply to WhatsApp
```

Each sub-agent has its own system prompt tuned for that specific job.
That's the core idea of "agentic systems" — one router + many specialists.
