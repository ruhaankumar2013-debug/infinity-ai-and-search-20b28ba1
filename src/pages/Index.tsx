import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Code2, MessageSquare, Loader2, Menu, LogOut, Search, User, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/components/ChatMessage";
import { AdminPanel } from "@/components/AdminPanel";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ModelSelector } from "@/components/ModelSelector";
import { SearchTab } from "@/components/SearchTab";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import logo from "@/assets/logo.png";
import { SiteNav } from "@/components/SiteNav";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";
import { z } from "zod";
interface Message {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  frames?: string[];
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
  content: z.string().trim().min(1, "Message cannot be empty").max(10000, "Message must be less than 10,000 characters")
});
const Index = () => {
  // --- Core state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewMode, setViewMode] = useState<"home" | "chat" | "admin" | "search">("home");
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [researchMode, setResearchMode] = useState(false);
  const [studyMode, setStudyMode] = useState(false);
  const [webSurfingMode, setWebSurfingMode] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [homeQuery, setHomeQuery] = useState<string>("");
  const [homeAiQuery, setHomeAiQuery] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // --- Auth handling (NO redirect - browsing allowed without login)
  useEffect(() => {
    const {
      data
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthChecked(true);
      if (session?.user) {
        setTimeout(() => {
          checkAdminStatus(session.user.id);
        }, 0);
      }
    });
    supabase.auth.getSession().then(({
      data
    }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setAuthChecked(true);
      if (data.session?.user) {
        checkAdminStatus(data.session.user.id);
      } else {
        // Show login prompt on first visit if not logged in
        const hasSkipped = sessionStorage.getItem("infinity_login_skipped");
        if (!hasSkipped) {
          setShowLoginPrompt(true);
        }
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (user) {
      fetchKnowledge();
      fetchConversations();
    }
  }, [user]);
  const checkAdminStatus = async (userId: string) => {
    const {
      data,
      error
    } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!error && data) {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }
  };
  const handleLogout = async () => {
    const {
      error
    } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to log out",
        variant: "destructive"
      });
    } else {
      setViewMode("home");
      setMessages([]);
      setCurrentConversationId(null);
      setConversations([]);
    }
  };
  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId]);
  const fetchKnowledge = async () => {
    const {
      data,
      error
    } = await supabase.from("knowledge_entries").select("*").order("created_at", {
      ascending: false
    });
    if (error) {
      console.error("Error fetching knowledge:", error);
      return;
    }
    setKnowledgeEntries(data || []);
  };
  const fetchConversations = async () => {
    const {
      data,
      error
    } = await supabase.from("conversations").select("*").order("updated_at", {
      ascending: false
    });
    if (error) {
      console.error("Error fetching conversations:", error);
      return;
    }
    setConversations(data || []);
  };
  const loadConversation = async (conversationId: string) => {
    const {
      data,
      error
    } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", {
      ascending: true
    });
    if (error) {
      console.error("Error loading conversation:", error);
      return;
    }
    const formattedMessages = (data || []).map((msg: any) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
      imageUrl: msg.image_url
    }));
    setMessages(formattedMessages);
  };
  const createNewConversation = async () => {
    if (!user) return;
    const {
      data,
      error
    } = await supabase.from("conversations").insert({
      title: "New Conversation",
      user_id: user.id
    }).select().single();
    if (error) {
      console.error("Error creating conversation:", error);
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive"
      });
      return;
    }
    setCurrentConversationId(data.id);
    setMessages([]);
    fetchConversations();
  };
  const deleteConversation = async (id: string) => {
    const {
      error
    } = await supabase.from("conversations").delete().eq("id", id);
    if (error) {
      console.error("Error deleting conversation:", error);
      toast({
        title: "Error",
        description: "Failed to delete conversation",
        variant: "destructive"
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
    await supabase.from("conversations").update({
      title
    }).eq("id", conversationId);
  };

  // --- generateWithAI with ULTRA orchestration support
  const generateWithAI = async (messages: Message[], conversationId: string) => {
    if (!selectedModelId) {
      toast({
        title: "No model selected",
        description: "Please select an AI model first",
        variant: "destructive"
      });
      throw new Error("No model selected");
    }
    const lastUserMessage = messages[messages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== "user") {
      throw new Error("No user message found");
    }
    let assistantContent = "";
    let imageUrl: string | undefined = undefined;

    // Handle ULTRA orchestrator
    if (selectedModelId === "@ultra/orchestrator") {
      try {
        console.log("🧠 ULTRA: Routing prompt...");
        const {
          data: routingData,
          error: routingError
        } = await supabase.functions.invoke("ultra-router", {
          body: {
            prompt: lastUserMessage.content,
            messages
          }
        });
        if (routingError) {
          console.error("ULTRA routing error:", routingError);
          throw new Error("Failed to route prompt");
        }
        const targetModel = routingData.model;
        const modifiedPrompt = routingData.modified_prompt || lastUserMessage.content;
        console.log(`🧠 ULTRA: Routing to ${targetModel}`);
        if (targetModel === "sdxl") {
          setMessages(prev => [...prev, {
            role: "assistant",
            content: "🎨 Generating image..."
          }]);
          const {
            data: imgData,
            error: imgError
          } = await supabase.functions.invoke("generate-sdxl", {
            body: {
              prompt: modifiedPrompt
            }
          });
          if (imgError) throw imgError;
          imageUrl = imgData.imageUrl;
          assistantContent = "Here's the image I generated based on your prompt:";
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              role: "assistant",
              content: assistantContent,
              imageUrl
            };
            return newMessages;
          });
        } else if (targetModel === "minimax-video") {
          setMessages(prev => [...prev, {
            role: "assistant",
            content: "🎬 Generating video with Minimax Video-01... (1 free video per week)"
          }]);
          const {
            data: vidData,
            error: vidError
          } = await supabase.functions.invoke("generate-video", {
            body: {
              prompt: modifiedPrompt
            }
          });
          if (vidError) {
            // Check for quota exceeded
            if (vidData?.quotaExceeded) {
              assistantContent = `⏳ ${vidData.error || "You've used your weekly video generation."}`;
            } else {
              throw vidError;
            }
          } else {
            const frames = vidData.frames || [];
            assistantContent = "Here's your AI-generated video:";
            setMessages(prev => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = {
                role: "assistant",
                content: assistantContent,
                frames
              };
              return newMessages;
            });
          }
        } else if (targetModel === "gpt-oss-120b") {
          await streamOpenRouterResponse(messages, conversationId);
          return;
        } else {
          await streamCloudflareResponse(messages, conversationId);
          return;
        }
      } catch (error) {
        console.error("ULTRA error:", error);
        throw new Error(`ULTRA orchestration failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    } else if (selectedModelId === "@openrouter/gpt-oss-120b") {
      await streamOpenRouterResponse(messages, conversationId);
      return;
    } else if (selectedModelId === "@cf/stabilityai/sdxl") {
      try {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "🎨 Generating image with SDXL..."
        }]);
        const {
          data: imgData,
          error: imgError
        } = await supabase.functions.invoke("generate-sdxl", {
          body: {
            prompt: lastUserMessage.content
          }
        });
        if (imgError) throw imgError;
        imageUrl = imgData.imageUrl;
        assistantContent = "Here's your SDXL generated image:";
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: "assistant",
            content: assistantContent,
            imageUrl
          };
          return newMessages;
        });
      } catch (error) {
        throw new Error(`SDXL generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    } else if (selectedModelId === "@replicate/minimax-video-01") {
      try {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "🎬 Generating video with Minimax Video-01... (1 free video per week)"
        }]);
        const {
          data: vidData,
          error: vidError
        } = await supabase.functions.invoke("generate-video", {
          body: {
            prompt: lastUserMessage.content
          }
        });
        if (vidError) {
          // Check for quota exceeded
          const errorMsg = vidError.message || "Video generation failed";
          throw new Error(errorMsg);
        }
        const frames = vidData.frames || [];
        assistantContent = "Here's your AI-generated video:";
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: "assistant",
            content: assistantContent,
            frames
          };
          return newMessages;
        });
      } catch (error) {
        throw new Error(`Video generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    } else {
      await streamCloudflareResponse(messages, conversationId);
      return;
    }
    if (assistantContent) {
      const insertData: any = {
        conversation_id: conversationId,
        role: "assistant",
        content: assistantContent,
        user_id: user!.id
      };
      if (imageUrl) insertData.image_url = imageUrl;
      await supabase.from("messages").insert(insertData);
    }
  };
  const streamOpenRouterResponse = async (messages: Message[], conversationId: string) => {
    let streamedContent = "";
    setIsStreaming(true);
    setMessages(prev => [...prev, {
      role: "assistant",
      content: ""
    }]);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openrouter-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          model: "gpt-oss-120b",
          stream: true
        })
      });
      if (!response.ok || !response.body) {
        setIsStreaming(false);
        throw new Error("Failed to start streaming");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const {
          done,
          value
        } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {
          stream: true
        });
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
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: "assistant",
                  content: streamedContent
                };
                return newMessages;
              });
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
      setIsStreaming(false);
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: streamedContent,
        user_id: user!.id
      });
    } catch (error) {
      setIsStreaming(false);
      throw error;
    }
  };
  const streamCloudflareResponse = async (messages: Message[], conversationId: string) => {
    let modelData: any;
    if (selectedModelId?.startsWith("@cf/") || selectedModelId?.startsWith("@hf/") || selectedModelId?.startsWith("@ollama/") || selectedModelId?.startsWith("@groq/")) {
      const {
        data: dbModel
      } = await supabase.from("models").select("*").eq("model_id", selectedModelId).single();
      if (dbModel) {
        modelData = dbModel;
      } else {
        modelData = {
          id: selectedModelId,
          model_id: selectedModelId,
          name: selectedModelId.split("/").pop(),
          display_name: selectedModelId,
          type: "text-generation"
        };
      }
    } else {
      const {
        data
      } = await supabase.from("models").select("*").eq("id", selectedModelId).single();
      if (!data) throw new Error("Model not found");
      modelData = data;
    }
    let streamedContent = "";
    setIsStreaming(true);
    setMessages(prev => [...prev, {
      role: "assistant",
      content: ""
    }]);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openchat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          modelId: selectedModelId,
          modelName: modelData.model_id,
          researchMode,
          studyMode,
          webSurfingMode
        })
      });
      if (!response.ok || !response.body) {
        setIsStreaming(false);
        throw new Error("Failed to start streaming");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const {
          done,
          value
        } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {
          stream: true
        });
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
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: "assistant",
                  content: streamedContent
                };
                return newMessages;
              });
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
      setIsStreaming(false);
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: streamedContent,
        user_id: user!.id
      });
    } catch (error) {
      setIsStreaming(false);
      throw error;
    }
  };
  const handleSend = async () => {
    if (isLoading) return;
    const validation = messageSchema.safeParse({
      content: input
    });
    if (!validation.success) {
      toast({
        title: "Invalid input",
        description: validation.error.errors[0].message,
        variant: "destructive"
      });
      return;
    }
    const userMessage: Message = {
      role: "user",
      content: input.trim()
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // If user is logged in, save to database
    if (user) {
      let conversationId = currentConversationId;
      if (!conversationId) {
        const {
          data,
          error
        } = await supabase.from("conversations").insert({
          title: "New Conversation",
          user_id: user.id
        }).select().single();
        if (error || !data) {
          toast({
            title: "Error",
            description: "Failed to create conversation",
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }
        conversationId = data.id;
        setCurrentConversationId(conversationId);
        fetchConversations();
      }
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "user",
        content: userMessage.content,
        user_id: user.id
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
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      // Guest mode - just generate AI response without saving
      try {
        await generateGuestAI(newMessages);
      } catch (error) {
        console.error("Error sending message:", error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to send message",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Guest AI generation (no database, just streaming)
  const generateGuestAI = async (messages: Message[]) => {
    let streamedContent = "";
    setIsStreaming(true);
    setMessages(prev => [...prev, {
      role: "assistant",
      content: ""
    }]);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openrouter-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          model: "gpt-oss-120b",
          stream: true
        })
      });
      if (!response.ok || !response.body) {
        setIsStreaming(false);
        throw new Error("Failed to start streaming");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const {
          done,
          value
        } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {
          stream: true
        });
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
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: "assistant",
                  content: streamedContent
                };
                return newMessages;
              });
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
      setIsStreaming(false);
    } catch (error) {
      setIsStreaming(false);
      throw error;
    }
  };
  const onHomeSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!homeQuery.trim()) return;
    setViewMode("search");
  };
  const onHomeAiSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!homeAiQuery.trim()) return;
    setInput(homeAiQuery);
    setHomeAiQuery("");
    setViewMode("chat");
    // The message will be handled after view mode changes
  };
  const enterChatMode = () => {
    setViewMode("chat");
  };
  const skipLogin = () => {
    sessionStorage.setItem("infinity_login_skipped", "true");
    setShowLoginPrompt(false);
  };

  // Show loading while checking auth
  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>;
  }

  // HOME PAGE - Premium, minimal design
  if (viewMode === "home") {
    return <div className="min-h-screen w-full" style={{
      background: "linear-gradient(180deg, #ffffff 0%, #fafbff 30%, #f0f4ff 60%, #e8eeff 100%)"
    }}>
        {/* Login Prompt Dialog */}
        <Dialog open={showLoginPrompt} onOpenChange={setShowLoginPrompt}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <img src={logo} alt="Infinity AI" className="w-10 h-10 rounded-xl object-cover" />
                Welcome to Infinity AI
              </DialogTitle>
              <DialogDescription className="pt-2">
                Sign in to save conversations, access all AI models, and unlock the full experience.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 mt-4">
              <Button onClick={() => {
              setShowLoginPrompt(false);
              navigate("/auth");
            }} size="lg" className="w-full">
                <User className="w-4 h-4 mr-2" />
                Sign in
              </Button>
              <Button variant="outline" onClick={skipLogin} size="lg" className="w-full">
                Skip for now
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Subtle gradient overlay */}
        <div className="fixed inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(139, 92, 246, 0.08), transparent), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(96, 165, 250, 0.06), transparent)"
      }} />

        {/* Header */}
        <header className="relative z-10 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
          <button onClick={() => setViewMode("home")} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img alt="Infinity AI" className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-primary/20" src="/lovable-uploads/678c18c3-bdaa-4445-92d0-3e30ace54609.png" />
            <span className="text-xl font-semibold text-foreground">Infinity AI</span>
          </button>

          <SiteNav className="hidden md:flex" />

          <div className="flex items-center gap-3">
            {user ? <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:block">{user.email}</span>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </Button>
              </div> : <Button variant="outline" size="sm" onClick={() => navigate("/auth")}>
                <User className="w-4 h-4 mr-2" />
                Sign in
              </Button>}
          </div>
        </header>

        {/* Hero Section */}
        <main className="relative z-10 flex flex-col items-center justify-center px-6 pt-12 pb-24 min-h-[calc(100vh-80px)]">
          {/* Infinity Symbol */}
          <div className="mb-6">
            <img alt="Infinity AI" className="w-24 h-24 object-contain rounded-2xl shadow-lg" src="/lovable-uploads/a4ea12ee-c5c9-48d7-a6b4-fac38d9be01a.png" />
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-center text-foreground mb-4 tracking-tight">
            Infinite Intelligence
          </h1>
          <h2 className="text-xl md:text-2xl text-muted-foreground text-center mb-6 font-light">
            Fast. Powerful. Simple.
          </h2>

          {/* Description */}
          <p className="text-center text-muted-foreground max-w-2xl mb-10 text-lg leading-relaxed">
            Search the web instantly or have a conversation with ultra-powerful AI. 
            Get answers, explore ideas, and discover more — all in one place.
          </p>

          {/* Dual Input Bars */}
          <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* AI Chat Input */}
            <form onSubmit={onHomeAiSubmit} className="w-full">
              <div className="flex items-center gap-3 p-2 rounded-2xl h-14" style={{
              background: "linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(139, 92, 246, 0.04))",
              boxShadow: "0 4px 24px rgba(139, 92, 246, 0.1), 0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255,255,255,0.9)",
              border: "1px solid rgba(139, 92, 246, 0.15)"
            }}>
                <MessageSquare className="w-5 h-5 text-primary ml-4" />
                <Input placeholder="Ask AI anything..." value={homeAiQuery} onChange={e => setHomeAiQuery(e.target.value)} className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base placeholder:text-muted-foreground/60" />
                <Button type="submit" size="sm" className="rounded-xl px-4 mr-1">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </form>

            {/* Web Search Input */}
            <form onSubmit={onHomeSearchSubmit} className="w-full">
              <div className="flex items-center gap-3 p-2 rounded-2xl h-14" style={{
              background: "linear-gradient(135deg, rgba(96, 165, 250, 0.08), rgba(96, 165, 250, 0.04))",
              boxShadow: "0 4px 24px rgba(96, 165, 250, 0.1), 0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255,255,255,0.9)",
              border: "1px solid rgba(96, 165, 250, 0.15)"
            }}>
                <Search className="w-5 h-5 text-secondary ml-4" />
                <Input placeholder="Search the web..." value={homeQuery} onChange={e => setHomeQuery(e.target.value)} className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base placeholder:text-muted-foreground/60" />
                <Button type="submit" size="sm" variant="secondary" className="rounded-xl px-4 mr-1">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </form>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-10">
            <Button size="lg" onClick={enterChatMode} className="rounded-xl px-8 py-6 text-base shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all">
              <MessageSquare className="w-5 h-5 mr-2" />
              Start Chatting
            </Button>

            <Button size="lg" variant="ghost" onClick={() => setViewMode("search")} className="rounded-xl px-8 py-6 text-base">
              <Search className="w-5 h-5 mr-2" />
              Browse Search
            </Button>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mt-6">
            {[{
            title: "Intelligent Search",
            description: "Find answers instantly with AI-powered web search",
            icon: Search
          }, {
            title: "Smart Conversations",
            description: "Chat naturally and get helpful, accurate responses",
            icon: MessageSquare
          }, {
            title: "Ultra-Fast",
            description: "Optimized for speed without compromising quality",
            icon: Code2
          }].map((feature, idx) => <div key={idx} className="p-6 rounded-2xl text-center" style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.4))",
            boxShadow: "0 4px 20px rgba(139, 92, 246, 0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
            backdropFilter: "blur(10px)"
          }}>
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>)}
          </div>

          {/* Login prompt for chat */}
          {!user && <p className="mt-10 text-sm text-muted-foreground">
              <button onClick={() => navigate("/auth")} className="text-primary hover:underline font-medium">
                Sign in
              </button>
              {" "}to save conversations and access all features
            </p>}
        </main>
      </div>;
  }

  // App views (Chat, Search, Admin) - require sidebar
  return <SidebarProvider>
      <div className="min-h-screen w-full" style={{
      background: "radial-gradient(1200px 600px at 10% 10%, rgba(99,102,241,0.06), transparent 10%), radial-gradient(900px 450px at 90% 90%, rgba(139,92,246,0.04), transparent 10%), linear-gradient(180deg,#ffffff 0%, #f8fafc 40%, #eef2ff 100%)"
    }}>
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {viewMode === "chat" && <SidebarTrigger>
                  <Menu className="h-5 w-5" />
                </SidebarTrigger>}
              <button onClick={() => setViewMode("home")} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img alt="Infinity AI" className="w-10 h-10 rounded-lg object-cover" src="/lovable-uploads/0a14c839-e491-45b6-80f7-f4f38ade99ca.png" />
                <div>
                  <h1 className="text-lg font-semibold text-foreground">Infinity AI</h1>
                  <p className="text-xs text-muted-foreground">Search & Chat</p>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <SiteNav className="hidden lg:flex mr-2" />
              <Button variant={viewMode === "chat" ? "default" : "ghost"} size="sm" onClick={enterChatMode}>
                <MessageSquare className="w-4 h-4 mr-2" />
                Chat
              </Button>
              <Button variant={viewMode === "search" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("search")}>
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
              {isAdmin && <Button variant={viewMode === "admin" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("admin")}>
                  <Code2 className="w-4 h-4 mr-2" />
                  Admin
                </Button>}
              {user ? <Button variant="outline" onClick={handleLogout} size="sm">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </Button> : <Button variant="outline" onClick={() => navigate("/auth")} size="sm">
                  <User className="w-4 h-4 mr-2" />
                  Sign in
                </Button>}
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {viewMode === "chat" ? <div className="flex gap-6">
              {user && <ConversationSidebar conversations={conversations} currentConversationId={currentConversationId} onSelectConversation={setCurrentConversationId} onNewConversation={createNewConversation} onDeleteConversation={deleteConversation} researchMode={researchMode} onResearchModeChange={setResearchMode} studyMode={studyMode} onStudyModeChange={setStudyMode} webSurfingMode={webSurfingMode} onWebSurfingModeChange={setWebSurfingMode} />}

              <div className="flex-1">
                {user && <ModelSelector selectedModelId={selectedModelId} onSelectModel={setSelectedModelId} />}
                
                {/* Guest mode notice */}
                {!user && <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Guest mode</span> - Sign in to save conversations and access more models
                    </p>
                    <Button variant="outline" size="sm" onClick={() => navigate("/auth")}>
                      <User className="w-4 h-4 mr-2" />
                      Sign in
                    </Button>
                  </div>}

                <Card className="h-[calc(100vh-18rem)] flex flex-col bg-card/50 backdrop-blur-sm border-border mt-4">
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.length === 0 && <div className="h-full flex items-center justify-center">
                        <div className="text-center space-y-3">
                          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                            <MessageSquare className="w-8 h-8 text-background" />
                          </div>
                          <h2 className="text-xl font-semibold text-foreground">Start a conversation</h2>
                          <p className="text-muted-foreground max-w-md">
                            {user ? "Ask me anything!" : "Ask me anything! Sign in to save your conversations."}
                          </p>
                        </div>
                      </div>}

                    {messages.map((msg, idx) => <ChatMessage key={idx} role={msg.role} content={msg.content} imageUrl={msg.imageUrl} frames={msg.frames} isStreaming={isStreaming && idx === messages.length - 1 && msg.role === "assistant"} />)}

                    {isLoading && messages[messages.length - 1]?.role === "user" && <div className="flex gap-3 p-4 rounded-lg bg-card mr-8">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-background animate-spin" />
                        </div>
                        <div className="flex-1 pt-1">
                          <p className="text-sm text-muted-foreground">Thinking...</p>
                        </div>
                      </div>}

                    <div ref={messagesEndRef} />
                  </div>

                  <div className="border-t border-border p-4 bg-background/50">
                    <div className="flex gap-2">
                      <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} placeholder="Type your message..." disabled={isLoading} className="flex-1" />
                      <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </div> : viewMode === "search" ? <div className="h-[calc(100vh-12rem)] overflow-y-auto">
              <SearchTab />
            </div> : <Card className="h-[calc(100vh-12rem)] p-6 bg-card/50 backdrop-blur-sm border-border overflow-hidden">
              <AdminPanel knowledgeEntries={knowledgeEntries} onRefresh={fetchKnowledge} />
            </Card>}
        </div>
      </div>
    </SidebarProvider>;
};
export default Index;