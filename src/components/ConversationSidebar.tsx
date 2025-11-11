import { MessageSquare, Plus, Trash2, Brain, GraduationCap } from "lucide-react";
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
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              {open && (
                <Label htmlFor="research-mode" className="text-sm font-medium cursor-pointer">
                  Research Mode
                </Label>
              )}
            </div>
            <Switch
              id="research-mode"
              checked={researchMode}
              onCheckedChange={onResearchModeChange}
            />
          </div>
          {open && researchMode && (
            <p className="text-xs text-muted-foreground">
              Deep thinking enabled for thorough analysis
            </p>
          )}
          
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              {open && (
                <Label htmlFor="study-mode" className="text-sm font-medium cursor-pointer">
                  Study Mode
                </Label>
              )}
            </div>
            <Switch
              id="study-mode"
              checked={studyMode}
              onCheckedChange={handleStudyModeChange}
            />
          </div>
          {open && studyMode && (
            <p className="text-xs text-muted-foreground">
              Get study assistance and personalized plans
            </p>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
