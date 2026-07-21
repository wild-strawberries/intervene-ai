import http from "node:http";

const port = Number(process.env.PORT || 8787);
const openAIKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-5";
const allowedOrigin = process.env.ALLOWED_EXTENSION_ORIGIN || "*";
const maxRequestsPerHour = Number(process.env.RATE_LIMIT_PER_HOUR || 20);
const requestsByClient = new Map();

if (!openAIKey) {
  throw new Error("OPENAI_API_KEY must be set on the server.");
}

const server = http.createServer(async (request, response) => {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/diagnose") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  if (!isAllowedOrigin(request.headers.origin)) {
    sendJson(response, 403, { error: "This extension origin is not allowed." });
    return;
  }

  const clientId = request.headers["x-interveneai-client"];
  if (typeof clientId !== "string" || !/^[a-z0-9-]{20,80}$/i.test(clientId)) {
    sendJson(response, 400, { error: "A valid client identifier is required." });
    return;
  }

  if (!allowRequest(clientId)) {
    sendJson(response, 429, { error: "Smart analysis limit reached. Try again later." });
    return;
  }

  try {
    const body = await readJson(request);
    const input = validateDiagnosisInput(body);
    const diagnosis = await createDiagnosis(input);
    sendJson(response, 200, { diagnosis });
  } catch (error) {
    const status = error.statusCode || 500;
    const message = status === 500 ? "Smart analysis could not be completed." : error.message;
    sendJson(response, status, { error: message });
  }
});

server.listen(port, () => {
  console.log(`InterveneAI diagnosis API listening on port ${port}`);
});

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin === "*" ? "*" : allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-InterveneAI-Client");
  response.setHeader("Vary", "Origin");
}

function isAllowedOrigin(origin) {
  return allowedOrigin === "*" || origin === allowedOrigin;
}

function allowRequest(clientId) {
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const timestamps = (requestsByClient.get(clientId) || []).filter((timestamp) => timestamp > windowStart);
  if (timestamps.length >= maxRequestsPerHour) return false;
  timestamps.push(now);
  requestsByClient.set(clientId, timestamps);
  return true;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 12_000) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        const error = new Error("Request body must be valid JSON.");
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function validateDiagnosisInput(body) {
  if (!body || typeof body !== "object") return invalid("Invalid diagnosis request.");
  const sessionSummary = body.sessionSummary;
  if (!sessionSummary || typeof sessionSummary !== "object") return invalid("Session summary is required.");

  return {
    session_summary: {
      sessionDurationMs: finiteNumber(sessionSummary.sessionDurationMs),
      domainDurations: limitedEntries(sessionSummary.domainDurations),
      contextDurations: limitedEntries(sessionSummary.contextDurations),
      transitions: limitedEntries(sessionSummary.transitions)
    },
    chatgpt_metadata: body.chatContext ? {
      conversation_length: finiteNumber(body.chatContext.conversationLength),
      user_turns: finiteNumber(body.chatContext.userTurns),
      assistant_responses: finiteNumber(body.chatContext.assistantResponses),
      assistant_response_length_estimate: finiteNumber(body.chatContext.assistantResponseCharacters),
      regeneration_controls_seen: finiteNumber(body.chatContext.regenerationControls),
      edit_controls_seen: finiteNumber(body.chatContext.editControls),
      task_excerpt: typeof body.chatContext.taskExcerpt === "string" ? body.chatContext.taskExcerpt.slice(0, 450) : ""
    } : null
  };
}

function limitedEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, 5).map((entry) => ({
    name: String(entry.name || entry.domain || "").slice(0, 100),
    seconds: finiteNumber(entry.seconds),
    count: finiteNumber(entry.count)
  }));
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

async function createDiagnosis(input) {
  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openAIKey}`
    },
    body: JSON.stringify({
      model,
      store: false,
      text: { format: diagnosisSchema },
      max_output_tokens: 300,
      input: [
        {
          role: "developer",
          content: "Diagnose productivity workflows from the supplied compact summary. Infer cautiously and do not invent facts."
        },
        { role: "user", content: JSON.stringify(input) }
      ]
    })
  });

  const payload = await apiResponse.json();
  if (!apiResponse.ok) {
    const error = new Error(payload?.error?.message || "The diagnosis provider rejected the request.");
    error.statusCode = 502;
    throw error;
  }

  const text = payload.output?.flatMap((item) => item.content || [])
    .find((item) => item.type === "output_text")?.text;
  if (!text) {
    const error = new Error("The diagnosis provider returned no usable result.");
    error.statusCode = 502;
    throw error;
  }
  return JSON.parse(text);
}

const diagnosisSchema = {
  type: "json_schema",
  name: "workflow_diagnosis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      workflow: { type: "string" },
      bottleneck: { type: "string" },
      requiredCapabilities: { type: "array", items: { type: "string" }, maxItems: 3 },
      confidence: { type: "string", enum: ["low", "medium", "high"] }
    },
    required: ["workflow", "bottleneck", "requiredCapabilities", "confidence"],
    additionalProperties: false
  }
};

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
