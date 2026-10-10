
require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Read JSON requests and serve the website.
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Limit repeated chat requests.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please wait a minute and try again."
  }
});

// Check whether the server is running.
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "DAVE NEXUS AI"
  });
});

// Send a message to the AI.
app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "API key is missing. Please configure the server's .env file."
      });
    }

    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Please send a message to continue."
      });
    }

    // Keep requests small and accept only text messages
    // from the user and assistant.
    if (messages.length > 20) {
      return res.status(400).json({
        error: "This conversation is too long. Start a new chat."
      });
    }

    const validMessages = messages.every((message) =>
      message &&
      typeof message.content === "string" &&
      ["user", "assistant"].includes(message.role) &&
      message.content.length <= 4000
    );

    if (!validMessages) {
      return res.status(400).json({
        error: "Invalid message format."
      });
    }

    
const conversation = [
  {
    role: "system",
    content:
      'Your name is DAVE NEXUS AI. You were created by a genius named "Dave Keyz". ' +
      'When someone asks your name, introduce yourself as DAVE NEXUS AI. ' +
      'When someone asks who created you, say you were created by the genius Dave Keyz. ' +
      'Be friendly, intelligent, creative, helpful, and honest. ' +
      'Do not introduce yourself as another AI brand unless the user asks about the underlying model. ' +
      'Give clear and accurate answers, and never claim abilities you do not have.'
  },
  ...messages
];


    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-OpenRouter-Title": "DAVE NEXUS AI"
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: conversation,
          temperature: 0.7,
          max_tokens: 1000
        }),
        signal: AbortSignal.timeout(60000)
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("OpenRouter API error:", response.status, data);

      return res.status(502).json({
        error:
          response.status === 401
            ? "The API key was rejected. Check your server configuration."
            : response.status === 402
            ? "The selected model or provider requires credits. Check your OpenRouter account and model availability."
            : response.status === 429
            ? "The AI service is busy or rate-limited. Please try again shortly."
            : "The AI service could not respond. Please try again later."
      });
    }

    const reply = data.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      console.error("Unexpected AI response:", data);

      return res.status(502).json({
        error: "The AI returned an empty response. Please try again."
      });
    }

    return res.json({ reply: reply.trim() });
  } catch (error) {
    console.error("Chat request failed:", error.message);

    return res.status(500).json({
      error:
        error.name === "TimeoutError"
          ? "The AI took too long to respond. Please try again."
          : "DAVE NEXUS AI could not respond. Please try again."
    });
  }
});

// Handle unknown API routes.
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found." });
});

app.listen(PORT, () => {
  console.log(`DAVE NEXUS AI is running at http://localhost:${PORT}`);
});
