import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Upload, GraduationCap, Cpu, Zap, Brain, Image, Video } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { KnowledgeEntry } from "./KnowledgeEntry";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { z } from "zod";
import { extractTextFromFile } from "@/lib/fileTextExtractor";

interface KnowledgeEntryType {
  id: string;
  title: string;
  content: string;
  source_type: string;
  created_at: string;
  model_id: string | null;
}

interface Model {
  id: string;
  display_name: string;
  name: string;
}

interface TeachPanelProps {
  userId: string;
}

const SPECIAL_MODELS = [
  { id: "@ultra/orchestrator", display_name: "ULTRA", name: "ultra" },
  { id: "@openrouter/gpt-oss-120b", display_name: "GPT-OSS-120B", name: "gpt-oss-120b" },
  { id: "@cf/stabilityai/sdxl", display_name: "Stable Diffusion XL", name: "sdxl" },
  { id: "@replicate/minimax-video-01", display_name: "Minimax Video-01", name: "minimax-video-01" },
];

const knowledgeSchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty").max(200, "Title must be less than 200 characters"),
  content: z.string().trim().min(1, "Content cannot be empty").max(50000, "Content must be less than 50,000 characters"),
});

export const TeachPanel = ({ userId }: TeachPanelProps) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>("@ultra/orchestrator");
  const [models, setModels] = useState<Model[]>([]);
  const [entries, setEntries] = useState<KnowledgeEntryType[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchModels();
    fetchEntries();
  }, []);

  const fetchModels = async () => {
    const { data, error } = await supabase
      .from("models")
      .select("id, display_name, name")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching models:", error);
      return;
    }

    setModels([...SPECIAL_MODELS, ...(data || [])]);
  };

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from("knowledge_entries")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching entries:", error);
      return;
    }
    setEntries(data || []);
  };

  const handleAddKnowledge = async () => {
    const validation = knowledgeSchema.safeParse({ title, content });
    if (!validation.success) {
      toast({ title: "Invalid input", description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }

    setIsAdding(true);
    try {
      const { error } = await supabase.from("knowledge_entries").insert({
        title: title.trim(),
        content: content.trim(),
        source_type: "manual",
        model_id: selectedModelId,
        user_id: userId,
      });
      if (error) throw error;
      toast({ title: "Knowledge added", description: "Successfully taught the AI!" });
      setTitle("");
      setContent("");
      fetchEntries();
    } catch (error) {
      console.error("Error adding knowledge:", error);
      toast({ title: "Error", description: "Failed to add knowledge", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    try {
      const { error } = await supabase.from("knowledge_entries").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Knowledge deleted", description: "Successfully removed knowledge entry" });
      fetchEntries();
    } catch (error) {
      console.error("Error deleting knowledge:", error);
      toast({ title: "Error", description: "Failed to delete knowledge", variant: "destructive" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await extractTextFromFile(file);
      if (!text || text.trim().length === 0) {
        toast({ title: "Empty file", description: "Could not extract text from this file", variant: "destructive" });
        return;
      }
      const { error } = await supabase.from("knowledge_entries").insert({
        title: file.name,
        content: text.substring(0, 50000),
        source_type: "file",
        model_id: selectedModelId,
        user_id: userId,
      });
      if (error) throw error;
      toast({ title: "File uploaded", description: "Successfully added file content to your knowledge base" });
      fetchEntries();
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({ title: "Error", description: "Failed to upload file", variant: "destructive" });
    }
    // Reset the file input
    e.target.value = "";
  };

  const getModelIcon = (model: Model) => {
    if (model.name === "ultra") return <Zap className="w-3 h-3" />;
    if (model.name === "gpt-oss-120b") return <Brain className="w-3 h-3" />;
    if (model.name === "sdxl") return <Image className="w-3 h-3" />;
    if (model.name === "minimax-video-01") return <Video className="w-3 h-3" />;
    return <Cpu className="w-3 h-3" />;
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Teach Your AI</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="teach-model">Assign to Model</Label>
            <Select value={selectedModelId} onValueChange={setSelectedModelId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex items-center gap-2">
                      {getModelIcon(model)}
                      <span>{model.display_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="teach-title">Knowledge Title</Label>
            <Input
              id="teach-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., My Notes on React"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="teach-content">Content</Label>
            <Textarea
              id="teach-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter the knowledge you want to teach your AI..."
              className="mt-1 min-h-[120px] resize-none"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleAddKnowledge} disabled={isAdding} className="flex-1">
              <Plus className="w-4 h-4 mr-2" />
              Add Knowledge
            </Button>

            <Button variant="outline" className="relative" asChild>
              <label>
                <Upload className="w-4 h-4 mr-2" />
                Upload File
                <input
                  type="file"
                  accept=".txt,.md,.json,.csv,.xml,.html,.js,.ts,.py,.java,.c,.cpp,.css,.yaml,.yml,.toml,.ini,.cfg,.log,.pdf,.docx,.doc"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleFileUpload}
                />
              </label>
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex-1 overflow-auto space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground px-1">
          Your Knowledge Base ({entries.length})
        </h3>
        {entries.map((entry) => {
          const model = models.find((m) => m.id === entry.model_id);
          return (
            <KnowledgeEntry
              key={entry.id}
              id={entry.id}
              title={entry.title}
              content={entry.content}
              sourceType={entry.source_type}
              createdAt={entry.created_at}
              model_id={entry.model_id}
              model_name={model?.display_name}
              onDelete={handleDeleteKnowledge}
            />
          );
        })}
      </div>
    </div>
  );
};
