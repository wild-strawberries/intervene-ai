let catalogPromise;

globalThis.RecommendationEngine = {
  async recommend(requiredCapabilities) {
    const catalog = await loadCatalog();
    const tokens = tokenize(requiredCapabilities.join(" "));
    return catalog
      .map((tool) => ({ ...tool, score: scoreTool(tool, tokens) }))
      .filter((tool) => tool.score > 0)
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .slice(0, 2);
  }
};

async function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(chrome.runtime.getURL("combined_tools_output.csv"))
      .then((response) => response.text())
      .then(parseCsv)
      .then((rows) => rows.map((row) => ({
        name: row.tool_name,
        url: row.tool_url,
        description: row.short_description || row.long_description || "",
        searchableText: [row.tool_name, row.short_description, row.capabilities, row.long_description].join(" ").toLowerCase()
      })).filter((tool) => tool.name && /^https?:\/\//.test(tool.url)));
  }
  return catalogPromise;
}

function scoreTool(tool, tokens) {
  return tokens.reduce((score, token) => score + (tool.searchableText.includes(token) ? 1 : 0), 0);
}

function tokenize(value) {
  return [...new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) rows.push([...row, field]);
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}
