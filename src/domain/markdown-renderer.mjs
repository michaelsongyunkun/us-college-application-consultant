function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function closeList(state, output) {
  if (!state.listType) return;
  output.push(`</${state.listType}>`);
  state.listType = "";
}

export function renderMarkdown(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const lines = text.split(/\r?\n/);
  const output = [];
  const state = { listType: "" };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList(state, output);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList(state, output);
      const level = heading[1].length + 2;
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (state.listType !== "ul") {
        closeList(state, output);
        state.listType = "ul";
        output.push("<ul>");
      }
      output.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      if (state.listType !== "ol") {
        closeList(state, output);
        state.listType = "ol";
        output.push("<ol>");
      }
      output.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      closeList(state, output);
      output.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    closeList(state, output);
    output.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  closeList(state, output);
  return output.join("");
}
