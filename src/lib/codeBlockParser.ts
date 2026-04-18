// Parses code blocks emitted by the Code Mode AI.
// Expected format:
//   ```<language> path=<path/to/file.ext>
//   ...content...
//   ```

export interface ParsedCodeFile {
  path: string;
  language: string;
  content: string;
}

const FENCE_RE = /```([a-zA-Z0-9_+-]*)\s+path=([^\s\n`]+)\s*\n([\s\S]*?)```/g;

export function parseCodeBlocks(markdown: string): ParsedCodeFile[] {
  const files: ParsedCodeFile[] = [];
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(markdown)) !== null) {
    const [, language, path, content] = match;
    files.push({
      path: path.trim(),
      language: (language || "plaintext").trim() || "plaintext",
      content: content.replace(/\n$/, ""),
    });
  }
  return files;
}

// Strips the ``` path= blocks out of markdown so the chat narrative can be
// shown without dumping the entire file content twice.
export function stripCodeBlocks(markdown: string): string {
  return markdown
    .replace(FENCE_RE, (_m, _lang, path) => `📄 \`${path}\` saved to workspace.`)
    .trim();
}

export function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    md: "markdown",
    sql: "sql",
    dockerfile: "dockerfile",
  };
  return map[ext] || "plaintext";
}
