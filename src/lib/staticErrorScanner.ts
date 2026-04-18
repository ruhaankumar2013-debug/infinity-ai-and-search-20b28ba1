// Lightweight, runtime-free static checks across workspace files.
// Designed to surface OBVIOUS issues (parse errors, unbalanced brackets,
// trivially broken JSON) so the AI auto-fix loop has concrete things to fix.
// This is intentionally NOT a full parser — it should not produce false positives
// on syntactically valid code.

export interface StaticIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const OPENERS = new Set(Object.keys(PAIRS));
const CLOSERS = new Set(Object.values(PAIRS));

function checkBrackets(content: string): string | null {
  // Strip strings and comments cheaply so we don't count brackets inside them.
  let stripped = "";
  let i = 0;
  let inStr: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < content.length) {
    const c = content[i];
    const next = content[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inStr) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      i++;
      continue;
    }
    stripped += c;
    i++;
  }

  const stack: string[] = [];
  for (const ch of stripped) {
    if (OPENERS.has(ch)) stack.push(ch);
    else if (CLOSERS.has(ch)) {
      const last = stack.pop();
      if (!last || PAIRS[last] !== ch) {
        return `Unbalanced bracket: unexpected '${ch}'`;
      }
    }
  }
  if (stack.length > 0) {
    return `Unbalanced bracket: missing '${PAIRS[stack[stack.length - 1]]}'`;
  }
  return null;
}

function checkJson(content: string): string | null {
  try {
    JSON.parse(content);
    return null;
  } catch (e) {
    return `Invalid JSON: ${(e as Error).message}`;
  }
}

function checkPython(content: string): string | null {
  // Indentation sanity: detect tab/space mix on continuation lines.
  const lines = content.split("\n");
  let usesTabs = false;
  let usesSpaces = false;
  for (const line of lines) {
    const m = line.match(/^([ \t]+)/);
    if (!m) continue;
    if (m[1].includes("\t")) usesTabs = true;
    if (m[1].includes(" ")) usesSpaces = true;
  }
  if (usesTabs && usesSpaces) {
    return "Mixed tabs and spaces in indentation";
  }
  return null;
}

const BRACKET_LANGS = new Set([
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "java",
  "kotlin",
  "c",
  "cpp",
  "csharp",
  "go",
  "rust",
  "swift",
  "php",
  "css",
  "scss",
]);

export function scanFiles(
  files: { path: string; language: string; content: string }[],
): StaticIssue[] {
  const issues: StaticIssue[] = [];
  for (const f of files) {
    if (!f.content?.trim()) continue;
    const lang = (f.language || "").toLowerCase();
    if (lang === "json" || f.path.endsWith(".json")) {
      const err = checkJson(f.content);
      if (err) issues.push({ path: f.path, message: err, severity: "error" });
      continue;
    }
    if (lang === "python" || f.path.endsWith(".py")) {
      const err = checkPython(f.content);
      if (err) issues.push({ path: f.path, message: err, severity: "warning" });
      continue;
    }
    if (BRACKET_LANGS.has(lang)) {
      const err = checkBrackets(f.content);
      if (err) issues.push({ path: f.path, message: err, severity: "error" });
    }
  }
  return issues;
}

export function formatIssuesForAI(issues: StaticIssue[]): string {
  if (issues.length === 0) return "";
  return issues
    .map((i) => `- [${i.severity.toUpperCase()}] ${i.path}: ${i.message}`)
    .join("\n");
}
