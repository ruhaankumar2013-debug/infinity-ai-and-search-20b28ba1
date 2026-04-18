import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Code2,
  Send,
  Loader2,
  Download,
  FileCode,
  Trash2,
  Plus,
  ArrowLeft,
  Sparkles,
  Save,
  Wand2,
  StopCircle,
} from "lucide-react";
import JSZip from "jszip";
import {
  parseCodeBlocks,
  stripCodeBlocks,
  languageFromPath,
} from "@/lib/codeBlockParser";
import { scanFiles, formatIssuesForAI } from "@/lib/staticErrorScanner";
import type { Session } from "@supabase/supabase-js";

interface CodeFile {
  id: string;
  path: string;
  language: string;
  content: string;
  updated_at: string;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const TIERS = ["lite", "standard", "pro", "expert"] as const;
type Tier = (typeof TIERS)[number];

const TIER_LABEL: Record<Tier, string> = {
  lite: "Lite",
  standard: "Standard",
  pro: "Pro",
  expert: "Expert",
};

const TIER_DESCRIPTION: Record<Tier, string> = {
  lite: "Fast, concise answers. Good for snippets.",
  standard: "Balanced. Working code with sensible architecture.",
  pro: "Production-ready: typing, error handling, multi-file when useful.",
  expert: "Maximum rigor: planning, full architecture, tests, trade-offs.",
};

const CodeMode = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const [tier, setTier] = useState<Tier>("standard");
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [editorBuffer, setEditorBuffer] = useState("");
  const [dirty, setDirty] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-fix loop state
  const [loopRunning, setLoopRunning] = useState(false);
  const [loopIteration, setLoopIteration] = useState(0);
  const [loopLog, setLoopLog] = useState<string[]>([]);
  const stopLoopRef = useRef(false);
  const MAX_LOOP_ITERATIONS = 5;

  // Auth
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthChecked(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Bootstrap: ensure a conversation exists
  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          user_id: session.user.id,
          title: "Code Mode session",
        })
        .select()
        .single();
      if (error) {
        toast({
          title: "Failed to start session",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      setConversationId(data.id);
    })();
  }, [session?.user?.id]);

  // Load files for the conversation
  const loadFiles = async (cid: string) => {
    const { data, error } = await supabase
      .from("code_files")
      .select("id, path, language, content, updated_at")
      .eq("conversation_id", cid)
      .order("path", { ascending: true });
    if (!error && data) setFiles(data as CodeFile[]);
  };

  useEffect(() => {
    if (conversationId) loadFiles(conversationId);
  }, [conversationId]);

  // Sync editor buffer when active file changes
  useEffect(() => {
    const active = files.find((f) => f.path === activePath);
    setEditorBuffer(active?.content ?? "");
    setDirty(false);
  }, [activePath, files]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, isStreaming]);

  const upsertFiles = async (
    cid: string,
    userId: string,
    parsed: { path: string; language: string; content: string }[],
  ) => {
    if (parsed.length === 0) return;
    const rows = parsed.map((p) => ({
      user_id: userId,
      conversation_id: cid,
      path: p.path,
      language: p.language || languageFromPath(p.path),
      content: p.content,
    }));
    // Upsert by (conversation_id, path)
    const { error } = await supabase
      .from("code_files")
      .upsert(rows, { onConflict: "conversation_id,path" });
    if (error) {
      console.error("upsert files error", error);
      toast({
        title: "Failed to save files",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    await loadFiles(cid);
    if (!activePath && parsed[0]) setActivePath(parsed[0].path);
  };

  const handleSend = async () => {
    if (!input.trim() || !conversationId || !session?.user) return;
    const userText = input.trim();
    setInput("");

    const newChat: ChatMsg[] = [...chat, { role: "user", content: userText }];
    setChat([...newChat, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    let streamed = "";

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/code-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newChat,
            tier,
            existingFiles: files.map((f) => ({
              path: f.path,
              language: f.language,
              content: f.content,
            })),
          }),
        },
      );

      if (!res.ok || !res.body) {
        let msg = "Failed to stream response";
        try {
          const j = await res.json();
          msg = j.error || msg;
        } catch {}
        setChat((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: `⚠️ ${msg}` };
          return copy;
        });
        toast({ title: "Code Mode error", description: msg, variant: "destructive" });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              streamed += delta;
              setChat((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: streamed };
                return copy;
              });
            }
          } catch {
            /* partial JSON */
          }
        }
      }

      // Once streaming is done, parse code blocks and persist
      const parsedFiles = parseCodeBlocks(streamed);
      if (parsedFiles.length > 0 && conversationId) {
        await upsertFiles(conversationId, session.user.id, parsedFiles);
        // Replace assistant message with stripped narrative so files aren't dumped twice
        const narrative = stripCodeBlocks(streamed);
        setChat((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: narrative };
          return copy;
        });
        toast({
          title: `Saved ${parsedFiles.length} file${parsedFiles.length > 1 ? "s" : ""}`,
          description: parsedFiles.map((p) => p.path).join(", "),
        });
      }
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Code Mode error", description: msg, variant: "destructive" });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSaveBuffer = async () => {
    const active = files.find((f) => f.path === activePath);
    if (!active) return;
    const { error } = await supabase
      .from("code_files")
      .update({ content: editorBuffer })
      .eq("id", active.id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setFiles((prev) =>
      prev.map((f) => (f.id === active.id ? { ...f, content: editorBuffer } : f)),
    );
    setDirty(false);
    toast({ title: "Saved", description: active.path });
  };

  const handleDeleteFile = async (file: CodeFile) => {
    if (!confirm(`Delete ${file.path}?`)) return;
    const { error } = await supabase.from("code_files").delete().eq("id", file.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    if (activePath === file.path) setActivePath(null);
  };

  const handleNewFile = async () => {
    if (!conversationId || !session?.user) return;
    const path = prompt("New file path (e.g. src/utils/helper.ts):");
    if (!path) return;
    if (files.some((f) => f.path === path)) {
      toast({ title: "Already exists", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("code_files")
      .insert({
        user_id: session.user.id,
        conversation_id: conversationId,
        path,
        language: languageFromPath(path),
        content: "",
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
      return;
    }
    setFiles((prev) => [...prev, data as CodeFile]);
    setActivePath(path);
  };

  const handleDownloadZip = async () => {
    if (files.length === 0) {
      toast({ title: "No files to download" });
      return;
    }
    const zip = new JSZip();
    files.forEach((f) => zip.file(f.path, f.content));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `code-mode-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const tierIndex = useMemo(() => TIERS.indexOf(tier), [tier]);

  if (authChecked && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <Code2 className="w-12 h-12 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">Sign in to use Code Mode</h1>
          <p className="text-muted-foreground">
            Code Mode stores your generated files securely in your account.
          </p>
          <Button onClick={() => navigate("/auth")} className="w-full">
            Sign in
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="border-b border-border bg-card/40 backdrop-blur px-4 py-3 flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Code2 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Code Mode</h1>
          <Badge variant="outline" className="hidden sm:inline-flex">
            <Sparkles className="w-3 h-3 mr-1" />
            Beta
          </Badge>
        </div>

        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <div className="flex items-center gap-2 min-w-[260px]">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Tier: <strong className="text-foreground">{TIER_LABEL[tier]}</strong>
            </span>
            <Slider
              value={[tierIndex]}
              min={0}
              max={3}
              step={1}
              onValueChange={(v) => setTier(TIERS[v[0]])}
              className="w-32"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadZip}>
            <Download className="w-4 h-4 mr-1" />
            ZIP ({files.length})
          </Button>
        </div>
      </header>

      <p className="text-xs text-muted-foreground px-4 py-1 border-b border-border bg-muted/30">
        {TIER_DESCRIPTION[tier]}
      </p>

      {/* Main split */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] overflow-hidden">
        {/* Chat pane */}
        <div className="flex flex-col border-r border-border min-h-0">
          <ScrollArea className="flex-1 p-4">
            {chat.length === 0 && (
              <div className="text-center text-muted-foreground mt-12 space-y-2">
                <Code2 className="w-10 h-10 mx-auto opacity-40" />
                <p className="text-sm">
                  Describe what you want to build. The AI will generate files
                  into your workspace →
                </p>
                <p className="text-xs opacity-70">
                  Try: "Build a Python CLI that converts CSV to JSON with type
                  inference"
                </p>
              </div>
            )}
            <div className="space-y-4">
              {chat.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary/10 border border-primary/20 ml-8"
                      : "bg-card border border-border mr-8"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                    {m.role}
                  </div>
                  {m.content || (isStreaming && i === chat.length - 1 ? "..." : "")}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-border p-3 space-y-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What do you want to build?"
              className="min-h-[80px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                ⌘/Ctrl + Enter to send
              </span>
              <Button onClick={handleSend} disabled={isStreaming || !input.trim()}>
                {isStreaming ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Generating
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* File workspace */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 p-3 border-b border-border">
            <FileCode className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Workspace</h2>
            <span className="text-xs text-muted-foreground">
              {files.length} file{files.length === 1 ? "" : "s"}
            </span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={handleNewFile}>
              <Plus className="w-4 h-4 mr-1" />
              New
            </Button>
          </div>

          <div className="flex-1 grid grid-cols-[200px_1fr] overflow-hidden">
            {/* File list */}
            <ScrollArea className="border-r border-border">
              <div className="p-2 space-y-1">
                {files.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">
                    No files yet. Ask the AI to generate something.
                  </p>
                )}
                {files.map((f) => (
                  <div
                    key={f.id}
                    className={`group flex items-center gap-1 px-2 py-1.5 rounded text-xs cursor-pointer ${
                      activePath === f.path
                        ? "bg-primary/15 text-foreground"
                        : "hover:bg-muted/60 text-muted-foreground"
                    }`}
                    onClick={() => setActivePath(f.path)}
                  >
                    <FileCode className="w-3 h-3 shrink-0" />
                    <span className="truncate flex-1">{f.path}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFile(f);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Delete ${f.path}`}
                    >
                      <Trash2 className="w-3 h-3 hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Editor */}
            <div className="flex flex-col min-h-0">
              {activePath ? (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                    <Badge variant="outline" className="text-[10px]">
                      {files.find((f) => f.path === activePath)?.language}
                    </Badge>
                    <span className="text-xs font-mono truncate flex-1">{activePath}</span>
                    {dirty && (
                      <span className="text-[10px] text-muted-foreground italic">
                        unsaved
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveBuffer}
                      disabled={!dirty}
                    >
                      <Save className="w-3 h-3 mr-1" />
                      Save
                    </Button>
                  </div>
                  <textarea
                    value={editorBuffer}
                    onChange={(e) => {
                      setEditorBuffer(e.target.value);
                      setDirty(true);
                    }}
                    spellCheck={false}
                    className="flex-1 w-full p-3 font-mono text-xs bg-background text-foreground resize-none focus:outline-none border-0"
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                  Select a file to view
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeMode;
