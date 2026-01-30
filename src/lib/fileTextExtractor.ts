export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mime = file.type;

  // Plain text-like files
  if (
    mime.startsWith("text/") ||
    extension === "txt" ||
    extension === "md" ||
    extension === "csv"
  ) {
    return readFileAsText(file);
  }

  // For now we only support simple text formats.
  // Binary formats like PDF/DOC/DOCX are not reliably parseable in-browser
  // without heavy dependencies, so we skip them gracefully.
  throw new Error(
    `Unsupported file type for text extraction (${extension || mime || "unknown"})`
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


