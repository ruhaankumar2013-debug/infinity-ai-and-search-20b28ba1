import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Cpu, Sparkles } from "lucide-react";

interface Model {
  id: string;
  name: string;
  display_name: string;
  model_id: string;
  type: string;
  description: string;
  parameters: string;
  is_active: boolean;
}

interface ModelSelectorProps {
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
}

export const ModelSelector = ({
  selectedModelId,
  onSelectModel,
}: ModelSelectorProps) => {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    const { data, error } = await supabase
      .from("models")
      .select("*")
      .eq("is_active", true)
      .eq("type", "text-generation")
      .or(
        "model_id.like.@cf/%,model_id.like.@hf/%,model_id.like.@ollama/%,model_id.like.@groq/%"
      )
      .order("parameters", { ascending: true });

    if (error) {
      console.error("Error fetching models:", error);
      setIsLoading(false);
      return;
    }

    // ✅ Force TS type
    let modelsList: Model[] = (data || []) as Model[];

    // ✅ Inject GPT-OSS-120B if missing from database
    const gptOSSModelId = "@cf/openai/gpt-oss-120b";
    if (!modelsList.find((m) => m.model_id === gptOSSModelId)) {
      const gptOSS: Model = {
        id: gptOSSModelId, // Use model_id as id for client-side models
        name: "gpt-oss-120b",
        display_name: "GPT-OSS-120B",
        model_id: gptOSSModelId,
        type: "text-generation",
        description: "GPT-OSS 120B model from Cloudflare. A powerful open-source language model with 120 billion parameters.",
        parameters: "120B",
        is_active: true,
      };
      modelsList = [gptOSS, ...modelsList];
    }

    setModels(modelsList);

    // Auto-select Mistral 7B as default if none selected
    if (modelsList.length > 0 && !selectedModelId) {
      const mistralModel = modelsList.find(
        (m) => m.name === "mistral-7b-instruct"
      );
      onSelectModel(mistralModel ? mistralModel.id : modelsList[0].id);
    }

    setIsLoading(false);
  };

  const selectedModel = models.find((m) => m.id === selectedModelId);

  return (
    <Card className="p-4 bg-card/30 border-border">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">API Models</h3>
          <Badge variant="outline" className="ml-auto">
            <Sparkles className="w-3 h-3 mr-1" />
            Cloud
          </Badge>
        </div>

        <Select
          value={selectedModelId || undefined}
          onValueChange={onSelectModel}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a model..." />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{model.display_name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {model.parameters}
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedModel && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
            {selectedModel.description}
          </div>
        )}

        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Cpu className="w-3 h-3" />
          <span>Cloudflare Workers AI • Fast & Scalable</span>
        </div>
      </div>
    </Card>
  );
};
