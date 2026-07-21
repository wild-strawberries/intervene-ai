globalThis.ReportGenerator = {
  build(diagnosis, recommendations) {
    const steps = recommendations.map((tool) => ({
      name: tool.name,
      url: tool.url,
      why: tool.description.slice(0, 260) || `Supports ${diagnosis.requiredCapabilities.join(", ")}.`
    }));
    return {
      summary: `${diagnosis.workflow} ${diagnosis.bottleneck}`,
      steps,
      confidence: diagnosis.confidence
    };
  }
};
