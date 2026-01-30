import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Brain, Sparkles } from "lucide-react";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export const AISearchSummary = ({
  query,
  results,
}: {
  query: string;
  results: SearchResult[];
}) => {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query || results.length === 0) return;

    generate();

    return () => controllerRef.current?.abort();
  }, [query, results]);

  async function generate() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
  
    setLoading(true);
    setSummary("");
  
    try {
      const prompt = `
  Summarize the following search results clearly and concisely:
  
  ${results.map(r => `• ${r.title}: ${r.snippet}`).join("\n")}
  `;
  
      const res = await fetch("http://127.0.0.1:8787", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
        signal: controller.signal,
      });
  
      const data = await res.json();
      setSummary(data.content || "No response.");
    } catch (err) {
      console.error(err);
      setSummary("Failed to generate summary.");
    } finally {
      setLoading(false);
    }
  }
  

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5" />
          AI Summary
          <Badge variant="secondary" className="ml-2">
            <Sparkles className="w-3 h-3 mr-1" />
            GPT-OSS-120B
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex gap-2 items-center text-muted-foreground">
            <Loader2 className="animate-spin" />
            Thinking…
          </div>
        ) : (
          <p className="whitespace-pre-line">{summary}</p>
        )}
      </CardContent>
    </Card>
  );
};
