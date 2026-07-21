importScripts(
  "session-summarizer.js",
  "diagnosis-engine.js",
  "recommendation-engine.js",
  "report-generator.js"
);

const SESSION_KEY = "recordingSession";
const API_KEY = "openaiApiKey";
let storageQueue = Promise.resolve();
let activeSemanticLabel = null;
let activeContext = null;
const contextDurations = {};

function queueStorageWork(work) {
  storageQueue = storageQueue.then(work, work);
  return storageQueue;
}

function isChatGPTDomain(domain) {
  return domain === "chatgpt.com" || domain.endsWith(".chatgpt.com") ||
    domain === "chat.openai.com";
}

function domainFromUrl(url) {
  if (!url) return null;

  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return null;
    return hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function getSession() {
  const { [SESSION_KEY]: session } = await chrome.storage.local.get(SESSION_KEY);
  return session || { isRecording: false, domains: [], events: [] };
}

async function recordUrlNow(url) {
  const domain = domainFromUrl(url);
  if (!domain) return;

  const session = await getSession();
  if (!session.isRecording) return;

  const lastDomain = session.domains.at(-1);
  if (lastDomain === domain) return;

  const enteredAt = Date.now();
  session.domains.push(domain);
  session.events = session.events || [];
  session.events.push({ domain, enteredAt });
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

function recordUrl(url) {
  return queueStorageWork(() => recordUrlNow(url));
}

async function recordTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await recordUrl(tab.url);
  } catch {
    // The tab may have closed before Chrome returned its details.
  }
}

async function updateSemanticContext(tabId) {
  const session = await getSession();
  if (!session.isRecording) return;

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "getSemanticLabel" });
    setActiveContext(tabId, response?.label || null);
  } catch {
    // Unsupported pages and tabs still loading do not have the analyzer available.
    setActiveContext(tabId, null);
  }
}

function setActiveContext(tabId, label) {
  const now = Date.now();
  if (activeContext) {
    const elapsed = Math.max(0, now - activeContext.startedAt);
    contextDurations[activeContext.label] = (contextDurations[activeContext.label] || 0) + elapsed;
  }
  activeSemanticLabel = label;
  activeContext = label ? { tabId, label, startedAt: now } : null;
}

function finishActiveContext() {
  if (activeContext) setActiveContext(activeContext.tabId, null);
}

async function getChatGPTContext() {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab || !isChatGPTDomain(domainFromUrl(activeTab.url) || "")) return null;
  try {
    return await chrome.tabs.sendMessage(activeTab.id, { type: "getChatGPTContext" });
  } catch {
    return null;
  }
}

async function runDiagnosis() {
  const { [API_KEY]: apiKey } = await chrome.storage.session.get(API_KEY);
  if (!apiKey) throw new Error("Enter your OpenAI Platform API key to run Smart analysis.");

  const session = await getSession();
  const endedAt = session.isRecording ? Date.now() : (session.endedAt || Date.now());
  const liveContextDurations = { ...contextDurations };
  if (activeContext) {
    liveContextDurations[activeContext.label] = (liveContextDurations[activeContext.label] || 0) +
      Math.max(0, endedAt - activeContext.startedAt);
  }
  const sessionSummary = SessionSummarizer.summarize(session, liveContextDurations, endedAt);
  sessionSummary.domainDurations = sessionSummary.domainDurations.slice(0, 5);
  sessionSummary.contextDurations = sessionSummary.contextDurations.slice(0, 5);
  sessionSummary.transitions = sessionSummary.transitions.slice(0, 5);
  let chatContext = await getChatGPTContext();
  const diagnosis = await DiagnosisEngine.diagnose({ apiKey, sessionSummary, chatContext });
  const recommendations = await RecommendationEngine.recommend(diagnosis.requiredCapabilities);
  const report = ReportGenerator.build(diagnosis, recommendations);
  chatContext = null;
  return report;
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void recordTab(tabId);
  void updateSemanticContext(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    void recordUrl(changeInfo.url);
  }

  if (changeInfo.status === "complete" && tab.active) {
    void updateSemanticContext(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "startRecording") {
    queueStorageWork(async () => {
      await chrome.storage.local.set({
        [SESSION_KEY]: { isRecording: true, domains: [], events: [], startedAt: Date.now() }
      });
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (activeTab) {
        await recordUrlNow(activeTab.url);
        void updateSemanticContext(activeTab.id);
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "stopRecording") {
    queueStorageWork(async () => {
      const session = await getSession();
      finishActiveContext();
      const results = calculateResults(session.domains);
      await chrome.storage.local.set({
        [SESSION_KEY]: { ...session, isRecording: false, endedAt: Date.now() },
        latestResults: results
      });
      sendResponse({ ok: true, results });
    });
    return true;
  }

  if (message.type === "getStatus") {
    getSession().then(async (session) => {
      const { latestResults = [] } = await chrome.storage.local.get("latestResults");
      sendResponse({
        isRecording: session.isRecording,
        hasCompletedSession: Boolean(session.endedAt),
        results: latestResults
      });
    });
    return true;
  }

  if (message.type === "setApiKey") {
    chrome.storage.session.set({ [API_KEY]: message.apiKey.trim() })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "runDiagnosis") {
    runDiagnosis()
      .then((report) => sendResponse({ ok: true, report }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

function calculateResults(domains) {
  const counts = new Map();

  for (let index = 1; index < domains.length; index += 1) {
    const previous = domains[index - 1];
    const current = domains[index];
    const previousIsChatGPT = isChatGPTDomain(previous);
    const currentIsChatGPT = isChatGPTDomain(current);

    if (previousIsChatGPT === currentIsChatGPT) continue;

    const externalDomain = previousIsChatGPT ? current : previous;
    counts.set(externalDomain, (counts.get(externalDomain) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, 3);
}
