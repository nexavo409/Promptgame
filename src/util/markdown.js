// Tiny safe Markdown renderer. No deps. Escapes HTML first, then injects
// styling tags for headings / lists / code / emphasis. Good enough for typical
// LLM outputs (Markdown is what most models produce by default).

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ESC[c]);
}

function inlineFormat(text) {
  return text
    // inline code (escape `& < >` inside `` … ``)
    .replace(/`([^`]+)`/g, (_, c) => '<code class="md-inline-code">' + c + '</code>')
    // bold ** or __
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    // italic *  or _
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
}

export function renderMarkdown(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  const lines = escaped.split('\n');
  const out = [];
  let inCode = false;
  let codeBuf = [];
  let listType = null;
  let listBuf = [];
  let paraBuf = [];

  const flushPara = () => {
    if (paraBuf.length) {
      out.push('<p>' + inlineFormat(paraBuf.join('<br>')) + '</p>');
      paraBuf = [];
    }
  };
  const flushList = () => {
    if (listBuf.length) {
      const tag = listType;
      const items = listBuf.map(it => '<li>' + inlineFormat(it) + '</li>').join('');
      out.push('<' + tag + ' class="md-list">' + items + '</' + tag + '>');
      listBuf = [];
      listType = null;
    }
  };

  for (const line of lines) {
    // Code fence
    if (/^```/.test(line)) {
      if (inCode) {
        out.push('<pre class="md-code"><code>' + codeBuf.join('\n') + '</code></pre>');
        codeBuf = [];
        inCode = false;
      } else {
        flushPara();
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    // Heading 1-4
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const lvl = Math.min(h[1].length + 1, 5);
      out.push('<h' + lvl + ' class="md-h">' + inlineFormat(h[2]) + '</h' + lvl + '>');
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushPara(); flushList();
      out.push('<hr class="md-hr" />');
      continue;
    }

    // Unordered list
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listBuf.push(ul[1]);
      continue;
    }
    // Ordered list
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      flushPara();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listBuf.push(ol[1]);
      continue;
    }

    // Blockquote
    if (/^&gt;\s+/.test(line)) {
      flushPara(); flushList();
      out.push('<blockquote class="md-quote">' + inlineFormat(line.replace(/^&gt;\s+/, '')) + '</blockquote>');
      continue;
    }

    // Empty line: paragraph break
    if (line.trim() === '') {
      flushPara(); flushList();
      continue;
    }

    // Plain paragraph text (collect, will be joined)
    flushList();
    paraBuf.push(line);
  }
  flushPara(); flushList();
  if (inCode) out.push('<pre class="md-code"><code>' + codeBuf.join('\n') + '</code></pre>');

  return out.join('\n');
}
