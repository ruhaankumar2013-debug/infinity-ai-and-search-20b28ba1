export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mime = file.type;

  // Plain text-like files
  const textExtensions = [
    "txt", "md", "csv", "json", "xml", "html", "htm",
    "js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "h",
    "css", "scss", "less", "yaml", "yml", "toml", "ini", "cfg",
    "log", "sh", "bat", "ps1", "rb", "go", "rs", "swift",
    "kt", "sql", "r", "m", "lua", "pl", "php", "env",
  ];

  if (
    mime.startsWith("text/") ||
    (extension && textExtensions.includes(extension)) ||
    mime === "application/json" ||
    mime === "application/xml"
  ) {
    return readFileAsText(file);
  }

  // Try reading as text anyway for unknown types
  try {
    const text = await readFileAsText(file);
    // If it looks like text (no null bytes in first 1000 chars), accept it
    if (text.length > 0 && !text.substring(0, 1000).includes("\0")) {
      return text;
    }
  } catch {
    // Fall through
  }

  throw new Error(
    `Unsupported file type for text extraction (${extension || mime || "unknown"}). Please use a text-based file format.`
  );
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.onabort = () => reject(new Error("File reading was aborted"));
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsText(file);
  });
}
