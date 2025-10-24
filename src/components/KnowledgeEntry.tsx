import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, FileText, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface KnowledgeEntryProps {
  id: string;
  title: string;
  content: string;
  sourceType: string;
  createdAt: string;
  onDelete: (id: string) => void;
}

export const KnowledgeEntry = ({
  id,
  title,
  content,
  sourceType,
  createdAt,
  onDelete,
}: KnowledgeEntryProps) => {
  return (
    <Card className="p-4 bg-card border-border hover:border-primary/50 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-primary flex-shrink-0" />
            <h3 className="font-semibold text-sm text-foreground truncate">{title}</h3>
            <Badge variant="secondary" className="text-xs">
              {sourceType}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{content}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {new Date(createdAt).toLocaleDateString()}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(id)}
          className="flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
};