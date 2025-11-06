import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Globe, Sparkles } from "lucide-react";

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

interface BrowserModelSelectorProps {
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
}

export const BrowserModelSelector = ({ selectedModelId, onSelectModel }: BrowserModelSelectorProps) => {
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
      .in("type", ["text-generation", "image-generation"])
      .not("model_id", "like", "@cf/%")
      .not("model_id", "like", "@hf/%")
      .order("type", { ascending: true });

    if (error) {
      console.error("Error fetching browser models:", error);
      return;
    }

    setModels(data || []);
    setIsLoading(false);
  };

  const selectedModel = models.find(m => m.id === selectedModelId);

  return (
    <Card className="p-4 bg-card/30 border-border">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Browser Models</h3>
          <Badge variant="outline" className="ml-auto">
            <Sparkles className="w-3 h-3 mr-1" />
            Local
          </Badge>
        </div>

        <Select value={selectedModelId || undefined} onValueChange={onSelectModel} disabled={isLoading}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a browser model..." />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{model.display_name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {model.type === "image-generation" ? "Image" : model.parameters}
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
          <Globe className="w-3 h-3" />
          <span>Runs in your browser • No API costs • 100% Private</span>
        </div>
      </div>
    </Card>
  );
};
