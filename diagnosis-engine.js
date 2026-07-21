globalThis.DiagnosisEngine = {
  async diagnose({ apiKey, sessionSummary, chatContext }) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5",
        store: false,
        text: { format: diagnosisSchema },
        reasoning: { effort: "minimal" },
        max_output_tokens: 600,
        input: [
          {
            role: "developer",
            content: "Diagnose productivity workflows from the supplied compact summary. Infer cautiously and do not invent facts."
          },
          {
            role: "user",
            content: JSON.stringify({ session_summary: sessionSummary, chatgpt_metadata: chatContext })
          }
        ]
      })
    });

    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    try {
      return normalizeDiagnosis(parseOutput(payload));
    } catch {
      return buildFallbackDiagnosis(sessionSummary);
    }
  }
};

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

function parseOutput(payload) {
  const text = payload.output?.flatMap((item) => item.content || [])
    .find((item) => item.type === "output_text")?.text;
  if (!text) {
    const reason = payload.incomplete_details?.reason;
    throw new Error(`Smart analysis returned no usable result${reason ? ` (${reason})` : ""}.`);
  }
  return JSON.parse(text);
}

function normalizeDiagnosis(diagnosis) {
  return {
    workflow: String(diagnosis.workflow || "Unclear workflow").slice(0, 500),
    bottleneck: String(diagnosis.bottleneck || "No clear bottleneck detected").slice(0, 500),
    requiredCapabilities: Array.isArray(diagnosis.requiredCapabilities)
      ? diagnosis.requiredCapabilities.map((item) => String(item).slice(0, 80)).slice(0, 3)
      : [],
    confidence: ["low", "medium", "high"].includes(diagnosis.confidence) ? diagnosis.confidence : "low"
  };
}

function buildFallbackDiagnosis(sessionSummary) {
  const domains = (sessionSummary.domainDurations || [])
    .map((item) => item.name)
    .filter((domain) => domain !== "chatgpt.com" && domain !== "chat.openai.com")
    .slice(0, 2);
  const tools = domains.length ? `ChatGPT and ${domains.join(" and ")}` : "ChatGPT and supporting tools";
  return {
    workflow: `Local workflow diagnosis: you worked across ${tools}.`,
    bottleneck: "Repeated application switching suggests manual context transfer or copy/paste work.",
    requiredCapabilities: ["document access", "workflow automation", "context sharing"],
    confidence: "low"
  };
}

async function readApiError(response) {
  let message = "No diagnostic message was returned.";
  try {
    const body = await response.json();
    message = body?.error?.message || body?.message || JSON.stringify(body);
  } catch {
    // Preserve the generic message when the error body is unavailable.
  }
  return `Smart analysis failed (${response.status}): ${String(message).slice(0, 500)}.`;
}
