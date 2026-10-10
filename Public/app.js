
"use strict";

/* ==========================================
   DAVE NEXUS AI — FRONTEND APPLICATION
   Compatible with index.html, style.css
   and the Express server.js backend.
   ========================================== */

const $ = (selector) => document.querySelector(selector);

const elements = {
  sidebar: $("#sidebar"),
  openSidebar: $("#openSidebar"),
  closeSidebar: $("#closeSidebar"),
  newChat: $("#newChat"),
  homeButton: $("#homeButton"),
  historyButton: $("#historyButton"),
  historyList: $("#historyList"),
  clearChat: $("#clearChat"),
  chatViewport: $("#chatViewport"),
  welcomeScreen: $("#welcomeScreen"),
  messagesContainer: $("#messagesContainer"),
  chatForm: $("#chatForm"),
  messageInput: $("#messageInput"),
  sendButton: $("#sendButton"),
  sendIcon: $("#sendIcon"),
  toast: $("#toast")
};

const STORAGE_KEY = "dave-nexus-ai-chats-v1";
const MAX_SAVED_CHATS = 40;
const MAX_MESSAGES_PER_CHAT = 20;

// Current application state.
let chats = loadChats();
let activeChatId = null;
let isSending = false;
let toastTimer = null;

// Mobile sidebar backdrop.
const sidebarBackdrop = document.createElement("div");

sidebarBackdrop.id = "sidebarBackdrop";

Object.assign(sidebarBackdrop.style, {
  position: "fixed",
  inset: "0",
  zIndex: "15",
  background: "rgba(0, 0, 0, 0.58)",
  opacity: "0",
  visibility: "hidden",
  transition: "opacity 0.2s ease, visibility 0.2s ease"
});

document.body.appendChild(sidebarBackdrop);

// Start the application.
initialize();

/* ==========================================
   INITIALIZATION
   ========================================== */

function initialize() {
  renderHistory();
  renderConversation();

  elements.chatForm.addEventListener("submit", handleSubmit);

  elements.messageInput.addEventListener("input", autoResizeInput);

  elements.messageInput.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();

      if (!isSending) {
        elements.chatForm.requestSubmit();
      }
    }
  });

  elements.newChat.addEventListener("click", startNewChat);

  elements.homeButton.addEventListener("click", () => {
    startNewChat();
    closeSidebar();
  });

  elements.historyButton.addEventListener("click", () => {
    const historySection = document.querySelector(".history-section");

    historySection?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    if (window.innerWidth <= 640) {
      openSidebar();
    }
  });

  elements.clearChat.addEventListener("click", clearCurrentChat);

  elements.openSidebar.addEventListener("click", openSidebar);
  elements.closeSidebar.addEventListener("click", closeSidebar);
  sidebarBackdrop.addEventListener("click", closeSidebar);

  // Start a conversation from a suggestion card.
  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = button.getAttribute("data-prompt");

      if (prompt && !isSending) {
        elements.messageInput.value = prompt;
        autoResizeInput();
        elements.chatForm.requestSubmit();
      }
    });
  });

  // Restore a saved conversation from the sidebar.
  elements.historyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-id]");

    if (!button) return;

    openConversation(button.dataset.chatId);
  });

  // Keep the mobile sidebar closed when returning to desktop.
  window.addEventListener("resize", () => {
    if (window.innerWidth > 640) {
      closeSidebar();
    }
  });

  // Keyboard shortcut: Ctrl/Cmd + K starts a new chat.
  document.addEventListener("keydown", (event) => {
    const isMacShortcut = event.metaKey;
    const isWindowsShortcut = event.ctrlKey;

    if (
      (isMacShortcut || isWindowsShortcut) &&
      event.key.toLowerCase() === "k"
    ) {
      event.preventDefault();

      if (!isSending) {
        startNewChat();
        elements.messageInput.focus();
      }
    }

    if (event.key === "Escape") {
      closeSidebar();
    }
  });
}

/* ==========================================
   LOCAL CHAT STORAGE
   ========================================== */

function loadChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return [];

    const saved = JSON.parse(raw);

    if (!Array.isArray(saved)) return [];

    return saved
      .filter((chat) =>
        chat &&
        typeof chat.id === "string" &&
        Array.isArray(chat.messages)
      )
      .slice(0, MAX_SAVED_CHATS)
      .map((chat) => ({
        id: chat.id,
        title: cleanTitle(chat.title || "New conversation"),
        updatedAt: Number(chat.updatedAt) || Date.now(),
        messages: chat.messages
          .filter((message) =>
            message &&
            ["user", "assistant"].includes(message.role) &&
            typeof message.content === "string"
          )
          .slice(-MAX_MESSAGES_PER_CHAT)
          .map((message) => ({
            role: message.role,
            content: message.content.slice(0, 4000)
          }))
      }));
  } catch (error) {
    console.warn("Could not load saved conversations:", error);
    return [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(chats.slice(0, MAX_SAVED_CHATS))
    );
  } catch (error) {
    console.warn("Could not save conversations:", error);
    showToast("Browser storage is full. Your latest chat may not be saved.");
  }
}

function createChat() {
  return {
    id: createId(),
    title: "New conversation",
    updatedAt: Date.now(),
    messages: []
  };
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

function getActiveChat() {
  return chats.find((chat) => chat.id === activeChatId) || null;
}

function ensureActiveChat() {
  let chat = getActiveChat();

  if (!chat) {
    chat = createChat();
    chats.unshift(chat);
    activeChatId = chat.id;
  }

  return chat;
}

function cleanTitle(title) {
  return String(title)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "New conversation";
}

function updateChatTitle(chat) {
  const firstUserMessage = chat.messages.find(
    (message) => message.role === "user"
  );

  if (firstUserMessage) {
    chat.title = cleanTitle(firstUserMessage.content);
  }
}

function persistActiveChat() {
  const chat = getActiveChat();

  if (!chat) return;

  chat.updatedAt = Date.now();

  chats.sort((a, b) => b.updatedAt - a.updatedAt);
  chats = chats.slice(0, MAX_SAVED_CHATS);

  saveChats();
  renderHistory();
}

/* ==========================================
   CONVERSATION MANAGEMENT
   ========================================== */

function startNewChat() {
  if (isSending) {
    showToast("Please wait for the current reply to finish.");
    return;
  }

  activeChatId = null;

  renderConversation();
  updateNavigation("home");
  closeSidebar();

  elements.messageInput.value = "";
  autoResizeInput();
  elements.messageInput.focus();
}

function openConversation(chatId) {
  if (isSending) {
    showToast("Please wait for the current reply to finish.");
    return;
  }

  const chat = chats.find((item) => item.id === chatId);

  if (!chat) {
    showToast("That conversation could not be found.");
    renderHistory();
    return;
  }

  activeChatId = chat.id;

  renderConversation();
  renderHistory();
  updateNavigation("history");
  closeSidebar();

  elements.messageInput.value = "";
  autoResizeInput();
  elements.messageInput.focus();
}

function clearCurrentChat() {
  if (isSending) {
    showToast("Please wait for the current reply to finish.");
    return;
  }

  const chat = getActiveChat();

  if (!chat || chat.messages.length === 0) {
    startNewChat();
    return;
  }

  // Clear the current conversation without deleting other chats.
  chats = chats.filter((item) => item.id !== chat.id);
  activeChatId = null;

  saveChats();
  renderHistory();
  renderConversation();

  elements.messageInput.value = "";
  autoResizeInput();

  showToast("Current conversation cleared.");
}

function updateNavigation(active) {
  elements.homeButton.classList.toggle("active", active === "home");
  elements.historyButton.classList.toggle("active", active === "history");

  const homeDot = elements.homeButton.querySelector(".nav-dot");

  if (homeDot) {
    homeDot.style.display = active === "home" ? "" : "none";
  }
}

/* ==========================================
   RENDERING CONVERSATIONS
   ========================================== */

function renderConversation() {
  const chat = getActiveChat();
  const messages = chat ? chat.messages : [];

  elements.messagesContainer.replaceChildren();

  const hasMessages = messages.length > 0;

  elements.welcomeScreen.classList.toggle("hidden", hasMessages);
  elements.messagesContainer.classList.toggle("visible", hasMessages);

  for (const message of messages) {
    appendMessage(message.role, message.content, false);
  }

  scrollToBottom();
}

function appendMessage(role, content, scroll = true) {
  const message = document.createElement("article");
  message.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "D" : "✦";
  avatar.setAttribute("aria-hidden", "true");

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "message-content";

  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = role === "user" ? "YOU" : "DAVE NEXUS AI";

  const text = document.createElement("div");
  text.className = "message-text";

  // SECURITY: Never inject model output using innerHTML.
  // textContent treats the entire reply as text, not executable HTML.
  text.textContent = String(content);

  contentWrapper.append(name, text);
  message.append(avatar, contentWrapper);

  elements.messagesContainer.appendChild(message);

  if (scroll) {
    scrollToBottom();
  }

  return message;
}

function renderHistory() {
  elements.historyList.replaceChildren();

  const sortedChats = [...chats].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  if (sortedChats.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Your conversations will appear here.";
    elements.historyList.appendChild(empty);
    return;
  }

  for (const chat of sortedChats) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "history-item";
    button.dataset.chatId = chat.id;
    button.title = chat.title;

    if (chat.id === activeChatId) {
      button.classList.add("active");
      button.setAttribute("aria-current", "true");
    }

    const icon = document.createElement("span");
    icon.className = "history-item-icon";
    icon.textContent = "◷";
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "history-item-label";
    label.textContent = chat.title;

    button.append(icon, label);
    elements.historyList.appendChild(button);
  }
}

function showWelcomeScreen() {
  elements.welcomeScreen.classList.remove("hidden");
  elements.messagesContainer.classList.remove("visible");
}

function hideWelcomeScreen() {
  elements.welcomeScreen.classList.add("hidden");
  elements.messagesContainer.classList.add("visible");
}

/* ==========================================
   SEND CHAT REQUESTS
   ========================================== */

async function handleSubmit(event) {
  event.preventDefault();

  if (isSending) return;

  const userText = elements.messageInput.value.trim();

  if (!userText) {
    elements.messageInput.focus();
    return;
  }

  if (userText.length > 4000) {
    showToast("Your message is too long.");
    return;
  }

  const chat = ensureActiveChat();

  // The server accepts up to 20 total messages per request.
  // Start a fresh conversation if this one has reached the limit.
  if (chat.messages.length >= MAX_MESSAGES_PER_CHAT) {
    showToast("This chat is full. Start a new conversation.");
    return;
  }

  chat.messages.push({
    role: "user",
    content: userText
  });

  updateChatTitle(chat);
  persistActiveChat();

  hideWelcomeScreen();
  appendMessage("user", userText);

  elements.messageInput.value = "";
  autoResizeInput();

  setSending(true);

  const typingIndicator = createTypingIndicator();

  try {
    // Only send the latest 20 conversation messages.
    const messages = chat.messages
      .slice(-MAX_MESSAGES_PER_CHAT)
      .map((message) => ({
        role: message.role,
        content: message.content
      }));

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ messages })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : `Request failed (${response.status}). Please try again.`
      );
    }

    if (typeof data.reply !== "string" || !data.reply.trim()) {
      throw new Error("The AI returned an empty response. Please try again.");
    }

    const reply = data.reply.trim();

    chat.messages.push({
      role: "assistant",
      content: reply
    });

    chat.updatedAt = Date.now();

    persistActiveChat();

    typingIndicator.remove();
    appendMessage("assistant", reply);
  } catch (error) {
    typingIndicator.remove();

    console.error("DAVE NEXUS AI chat error:", error);

    const friendlyMessage =
      error instanceof TypeError
        ? "Could not reach the server. Check that DAVE NEXUS AI is running, then try again."
        : error.message || "Something went wrong. Please try again.";

    // Show errors safely as plain text.
    appendMessage("assistant", friendlyMessage);

    showToast("Message failed or the AI service is unavailable.");
  } finally {
    setSending(false);
    elements.messageInput.focus();
  }
}

/* ==========================================
   LOADING INDICATOR
   ========================================== */

function createTypingIndicator() {
  hideWelcomeScreen();

  const message = document.createElement("article");
  message.className = "message assistant";
  message.setAttribute("aria-label", "DAVE NEXUS AI is thinking");

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "✦";

  const content = document.createElement("div");
  content.className = "message-content";

  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = "DAVE NEXUS AI";

  const dots = document.createElement("div");
  dots.className = "typing-indicator";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    dots.appendChild(dot);
  }

  content.append(name, dots);
  message.append(avatar, content);

  elements.messagesContainer.appendChild(message);
  scrollToBottom();

  return message;
}

function setSending(sending) {
  isSending = sending;

  elements.sendButton.disabled = sending;
  elements.messageInput.disabled = sending;

  elements.sendIcon.textContent = sending ? "…" : "↑";

  elements.sendButton.setAttribute(
    "aria-label",
    sending ? "Waiting for AI response" : "Send message"
  );
}

/* ==========================================
   INPUT HELPERS
   ========================================== */

function autoResizeInput() {
  const input = elements.messageInput;

  input.style.height = "auto";

  const maxHeight = window.innerWidth <= 640 ? 130 : 180;

  input.style.height = Math.min(input.scrollHeight, maxHeight) + "px";
  input.style.overflowY =
    input.scrollHeight > maxHeight ? "auto" : "hidden";
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    elements.chatViewport.scrollTop =
      elements.chatViewport.scrollHeight;
  });
}

/* ==========================================
   MOBILE SIDEBAR
   ========================================== */

function openSidebar() {
  elements.sidebar.classList.add("open");

  sidebarBackdrop.style.visibility = "visible";
  sidebarBackdrop.style.opacity = "1";

  elements.openSidebar.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  elements.sidebar.classList.remove("open");

  sidebarBackdrop.style.opacity = "0";
  sidebarBackdrop.style.visibility = "hidden";

  elements.openSidebar.setAttribute("aria-expanded", "false");
}

/* ==========================================
   TOAST NOTIFICATIONS
   ========================================== */

function showToast(message) {
  clearTimeout(toastTimer);

  elements.toast.textContent = String(message);
  elements.toast.classList.add("show");

  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 3200);
}
