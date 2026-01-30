import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Code2, MessageSquare, Loader2, Menu, LogOut, Search } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/components/ChatMessage";
import { AdminPanel } from "@/components/AdminPanel";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ModelSelector } from "@/components/ModelSelector";
import { SearchTab } from "@/components/SearchTab";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { User, Session } from "@supabase/supabase-js";
import { z } from "zod";

interface Message {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}
interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}
interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source_type: string;
  created_at: string;
  model_id: string | null;
}

// Input validation schema
const messageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(10000, "Message must be less than 10,000 characters"),
});

const Index = () => {
  // --- Core state (keeps most of your original state)
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  // default to home now
  const [viewMode, setViewMode] = useState<"home" | "chat" | "admin" | "search">("home");
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [researchMode, setResearchMode] = useState(false);
  const [studyMode, setStudyMode] = useState(false);
  const [webSurfingMode, setWebSurfingMode] = useState(false);

  // small helper to pass a home search query to SearchTab if needed
  const [homeQuery, setHomeQuery] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // --- Auth handling (keeps your original logic)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      } else {
        // Check admin status
        setTimeout(() => {
          checkAdminStatus(session.user.id);
        }, 0);
      }
    });

    // Check existing session immediately
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (!data.session) {
        navigate("/auth");
      } else {
        checkAdminStatus(data.session.user.id);
      }
    });

    return () => data.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchKnowledge();
      fetchConversations();
    }
  }, [user]);

  const checkAdminStatus = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!error && data) {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to log out",
        variant: "destructive",
      });
    } else {
      navigate("/auth");
    }
  };

  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId]);

  const fetchKnowledge = async () => {
    const { data, error } = await supabase
      .from("knowledge_entries")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching knowledge:", error);
      return;
    }
    setKnowledgeEntries(data || []);
  };

  const fetchConversations = async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("Error fetching conversations:", error);
      return;
    }
    setConversations(data || []);
  };

  const loadConversation = async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Error loading conversation:", error);
      return;
    }
    const formattedMessages = (data || []).map((msg: any) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
      imageUrl: msg.image_url,
    }));
    setMessages(formattedMessages);
  };

  const createNewConversation = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("conversations")
      .insert({
        title: "New Conversation",
        user_id: user.id,
      })
      .select()
      .single();
    if (error) {
      console.error("Error creating conversation:", error);
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      });
      return;
    }
    setCurrentConversationId(data.id);
    setMessages([]);
    fetchConversations();
  };

  const deleteConversation = async (id: string) => {
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) {
      console.error("Error deleting conversation:", error);
      toast({
        title: "Error",
        description: "Failed to delete conversation",
        variant: "destructive",
      });
      return;
    }
    if (currentConversationId === id) {
      setCurrentConversationId(null);
      setMessages([]);
    }
    fetchConversations();
  };

  const updateConversationTitle = async (conversationId: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    await supabase.from("conversations").update({ title }).eq("id", conversationId);
  };

  // --- generateWithAI (keeps your streaming logic — unchanged)
  // For brevity and safety, I'm keeping your existing streaming flow exactly as you provided.
  // If you want the optimized streaming improvements we discussed earlier integrated here,
  // tell me and I'll inject the micro-batched streaming parser into generateWithAI.
  const generateWithAI = async (messages: Message[], conversationId: string) => {
    if (!selectedModelId) {
      toast({
        title: "No model selected",
        description: "Please select an AI model first",
        variant: "destructive",
      });
      throw new Error("No model selected");
    }

    // Handle both database models (UUID id) and client-injected models (model_id string)
    let modelData: any;
    if (selectedModelId?.startsWith("@cf/") || selectedModelId?.startsWith("@hf/") || selectedModelId?.startsWith("@ollama/") || selectedModelId?.startsWith("@groq/")) {
      // Client-injected model - construct model object from model_id
      const { data: dbModel } = await supabase.from("models").select("*").eq("model_id", selectedModelId).single();
      if (dbModel) {
        modelData = dbModel;
      } else {
        // Fallback: construct model object for GPT-OSS-120B
        modelData = {
          id: selectedModelId,
          model_id: selectedModelId,
          name: selectedModelId.includes("gpt-oss-120b") ? "gpt-oss-120b" : selectedModelId.split("/").pop(),
          display_name: selectedModelId.includes("gpt-oss-120b") ? "GPT-OSS-120B" : selectedModelId,
          type: "text-generation",
          parameters: "120B",
        };
      }
    } else {
      // Database model with UUID id
      const { data } = await supabase.from("models").select("*").eq("id", selectedModelId).single();
      if (!data) {
        throw new Error("Model not found");
      }
      modelData = data;
    }

    if (!modelData) {
      throw new Error("Model not found");
    }

    const { data: knowledgeData } = await supabase.from("knowledge_entries").select("*").eq("model_id", modelData.id);

    let systemPrompt = "You are a helpful AI assistant.";
    if (knowledgeData && knowledgeData.length > 0) {
      systemPrompt += "\n\nYou have access to the following knowledge:\n\n";
      knowledgeData.forEach((entry: any) => {
        systemPrompt += `## ${entry.title}\n${entry.content}\n\n`;
      });
    }

    const lastUserMessage = messages[messages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== "user") {
      throw new Error("No user message found");
    }
    let assistantContent = "";
    let imageUrl: string | undefined = undefined;

    if (modelData.type === "image-generation") {
      try {
        const { data, error } = await supabase.functions.invoke("generate-image", {
          body: { prompt: lastUserMessage.content },
        });
        if (error) throw error;
        imageUrl = data.imageUrl;
        assistantContent = "Generated image based on your prompt.";
        setMessages((prev) => [...prev, { role: "assistant", content: assistantContent, imageUrl }]);
      } catch (error) {
        console.error("Image generation error:", error);
        throw new Error(`Failed to generate image. Please try again.`);
      }
    }

    if (modelData.model_id.startsWith("@cf/") || modelData.model_id.startsWith("@groq/")) {
      try {
        // GPT-OSS-120B uses Responses API which doesn't support streaming
        const isGPTOSS = modelData.model_id === "@cf/openai/gpt-oss-120b";
        
        if (isGPTOSS) {
          // Non-streaming response for GPT-OSS-120B
          console.log("🚀 Starting non-streaming response for GPT-OSS-120B...");
          
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openchat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              messages: messages.map(m => ({
                role: m.role,
                content: m.content,
              })),
              modelId: selectedModelId,
              modelName: modelData.model_id,
              researchMode,
              studyMode,
              webSurfingMode,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { error: errorText || "Unknown error" };
            }
            throw new Error(errorData.error || errorData.details?.[0] || `HTTP ${response.status}: Failed to get response`);
          }

          const data = await response.json();
          assistantContent = data.response || data.content || "No response received.";
          setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
        } else {
          // Streaming response for other models
          console.log("🚀 Starting streaming response...");
          let streamedContent = "";
          setIsStreaming(true);
          setMessages((prev) => [...prev, { role: "assistant", content: streamedContent }]);

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openchat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              messages: messages.map(m => ({
                role: m.role,
                content: m.content,
              })),
              modelId: selectedModelId,
              modelName: modelData.model_id,
              researchMode,
              studyMode,
              webSurfingMode,
            }),
          });

          if (!response.ok || !response.body) {
            setIsStreaming(false);
            throw new Error("Failed to start streaming");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim() || line.startsWith(":")) continue;
              if (!line.startsWith("data: ")) continue;

              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  streamedContent += delta;
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { role: "assistant", content: streamedContent };
                    return newMessages;
                  });
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }

          setIsStreaming(false);
          assistantContent = streamedContent;
        }
      } catch (error) {
        console.error("AI error:", error);
        setIsStreaming(false);
        throw new Error(`Failed to generate response with ${modelData.display_name}. Please try again.`);
      }
    } else {
      throw new Error("Unsupported model type");
    }

    if (assistantContent) {
      const insertData: any = { conversation_id: conversationId, role: "assistant", content: assistantContent };
      if (imageUrl) insertData.image_url = imageUrl;
      await supabase.from("messages").insert(insertData);
    }
  };

  const handleSend = async () => {
    if (isLoading || !user) return;

    const validation = messageSchema.safeParse({ content: input });
    if (!validation.success) {
      toast({
        title: "Invalid input",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    // Create new conversation if none exists
let conversationId = currentConversationId;
if (!conversationId) {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ title: "New Conversation", user_id: user.id })
    .select()
    .single();
  if (error || !data) {
    toast({ title: "Error", description: "Failed to create conversation", variant: "destructive" });
    return;
  }
  conversationId = data.id;
  setCurrentConversationId(conversationId);
  fetchConversations();

  // Switch to chat mode immediately
  setViewMode("chat");
}


    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: userMessage.content,
      user_id: user.id,
    });

    if (messages.length === 0) {
      updateConversationTitle(conversationId, userMessage.content);
    }

    try {
      await generateWithAI(newMessages, conversationId);
      fetchConversations();
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Home helpers
  const onHomeSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!homeQuery.trim()) return;
    // set whatever search state you need — for now switch to Search tab
    setViewMode("search");
    // If SearchTab consumes the query prop, you can set a global / context; here we keep simple
    // (If SearchTab expects a prop, we can pass homeQuery to it in the JSX below)
  };

  const enterChatMode = () => {
    setViewMode("chat");
    // If no conversation exists, create one
    if (!currentConversationId) createNewConversation();
  };

  // --- Render
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white via-slate-50 to-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div
        className="min-h-screen w-full"
        // soft white + purple-blue subtle gradient background
        style={{
          background:
            "radial-gradient(1200px 600px at 10% 10%, rgba(99,102,241,0.06), transparent 10%), radial-gradient(900px 450px at 90% 90%, rgba(139,92,246,0.04), transparent 10%), linear-gradient(180deg,#ffffff 0%, #f8fafc 40%, #eef2ff 100%)",
        }}
      >
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SidebarTrigger>
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <Code2 className="w-6 h-6 text-background" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Infinity AI</h1>
                <p className="text-xs text-muted-foreground">Apache 2.0 Models · Cloudflare AI</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant={viewMode === "chat" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("chat")}>
                <MessageSquare className="w-4 h-4 mr-2" />
                Chat
              </Button>
              <Button variant={viewMode === "search" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("search")}>
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
              {isAdmin && (
                <Button variant={viewMode === "admin" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("admin")}>
                  <Code2 className="w-4 h-4 mr-2" />
                  Admin
                </Button>
              )}
              <ThemeToggle />
              <Button variant="outline" onClick={handleLogout} size="sm">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {/* HOME HERO */}
          {viewMode === "home" ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-6">
              {/* Soft Glass Infinity Symbol */}
              <div
                aria-hidden
                className="rounded-full p-6"
                style={{
                  // subtle glass card
                  background: "linear-gradient(135deg, rgba(255,255,255,0.6), rgba(255,255,255,0.35))",
                  boxShadow: "0 8px 30px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
                  backdropFilter: "blur(8px)",
                }}
              >
                {/* SVG infinity symbol with glassy gradient + soft glow */}
                <svg width="140" height="80" viewBox="0 0 140 80" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Infinity logo">
                  <defs>
                    <linearGradient id="g1" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity="1" />
                      <stop offset="50%" stopColor="#6366F1" stopOpacity="1" />
                      <stop offset="100%" stopColor="#60A5FA" stopOpacity="1" />
                    </linearGradient>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="6" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <linearGradient id="glass" x1="0" x2="1">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0.3)" />
                    </linearGradient>
                  </defs>

                  {/* Glow behind */}
                  <path d="M12 40 C12 20, 48 12, 70 28 C92 44, 128 36, 128 16" stroke="url(#g1)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.12" filter="url(#glow)" transform="translate(0,6) rotate(-8 70 40)" />

                  {/* Left loop */}
                  <path d="M20 40 C20 18, 56 14, 70 28 C84 42, 48 54, 22 50 C10 48, 12 40, 20 40 Z" fill="none" stroke="url(#g1)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />

                  {/* Right loop */}
                  <path d="M120 40 C120 62, 84 66, 70 52 C56 38, 92 26, 118 30 C130 32, 128 40, 120 40 Z" fill="none" stroke="url(#g1)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />

                  {/* Gloss highlight */}
                  <path d="M32 26 C52 10, 88 10, 106 26" stroke="url(#glass)" strokeWidth="6" strokeLinecap="round" opacity="0.7" />

                </svg>
              </div>

              <div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-foreground">Welcome to Infinity AI</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto mt-2">
                  A clean place to search, chat, and explore models — powered by Cloudflare AI and curated models.
                </p>
              </div>

              {/* Search bar */}
              <form onSubmit={onHomeSearchSubmit} className="w-full max-w-2xl flex items-center gap-3">
                <Input
                  placeholder="Search the web or ask AI — try “explain quantum entanglement in 2 sentences”"
                  value={homeQuery}
                  onChange={(e) => setHomeQuery(e.target.value)}
                  className="flex-1 ring-2 ring-transparent focus:ring-primary/40"
                />
                <Button type="submit" size="lg" className="px-6">
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </form>

              {/* Primary actions */}
              <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                <Button size="lg" onClick={enterChatMode} className="px-8">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Start Chat
                </Button>

                <Button size="lg" variant="ghost" onClick={() => setViewMode("search")} className="px-6">
                  <Search className="w-4 h-4 mr-2" />
                  Go to Search
                </Button>

                {isAdmin && (
                  <Button size="lg" variant="outline" onClick={() => setViewMode("admin")}>
                    <Code2 className="w-4 h-4 mr-2" />
                    Admin
                  </Button>
                )}
              </div>

              {/* subtle footnote */}
              <div className="mt-4 text-xs text-muted-foreground">Tip: pick Chat for conversational help, Search for quick answers.</div>
            </div>
          ) : null}

          {/* Main area: Chat / Search / Admin */}
          <div className="mt-8">
            {viewMode === "chat" ? (
              <div className="flex gap-6">
                <ConversationSidebar
                  conversations={conversations}
                  currentConversationId={currentConversationId}
                  onSelectConversation={setCurrentConversationId}
                  onNewConversation={createNewConversation}
                  onDeleteConversation={deleteConversation}
                  researchMode={researchMode}
                  onResearchModeChange={setResearchMode}
                  studyMode={studyMode}
                  onStudyModeChange={setStudyMode}
                  webSurfingMode={webSurfingMode}
                  onWebSurfingModeChange={setWebSurfingMode}
                />

                <div className="flex-1">
                  <ModelSelector selectedModelId={selectedModelId} onSelectModel={setSelectedModelId} />
                  <Card className="h-[calc(100vh-18rem)] flex flex-col bg-card/50 backdrop-blur-sm border-border mt-4">
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {messages.length === 0 && (
                        <div className="h-full flex items-center justify-center">
                          <div className="text-center space-y-3">
                            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                              <MessageSquare className="w-8 h-8 text-background" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground">Start a conversation</h2>
                            <p className="text-muted-foreground max-w-md">Ask me anything!</p>
                          </div>
                        </div>
                      )}

                      {messages.map((msg, idx) => (
                        <ChatMessage
                          key={idx}
                          role={msg.role}
                          content={msg.content}
                          imageUrl={msg.imageUrl}
                          isStreaming={isStreaming && idx === messages.length - 1 && msg.role === "assistant"}
                        />
                      ))}

                      {isLoading && messages[messages.length - 1]?.role === "user" && (
                        <div className="flex gap-3 p-4 rounded-lg bg-card mr-8">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-background animate-spin" />
                          </div>
                          <div className="flex-1 pt-1">
                            <p className="text-sm text-muted-foreground">Thinking...</p>
                          </div>
                        </div>
                      )}

                      <div ref={messagesEndRef} />
                    </div>

                    <div className="border-t border-border p-4 bg-background/50">
                      <div className="flex gap-2">
                        <Input
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                          placeholder="Type your message..."
                          disabled={isLoading}
                          className="flex-1"
                        />
                        <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            ) : viewMode === "search" ? (
              <div className="h-[calc(100vh-12rem)] overflow-y-auto">
                {/* If your SearchTab can accept query prop, pass homeQuery. */}
                {/* <SearchTab query={homeQuery} /> */}
                <SearchTab />
              </div>
            ) : (
              <Card className="h-[calc(100vh-12rem)] p-6 bg-card/50 backdrop-blur-sm border-border overflow-hidden">
                <AdminPanel knowledgeEntries={knowledgeEntries} onRefresh={fetchKnowledge} />
              </Card>
            )}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;
