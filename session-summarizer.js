globalThis.SessionSummarizer = {
  summarize(session, contextDurations, endedAt) {
    const events = session.events || [];
    const domainDurations = {};

    events.forEach((event, index) => {
      const nextEvent = events[index + 1];
      const end = nextEvent ? nextEvent.enteredAt : endedAt;
      const duration = Math.max(0, end - event.enteredAt);
      domainDurations[event.domain] = (domainDurations[event.domain] || 0) + duration;
    });

    return {
      sessionDurationMs: Math.max(0, endedAt - (session.startedAt || endedAt)),
      domainDurations: sortDurations(domainDurations),
      contextDurations: sortDurations(contextDurations),
      transitions: countTransitions(session.domains || [])
    };
  }
};

function sortDurations(durations) {
  return Object.entries(durations)
    .map(([name, milliseconds]) => ({ name, seconds: Math.round(milliseconds / 1000) }))
    .sort((left, right) => right.seconds - left.seconds)
    .slice(0, 10);
}

function countTransitions(domains) {
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
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);
}

function isChatGPTDomain(domain) {
  return domain === "chatgpt.com" || domain.endsWith(".chatgpt.com") || domain === "chat.openai.com";
}
