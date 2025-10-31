import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Code2, MessageSquare, Loader2, Menu, LogOut } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/components/ChatMessage";
import { AdminPanel } from "@/components/AdminPanel";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ModelSelector } from "@/components/ModelSelector";
import { generateText } from "@/services/browserAI";
import type { User, Session } from "@supabase/supabase-js";

interface Message {
  role: "user" | "assistant";
  content: string;
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

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"chat" | "admin">("chat");
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
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
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate("/auth");
      } else {
        checkAdminStatus(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
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

    const formattedMessages = (data || []).map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    setMessages(formattedMessages);
  };

  const createNewConversation = async () => {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ title: "New Conversation" })
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
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id);

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
    await supabase
      .from("conversations")
      .update({ title })
      .eq("id", conversationId);
  };

  const generateWithBrowserAI = async (messages: Message[], conversationId: string) => {
    if (!selectedModelId) {
      toast({
        title: "No model selected",
        description: "Please select an AI model first",
        variant: "destructive",
      });
      throw new Error("No model selected");
    }

    // Fetch the model details and its knowledge
    const { data: modelData } = await supabase
      .from("models")
      .select("*")
      .eq("id", selectedModelId)
      .single();

    if (!modelData) {
      throw new Error("Model not found");
    }

    // Fetch knowledge entries for this model
    const { data: knowledgeData } = await supabase
      .from("knowledge_entries")
      .select("*")
      .eq("model_id", selectedModelId);

    // Build system prompt with knowledge
    let systemPrompt = "You are a helpful AI assistant.";
    if (knowledgeData && knowledgeData.length > 0) {
      systemPrompt += "\n\nYou have access to the following knowledge:\n\n";
      knowledgeData.forEach((entry) => {
        systemPrompt += `## ${entry.title}\n${entry.content}\n\n`;
      });
    }

    // Get the last user message
    const lastUserMessage = messages[messages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== "user") {
      throw new Error("No user message found");
    }

    let assistantContent = "";

    // Check if this is the Mistral API model (starts with @cf/)
    if (modelData.model_id.startsWith('@cf/')) {
      // Use edge function for Mistral 7B
      try {
        const { data, error } = await supabase.functions.invoke('openchat', {
          body: { 
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: lastUserMessage.content }
            ]
          }
        });

        if (error) throw error;

        assistantContent = data.response;
        setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
      } catch (error) {
        console.error("Mistral API error:", error);
        throw new Error("Failed to generate response with Mistral 7B. Please try again.");
      }
    } else {
      // Use browser AI for local models
      try {
        // Generate with streaming
        await generateText(
          lastUserMessage.content,
          {
            model: modelData.model_id,
            systemPrompt,
            maxTokens: 512,
            temperature: 0.7,
          },
          (token: string) => {
            assistantContent += token;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, content: assistantContent } : m
                );
              }
              return [...prev, { role: "assistant", content: assistantContent }];
            });
          }
        );
      } catch (error) {
        console.error("Browser AI error:", error);
        
        // Fallback to non-streaming
        try {
          assistantContent = await generateText(
            lastUserMessage.content,
            {
              model: modelData.model_id,
              systemPrompt,
              maxTokens: 512,
              temperature: 0.7,
            }
          );

          setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
        } catch (fallbackError) {
          console.error("Fallback error:", fallbackError);
          throw new Error("Failed to generate response. Please try again or select a different model.");
        }
      }
    }

    // Save the complete assistant message to database
    if (assistantContent) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: assistantContent,
      });
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Create new conversation if none exists
    let conversationId = currentConversationId;
    if (!conversationId) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ title: "New Conversation" })
        .select()
        .single();

      if (error || !data) {
        toast({
          title: "Error",
          description: "Failed to create conversation",
          variant: "destructive",
        });
        return;
      }

      conversationId = data.id;
      setCurrentConversationId(conversationId);
      fetchConversations();
    }

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // Save user message to database
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: userMessage.content,
    });

    // Update conversation title with first message
    if (messages.length === 0) {
      updateConversationTitle(conversationId, userMessage.content);
    }

    try {
      await generateWithBrowserAI(newMessages, conversationId);
      fetchConversations(); // Refresh to update timestamps
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background flex w-full">
        <ConversationSidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={setCurrentConversationId}
          onNewConversation={createNewConversation}
          onDeleteConversation={deleteConversation}
        />

        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SidebarTrigger>
                    <Menu className="h-5 w-5" />
                  </SidebarTrigger>
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <Code2 className="w-6 h-6 text-background" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-foreground">Infinity AI</h1>
                    <p className="text-xs text-muted-foreground">Apache 2.0 Models • Browser AI</p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant={viewMode === "chat" ? "default" : "outline"}
                    onClick={() => setViewMode("chat")}
                    size="sm"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Chat
                  </Button>
                  {isAdmin && (
                    <Button
                      variant={viewMode === "admin" ? "default" : "outline"}
                      onClick={() => setViewMode("admin")}
                      size="sm"
                    >
                      <Code2 className="w-4 h-4 mr-2" />
                      Admin
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleLogout}
                    size="sm"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <div className="flex-1 container mx-auto px-4 py-6 max-w-6xl">
        {viewMode === "chat" ? (
          <div className="space-y-4">
            <ModelSelector 
              selectedModelId={selectedModelId}
              onSelectModel={setSelectedModelId}
            />
          <Card className="h-[calc(100vh-18rem)] flex flex-col bg-card/50 backdrop-blur-sm border-border">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                      <MessageSquare className="w-8 h-8 text-background" />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground">Start a conversation</h2>
                    <p className="text-muted-foreground max-w-md">
                      Ask me anything! I've been trained with custom knowledge from the admin panel.
                    </p>
                  </div>
                </div>
              )}
              {messages.map((msg, idx) => (
                <ChatMessage key={idx} role={msg.role} content={msg.content} />
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

            {/* Input */}
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
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </Card>
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