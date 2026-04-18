import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Upload, BookOpen } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { KnowledgeEntry } from "./KnowledgeEntry";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { z } from "zod";
import { extractTextFromFile } from "@/lib/fileTextExtractor";
import { Cpu, Zap, Brain } from "lucide-react";
import { SPECIAL_TEACHABLE_MODELS } from "@/lib/teachableModels";

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

interface AdminPanelProps {
  knowledgeEntries: KnowledgeEntryType[];
  onRefresh: () => void;
}

// Validation schema
const knowledgeSchema = z.object({
  title: z.string()
    .trim()
    .min(1, "Title cannot be empty")
    .max(200, "Title must be less than 200 characters"),
  content: z.string()
    .trim()
    .min(1, "Content cannot be empty")
    .max(50000, "Content must be less than 50,000 characters"),
});

export const AdminPanel = ({ knowledgeEntries, onRefresh }: AdminPanelProps) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    // Only text-generation models can be "taught" with knowledge entries
    const { data, error } = await supabase
      .from("models")
      .select("id, display_name, name, type")
      .eq("is_active", true)
      .eq("type", "text-generation")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching models:", error);
      return;
    }

    const allModels = [...SPECIAL_TEACHABLE_MODELS, ...(data || [])];
    setModels(allModels);
    if (allModels.length > 0 && !selectedModelId) {
      setSelectedModelId(allModels[0].id);
    }
  };

  const handleAddKnowledge = async () => {
    // Validate input
    const validation = knowledgeSchema.safeParse({
      title,
      content,
    });
    
    if (!validation.success) {
      toast({
        title: "Invalid input",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    try {
      const { error } = await supabase.from("knowledge_entries").insert({
        title: title.trim(),
        content: content.trim(),
        source_type: "manual",
        model_id: selectedModelId,
      });

      if (error) throw error;

      toast({
        title: "Knowledge added",
        description: "Successfully added new knowledge to the AI",
      });

      setTitle("");
      setContent("");
      onRefresh();
    } catch (error) {
      console.error("Error adding knowledge:", error);
      toast({
        title: "Error",
        description: "Failed to add knowledge",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    try {
      const { error } = await supabase
        .from("knowledge_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Knowledge deleted",
        description: "Successfully removed knowledge entry",
      });

      onRefresh();
    } catch (error) {
      console.error("Error deleting knowledge:", error);
      toast({
        title: "Error",
        description: "Failed to delete knowledge",
        variant: "destructive",
      });
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
      });

      if (error) throw error;

      toast({
        title: "File uploaded",
        description: "Successfully added file content to knowledge base",
      });

      onRefresh();
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    }
    e.target.value = "";
  };

  const getModelIcon = (model: Model) => {
    if (model.name === "ultra") return <Zap className="w-3 h-3" />;
    if (
      model.name === "gpt-oss-120b" ||
      model.name === "gemma-4-31b" ||
      model.name === "nemotron-3-super"
    )
      return <Brain className="w-3 h-3" />;
    return <Cpu className="w-3 h-3" />;
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Teach the AI</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="model">Assign to Model</Label>
            <Select value={selectedModelId || undefined} onValueChange={setSelectedModelId}>
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
            <Label htmlFor="title">Knowledge Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Company Policies"
              className="mt-1"
            />
          </div>
          
          <div>
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter the knowledge you want to teach the AI..."
              className="mt-1 min-h-[120px] resize-none"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleAddKnowledge}
              disabled={isAdding}
              className="flex-1"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Knowledge
            </Button>
            
            <Button variant="outline" className="relative" asChild>
              <label>
                <Upload className="w-4 h-4 mr-2" />
                Upload File
                <input
                  type="file"
                  accept=".txt,.md,.json,.csv,.xml,.html,.js,.ts,.py,.java,.c,.cpp,.css,.yaml,.yml,.toml,.ini,.cfg,.log"
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
          Knowledge Base ({knowledgeEntries.length})
        </h3>
        {knowledgeEntries.map((entry) => {
          const model = models.find(m => m.id === entry.model_id);
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