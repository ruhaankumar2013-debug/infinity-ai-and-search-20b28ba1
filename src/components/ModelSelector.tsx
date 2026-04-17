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
import { Cpu, Sparkles, Zap, Image, Video, Brain } from "lucide-react";

interface Model {
  id: string;
  name: string;
  display_name: string;
  model_id: string;
  type: string;
  description: string;
  parameters: string;
  is_active: boolean;
  badge?: string;
}

interface ModelSelectorProps {
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
}

// Virtual and special models that are always available
const SPECIAL_MODELS: Model[] = [
  {
    id: "@ultra/orchestrator",
    name: "ultra",
    display_name: "ULTRA",
    model_id: "@ultra/orchestrator",
    type: "orchestrator",
    description: "Smart AI orchestrator that automatically routes your prompt to the best model. Uses GPT-OSS-120B for intelligent routing.",
    parameters: "Smart",
    is_active: true,
    badge: "Smart Routing",
  },
  {
    id: "@openrouter/gpt-oss-120b",
    name: "gpt-oss-120b",
    display_name: "GPT-OSS-120B",
    model_id: "@openrouter/gpt-oss-120b",
    type: "text-generation",
    description: "Powerful 120B parameter reasoning model via OpenRouter. Excels at analysis, coding, math, and complex reasoning.",
    parameters: "120B",
    is_active: true,
    badge: "Reasoning",
  },
  {
    id: "@openrouter/gemma-4-31b",
    name: "gemma-4-31b",
    display_name: "Gemma 4 31B",
    model_id: "@openrouter/gemma-4-31b",
    type: "text-generation",
    description: "Google's Gemma 4 31B Instruct (free) via OpenRouter. Balanced reasoning and multilingual capabilities.",
    parameters: "31B",
    is_active: true,
    badge: "Balanced",
  },
  {
    id: "@openrouter/nemotron-3-super",
    name: "nemotron-3-super",
    display_name: "Nemotron 3 Super",
    model_id: "@openrouter/nemotron-3-super",
    type: "text-generation",
    description: "NVIDIA Nemotron 3 Super 120B A12B (free) via OpenRouter. Strong technical reasoning and code.",
    parameters: "120B",
    is_active: true,
    badge: "Technical",
  },
  {
    id: "@cf/stabilityai/sdxl",
    name: "sdxl",
    display_name: "Stable Diffusion XL",
    model_id: "@cf/stabilityai/sdxl",
    type: "image-generation",
    description: "High-quality image generation using Stable Diffusion XL. Apache 2.0 licensed.",
    parameters: "SDXL",
    is_active: true,
    badge: "Image",
  },
  {
    id: "@replicate/minimax-video-01",
    name: "minimax-video-01",
    display_name: "Minimax Video-01",
    model_id: "@replicate/minimax-video-01",
    type: "video-generation",
    description: "High-quality video generation via Replicate. 1 free video per week (admins: unlimited).",
    parameters: "Pro",
    is_active: true,
    badge: "Video",
  },
];

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

    let modelsList: Model[] = (data || []) as Model[];

    // Add special models at the top
    modelsList = [...SPECIAL_MODELS, ...modelsList];

    setModels(modelsList);

    // Auto-select ULTRA as default if none selected
    if (modelsList.length > 0 && !selectedModelId) {
      const ultraModel = modelsList.find((m) => m.id === "@ultra/orchestrator");
      onSelectModel(ultraModel ? ultraModel.id : modelsList[0].id);
    }

    setIsLoading(false);
  };

  const selectedModel = models.find((m) => m.id === selectedModelId);

  const getModelIcon = (model: Model) => {
    if (model.type === "image-generation") return <Image className="w-3 h-3" />;
    if (model.type === "video-generation") return <Video className="w-3 h-3" />;
    if (model.type === "orchestrator") return <Zap className="w-3 h-3" />;
    if (model.name === "gpt-oss-120b") return <Brain className="w-3 h-3" />;
    return <Cpu className="w-3 h-3" />;
  };

  const getBadgeVariant = (model: Model): "default" | "secondary" | "outline" | "destructive" => {
    if (model.type === "orchestrator") return "default";
    if (model.type === "image-generation") return "secondary";
    if (model.type === "video-generation") return "secondary";
    return "outline";
  };

  return (
    <Card className="p-4 bg-card/30 border-border">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">AI Models</h3>
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
                  {getModelIcon(model)}
                  <span className="font-medium">{model.display_name}</span>
                  <Badge variant={getBadgeVariant(model)} className="text-xs">
                    {model.badge || model.parameters}
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
          {selectedModel?.type === "orchestrator" ? (
            <>
              <Zap className="w-3 h-3" />
              <span>ULTRA • Intelligent Model Routing</span>
            </>
          ) : selectedModel?.id.startsWith("@openrouter/") ? (
            <>
              <Brain className="w-3 h-3" />
              <span>OpenRouter • High-Capability Models</span>
            </>
          ) : (
            <>
              <Cpu className="w-3 h-3" />
              <span>Cloudflare Workers AI • Fast & Scalable</span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};
