// Pure helpers for apps/backend/.env: read it, add demo values without touching what is
// already there, and set the few keys the demo tooling owns (RING_FAMILY_ID, BEE_FAMILY_ID).
// No file system access here, so it is unit-tested directly (scripts/demo/test).

const KEY = /^[A-Z][A-Z0-9_]*$/;

/**
 * One parsed line. `commented` marks a `# KEY=value` line: the key is known to the file
 * but switched off on purpose, so the merge never adds it back.
 */
function parseLine(line) {
  let text = line.trim();
  let commented = false;
  if (text.startsWith('#')) {
    commented = true;
    text = text.replace(/^#+\s*/, '');
  }
  if (text.startsWith('export ')) text = text.slice('export '.length).trim();
  const eq = text.indexOf('=');
  if (eq <= 0) return null;
  const key = text.slice(0, eq).trim();
  if (!KEY.test(key)) return null;
  return { key, value: unquote(text.slice(eq + 1)), commented };
}

/** dotenv semantics: quotes are stripped; an unquoted value ends at " #". */
function unquote(raw) {
  const v = raw.trim();
  const q = v[0];
  if ((q === '"' || q === "'") && v.lastIndexOf(q) > 0) return v.slice(1, v.lastIndexOf(q));
  const hash = v.search(/\s#/);
  return (hash >= 0 ? v.slice(0, hash) : v).trim();
}

/** Every key the file mentions, active or commented out. Active wins over commented. */
export function parseEnv(text) {
  const keys = new Map();
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const prev = keys.get(parsed.key);
    if (!prev || (prev.commented && !parsed.commented)) keys.set(parsed.key, parsed);
  }
  return keys;
}

/** Only the active values, as the backend would read them. */
export function envValues(text) {
  const out = {};
  for (const [key, entry] of parseEnv(text)) if (!entry.commented) out[key] = entry.value;
  return out;
}

function eol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Append entries whose key the file does not mention at all. Existing values, including
 * commented-out ones, are never changed. Entries: { key, value, commented?, note? }.
 * Returns the new text and what was added.
 */
export function mergeEnv(text, entries, header) {
  const nl = eol(text);
  const known = parseEnv(text);
  const lines = [];
  const added = [];
  for (const e of entries) {
    if (known.has(e.key)) continue;
    known.set(e.key, { key: e.key, value: e.value, commented: Boolean(e.commented) });
    if (e.note) lines.push(`# ${e.note}`);
    lines.push(`${e.commented ? '# ' : ''}${e.key}=${e.value}`);
    added.push({ key: e.key, commented: Boolean(e.commented) });
  }
  if (lines.length === 0) return { text, added };
  let out = text;
  if (out.length > 0 && !out.endsWith('\n')) out += nl;
  if (out.length > 0) out += nl;
  if (header) out += `# ${header}${nl}`;
  out += lines.join(nl) + nl;
  return { text: out, added };
}

/**
 * Set keys the demo tooling owns. An active line is rewritten in place, a commented line
 * is switched on, a missing key is appended. Returns the changes (from -> to).
 */
export function setEnvValues(text, updates) {
  const nl = eol(text);
  const lines = text.split(/\r?\n/);
  const changed = [];
  for (const [key, value] of Object.entries(updates)) {
    const active = lines.findIndex((l) => {
      const p = parseLine(l);
      return p && p.key === key && !p.commented;
    });
    const commented = lines.findIndex((l) => {
      const p = parseLine(l);
      return p && p.key === key && p.commented;
    });
    const index = active >= 0 ? active : commented;
    if (index >= 0) {
      const prev = parseLine(lines[index]);
      if (!prev.commented && prev.value === value) continue;
      lines[index] = `${key}=${value}`;
      changed.push({ key, from: prev.commented ? null : prev.value, to: value });
    } else {
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      lines.push(`${key}=${value}`, '');
      changed.push({ key, from: null, to: value });
    }
  }
  return { text: lines.join(nl), changed };
}

/** Comment out active lines for the given key prefixes (used only on a freshly made file). */
export function commentOut(text, prefixes, reason) {
  const nl = eol(text);
  const done = [];
  const lines = text.split(/\r?\n/).flatMap((l) => {
    const p = parseLine(l);
    if (!p || p.commented || !prefixes.some((pre) => p.key.startsWith(pre))) return [l];
    const first = done.length === 0 && reason ? [`# ${reason}`] : [];
    done.push(p.key);
    return [...first, `# ${l.trim()}`];
  });
  return { text: lines.join(nl), commented: done };
}

/** Replace one active value in place (only used on a freshly made file). */
export function replaceValueIf(text, key, expected, value) {
  const nl = eol(text);
  let hit = false;
  const lines = text.split(/\r?\n/).map((l) => {
    const p = parseLine(l);
    if (p && p.key === key && !p.commented && p.value === expected) {
      hit = true;
      return `${key}=${value}`;
    }
    return l;
  });
  return { text: lines.join(nl), replaced: hit };
}
