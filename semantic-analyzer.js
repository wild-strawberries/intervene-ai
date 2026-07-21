function hasElement(selector) {
  return Boolean(document.querySelector(selector));
}

function getSemanticLabel() {
  const hostname = window.location.hostname.toLowerCase();
  const path = window.location.pathname;

  if (hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com") || hostname === "chat.openai.com") {
    return hasElement("main") ? "ChatGPT conversation" : "ChatGPT workspace";
  }

  if (hostname === "github.com") {
    if (path.includes("/pull/")) return "GitHub pull request";
    if (path.includes("/issues/")) return "GitHub issue";
    if (hasElement("[data-testid='repository-container-header']")) return "GitHub repository";
    return "GitHub page";
  }

  if (hostname === "mail.google.com") {
    if (hasElement("[role='main'] [role='listitem']")) return "Gmail inbox";
    if (hasElement("[role='main'] [role='article']")) return "Gmail email";
    return "Gmail";
  }

  if (hostname === "docs.google.com") {
    return hasElement(".kix-appview-editor") ? "Google document" : "Google Docs";
  }

  if (hostname === "slides.google.com") {
    return hasElement(".sketchy-text-editor, .punch-filmstrip-scroll")
      ? "Google presentation"
      : "Google Slides";
  }

  if (hostname === "canva.com" || hostname.endsWith(".canva.com")) {
    return hasElement("[data-testid='editor']") ? "Canva design" : "Canva workspace";
  }

  return "Unsupported page";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "getSemanticLabel") {
    // Only the computed label leaves the page; no text, markup, title, or URL is sent.
    sendResponse({ label: getSemanticLabel() });
  }

  if (message.type === "getChatGPTContext") {
    sendResponse(getChatGPTContext());
  }
});

function getChatGPTContext() {
  const hostname = window.location.hostname.toLowerCase();
  const isChatGPT = hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com") || hostname === "chat.openai.com";
  if (!isChatGPT) return null;

  const messages = [...document.querySelectorAll("[data-message-author-role]")];
  const userMessages = messages.filter((message) => message.dataset.messageAuthorRole === "user");
  const assistantMessages = messages.filter((message) => message.dataset.messageAuthorRole === "assistant");
  const recentUserContext = userMessages
    .slice(-2)
    .map((message) => (message.textContent || "").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 450);

  return {
    conversationLength: messages.length,
    userTurns: userMessages.length,
    assistantResponses: assistantMessages.length,
    assistantResponseCharacters: assistantMessages.reduce((total, message) => total + (message.textContent || "").length, 0),
    regenerationControls: document.querySelectorAll("[data-testid*='regenerate'], button[aria-label*='Regenerate']").length,
    editControls: document.querySelectorAll("[data-testid*='edit'], button[aria-label*='Edit']").length,
    // This short excerpt is created only when the user explicitly requests diagnosis.
    // It is never persisted by the extension.
    taskExcerpt: recentUserContext
  };
}
