// Tiny line-level diff via LCS. Good enough for prompt comparison (small N).

/**
 * Returns an array of { op: 'eq'|'del'|'add', line: string }
 * where 'del' is from textA only, 'add' is from textB only,
 * and 'eq' is the line that appears in both.
 */
export function lineDiff(textA, textB) {
  const a = textA.split('\n');
  const b = textB.split('\n');
  const m = a.length, n = b.length;

  // LCS length table
  const lcs = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) lcs[i][j] = lcs[i - 1][j - 1] + 1;
      else lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }

  // Backtrack to produce ops
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ op: 'eq', line: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      ops.push({ op: 'add', line: b[j - 1] });
      j--;
    } else if (i > 0) {
      ops.push({ op: 'del', line: a[i - 1] });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

/** Render the diff ops to an HTML string with del/add highlighting. */
export function renderDiffHtml(ops, escapeFn) {
  const esc = escapeFn || (s => s);
  return ops.map(o => {
    const cls = o.op === 'add' ? 'diff-add' : o.op === 'del' ? 'diff-del' : 'diff-eq';
    const sign = o.op === 'add' ? '+' : o.op === 'del' ? '−' : ' ';
    return `<div class="diff-line ${cls}"><span class="diff-sign">${sign}</span><span class="diff-text">${esc(o.line) || '&nbsp;'}</span></div>`;
  }).join('');
}
