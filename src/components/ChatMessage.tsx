import { cn } from "@/lib/utils";
import { Bot, User, Loader2 } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  isStreaming?: boolean;
}

export const ChatMessage = ({ role, content, imageUrl, isStreaming = false }: ChatMessageProps) => {
  return (
    <div
      className={cn(
        "flex gap-3 p-4 rounded-lg transition-all",
        role === "user"
          ? "bg-primary/10 ml-8"
          : "bg-card mr-8"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-gradient-to-br from-primary to-secondary text-background"
        )}
      >
        {role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className="flex-1 pt-1">
        {content ? (
          <p className="text-sm text-foreground whitespace-pre-wrap">{content}</p>
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        ) : null}
        {imageUrl && (
          <div className="mt-3">
            <img 
              src={imageUrl} 
              alt="Generated image" 
              className="rounded-lg max-w-full h-auto shadow-lg"
            />
          </div>
        )}
      </div>
    </div>
  );
};