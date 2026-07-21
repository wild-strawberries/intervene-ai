const integrations = {
  "github.com": "GitHub integration",
  "gmail.com": "Gmail integration",
  "docs.google.com": "Google Docs integration",
  "slides.google.com": "Google Slides integration",
  "canva.com": "Canva integration"
};

const displayNames = {
  "github.com": "GitHub",
  "gmail.com": "Gmail",
  "docs.google.com": "Google Docs",
  "slides.google.com": "Google Slides",
  "canva.com": "Canva"
};

const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const status = document.querySelector("#status");
const resultsContainer = document.querySelector("#results");
const apiKeyInput = document.querySelector("#api-key");
const analyzeButton = document.querySelector("#analyze");
const reportContainer = document.querySelector("#report");
let hasCompletedSession = false;

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function renderResults(results) {
  resultsContainer.replaceChildren(document.createElement("h2"));
  resultsContainer.firstChild.textContent = "Session recommendation";

  if (!results.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No ChatGPT-to-site switches recorded yet.";
    resultsContainer.append(empty);
    return;
  }

  results.forEach(({ domain, count }) => {
    const item = document.createElement("p");
    item.className = "result";
    const name = displayNames[domain] || domain;
    const recommendation = integrations[domain]
      ? ` Recommended: ${integrations[domain]}.`
      : "";
    item.textContent = `You frequently switched between ChatGPT and ${name} (${count} ${count === 1 ? "time" : "times"}).${recommendation}`;
    resultsContainer.append(item);
  });
}

function updateControls(isRecording) {
  startButton.disabled = isRecording;
  stopButton.disabled = !isRecording;
  analyzeButton.disabled = isRecording || !hasCompletedSession;
  status.textContent = isRecording ? "Recording is active." : "Recording is stopped.";
}

function renderReport(report) {
  reportContainer.replaceChildren();
  const summary = document.createElement("p");
  summary.className = "result";
  summary.textContent = report.summary;
  reportContainer.append(summary);

  if (!report.steps.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No matching tools were found in the local catalog.";
    reportContainer.append(empty);
    return;
  }

  const intro = document.createElement("p");
  intro.className = "result";
  intro.textContent = "A faster workflow would be:";
  reportContainer.append(intro);
  const list = document.createElement("ol");
  report.steps.forEach((step) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = step.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = step.name;
    item.append(link, document.createTextNode(` — ${step.why}`));
    list.append(item);
  });
  reportContainer.append(list);
}

startButton.addEventListener("click", async () => {
  await sendMessage({ type: "startRecording" });
  hasCompletedSession = false;
  updateControls(true);
  renderResults([]);
  reportContainer.replaceChildren();
});

stopButton.addEventListener("click", async () => {
  const { results } = await sendMessage({ type: "stopRecording" });
  hasCompletedSession = true;
  updateControls(false);
  renderResults(results);
});

analyzeButton.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    reportContainer.textContent = "Enter your OpenAI Platform API key to run Smart analysis.";
    return;
  }

  analyzeButton.disabled = true;
  reportContainer.textContent = "Analyzing your privacy-safe session summary…";
  try {
    await sendMessage({ type: "setApiKey", apiKey });
    apiKeyInput.value = "";
    const response = await sendMessage({ type: "runDiagnosis" });
    if (!response.ok) throw new Error(response.error);
    renderReport(response.report);
  } catch (error) {
    reportContainer.textContent = error.message || "Workflow diagnosis could not be completed.";
  } finally {
    analyzeButton.disabled = false;
  }
});

async function initialize() {
  const statusResponse = await sendMessage({ type: "getStatus" });
  const { isRecording, results } = statusResponse;
  hasCompletedSession = statusResponse.hasCompletedSession;
  updateControls(isRecording);
  renderResults(results);
}

void initialize();
