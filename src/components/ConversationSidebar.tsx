import { MessageSquare, Plus, Trash2, Brain, GraduationCap, Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  researchMode: boolean;
  onResearchModeChange: (enabled: boolean) => void;
  studyMode: boolean;
  onStudyModeChange: (enabled: boolean) => void;
  webSurfingMode: boolean;
  onWebSurfingModeChange: (enabled: boolean) => void;
}

export function ConversationSidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  researchMode,
  onResearchModeChange,
  studyMode,
  onStudyModeChange,
  webSurfingMode,
  onWebSurfingModeChange,
}: ConversationSidebarProps) {
  const { open } = useSidebar();
  const navigate = useNavigate();

  const handleStudyModeChange = (enabled: boolean) => {
    onStudyModeChange(enabled);
    if (enabled) {
      navigate("/study");
    }
  };

  return (
    <Sidebar className={cn("border-r border-border", open ? "w-64" : "w-16")}>
      <SidebarHeader className="border-b border-border p-4">
        <Button
          onClick={onNewConversation}
          className="w-full"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          {open && "New Chat"}
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {open && <SidebarGroupLabel>Conversations</SidebarGroupLabel>}
          <SidebarGroupContent>
            <ScrollArea className="h-[calc(100vh-10rem)]">
              <SidebarMenu>
                {conversations.map((conv) => (
                  <SidebarMenuItem key={conv.id}>
                    <SidebarMenuButton
                      onClick={() => onSelectConversation(conv.id)}
                      className={cn(
                        "w-full justify-between group",
                        currentConversationId === conv.id && "bg-accent"
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <MessageSquare className="h-4 w-4 flex-shrink-0" />
                        {open && (
                          <span className="truncate text-sm">{conv.title}</span>
                        )}
                      </div>
                      {open && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteConversation(conv.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-4">
        <div className="space-y-4">
          <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            AI MODES
          </div>
          
          <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-2 flex-1">
              <div className={cn(
                "p-1.5 rounded-md transition-colors",
                researchMode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                <Brain className="h-4 w-4" />
              </div>
              {open && (
                <div>
                  <Label htmlFor="research-mode" className="text-sm font-medium cursor-pointer">
                    Research Mode
                  </Label>
                  {researchMode && <p className="text-xs text-muted-foreground">Deep analysis active</p>}
                </div>
              )}
            </div>
            <Switch
              id="research-mode"
              checked={researchMode}
              onCheckedChange={onResearchModeChange}
            />
          </div>
          
          <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-2 flex-1">
              <div className={cn(
                "p-1.5 rounded-md transition-colors",
                studyMode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                <GraduationCap className="h-4 w-4" />
              </div>
              {open && (
                <div>
                  <Label htmlFor="study-mode" className="text-sm font-medium cursor-pointer">
                    Study Mode
                  </Label>
                  {studyMode && <p className="text-xs text-muted-foreground">Learning assistant active</p>}
                </div>
              )}
            </div>
            <Switch
              id="study-mode"
              checked={studyMode}
              onCheckedChange={handleStudyModeChange}
            />
          </div>
          
          <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-primary/50 bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 transition-all">
            <div className="flex items-center gap-2 flex-1">
              <div className={cn(
                "p-1.5 rounded-md transition-colors",
                webSurfingMode ? "bg-primary text-primary-foreground animate-pulse" : "bg-muted text-muted-foreground"
              )}>
                <Globe className="h-4 w-4" />
              </div>
              {open && (
                <div>
                  <Label htmlFor="web-surfing-mode" className="text-sm font-semibold cursor-pointer flex items-center gap-1">
                    Web Surfing
                    {webSurfingMode && <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">LIVE</span>}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {webSurfingMode ? "Real-time web search enabled" : "Search the web in real-time"}
                  </p>
                </div>
              )}
            </div>
            <Switch
              id="web-surfing-mode"
              checked={webSurfingMode}
              onCheckedChange={onWebSurfingModeChange}
            />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
