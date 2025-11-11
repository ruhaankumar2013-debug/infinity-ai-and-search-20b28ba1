import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Upload, ArrowLeft, FileText, Loader2, Brain, Calendar, GraduationCap, BookOpen } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/components/ChatMessage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Exam {
  subject: string;
  date: Date;
  notes: string;
}

const NCERT_SUBJECTS = {
  "Science": ["Chemical Reactions", "Acids Bases and Salts", "Metals and Non-metals", "Carbon and its Compounds", "Life Processes", "Control and Coordination", "Reproduction", "Heredity and Evolution", "Light Reflection and Refraction", "Electricity", "Magnetic Effects of Current"],
  "Mathematics": ["Real Numbers", "Polynomials", "Linear Equations", "Quadratic Equations", "Arithmetic Progressions", "Triangles", "Coordinate Geometry", "Trigonometry", "Circles", "Surface Areas and Volumes", "Statistics", "Probability"],
  "Social Science": ["India and the Contemporary World", "Contemporary India", "Democratic Politics", "Understanding Economic Development"],
  "English": ["First Flight", "Footprints Without Feet", "Writing Skills", "Grammar"],
  "Hindi": ["Kshitiz", "Kritika", "Sparsh", "Sanchayan"]
};

const StudyMode = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string>("10");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [newExamSubject, setNewExamSubject] = useState("");
  const [newExamDate, setNewExamDate] = useState<Date>();
  const [newExamNotes, setNewExamNotes] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);
    
    toast({
      title: "Files uploaded",
      description: `${files.length} file(s) added to your study session`,
    });
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddExam = () => {
    if (!newExamSubject || !newExamDate) {
      toast({
        title: "Missing information",
        description: "Please provide subject and date for the exam",
        variant: "destructive",
      });
      return;
    }

    const newExam: Exam = {
      subject: newExamSubject,
      date: newExamDate,
      notes: newExamNotes,
    };

    setExams(prev => [...prev, newExam]);
    setNewExamSubject("");
    setNewExamDate(undefined);
    setNewExamNotes("");
    setExamDialogOpen(false);

    toast({
      title: "Exam scheduled",
      description: `${newExamSubject} exam scheduled for ${format(newExamDate, "PPP")}`,
    });
  };

  const handleChapterSelect = (chapter: string) => {
    setSelectedChapter(chapter);
    
    const contextMessage = `I'm studying Grade ${selectedGrade}, ${selectedSubject}, Chapter: ${chapter}. Please help me understand this chapter.`;
    
    setMessages(prev => [...prev, {
      role: "user",
      content: contextMessage,
    }]);

    handleAIResponse(contextMessage);
  };

  const handleAIResponse = async (message: string) => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("openchat", {
        body: {
          messages: [...messages, { role: "user", content: message }],
          studyMode: true,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response || "I couldn't generate a response.",
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("AI response error:", error);
      toast({
        title: "Error",
        description: "Failed to get response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateMindMap = async () => {
    if (messages.length === 0) {
      toast({
        title: "No content",
        description: "Please chat with the AI first to generate a mind map",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const userMessage: Message = {
      role: "user",
      content: "Create a detailed mind map based on our discussion so far. Format it as a hierarchical structure.",
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      const { data, error } = await supabase.functions.invoke("openchat", {
        body: {
          messages: [...messages, userMessage],
          studyMode: true,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response || "Failed to generate mind map.",
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Mind map generation error:", error);
      toast({
        title: "Error",
        description: "Failed to generate mind map. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && uploadedFiles.length === 0) return;

    setIsLoading(true);
    
    let messageContent = input.trim();
    
    // Add file context if files are uploaded
    if (uploadedFiles.length > 0) {
      const fileNames = uploadedFiles.map(f => f.name).join(", ");
      messageContent = `${messageContent}\n\n[Uploaded files: ${fileNames}]`;
    }

    const userMessage: Message = {
      role: "user",
      content: messageContent,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");

    try {
      const { data, error } = await supabase.functions.invoke("openchat", {
        body: {
          messages: [...messages, userMessage],
          studyMode: true,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response || "I couldn't generate a response.",
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Study mode error:", error);
      toast({
        title: "Error",
        description: "Failed to get response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Brain className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Study Mode</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Syllabus
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={generateMindMap}
                disabled={isLoading || messages.length === 0}
              >
                <Brain className="h-4 w-4 mr-2" />
                Generate Mind Map
              </Button>
              
              <Dialog open={examDialogOpen} onOpenChange={setExamDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Exam
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Schedule an Exam</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Input
                        placeholder="Enter subject name"
                        value={newExamSubject}
                        onChange={(e) => setNewExamSubject(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Exam Date</Label>
                      <CalendarComponent
                        mode="single"
                        selected={newExamDate}
                        onSelect={setNewExamDate}
                        disabled={(date) => date < new Date()}
                        className={cn("rounded-md border pointer-events-auto")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Notes (Optional)</Label>
                      <Input
                        placeholder="Add any notes about this exam"
                        value={newExamNotes}
                        onChange={(e) => setNewExamNotes(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleAddExam} className="w-full">
                      Add Exam
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Study Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">Grade 6</SelectItem>
                  <SelectItem value="7">Grade 7</SelectItem>
                  <SelectItem value="8">Grade 8</SelectItem>
                  <SelectItem value="9">Grade 9</SelectItem>
                  <SelectItem value="10">Grade 10</SelectItem>
                  <SelectItem value="11">Grade 11</SelectItem>
                  <SelectItem value="12">Grade 12</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSubject} onValueChange={(val) => {
                setSelectedSubject(val);
                setSelectedChapter("");
              }}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(NCERT_SUBJECTS).map((subject) => (
                    <SelectItem key={subject} value={subject}>
                      {subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSubject && (
              <Select value={selectedChapter} onValueChange={handleChapterSelect}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select Chapter" />
                </SelectTrigger>
                <SelectContent>
                  {NCERT_SUBJECTS[selectedSubject as keyof typeof NCERT_SUBJECTS].map((chapter) => (
                    <SelectItem key={chapter} value={chapter}>
                      {chapter}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.doc,.docx"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Upcoming Exams */}
      {exams.length > 0 && (
        <div className="container mx-auto px-4 py-3 border-b bg-secondary/20">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Upcoming Exams</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {exams
              .sort((a, b) => a.date.getTime() - b.date.getTime())
              .map((exam, index) => (
                <Card key={index} className="p-3 text-sm">
                  <div className="font-medium">{exam.subject}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(exam.date, "PPP")}
                  </div>
                  {exam.notes && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {exam.notes}
                    </div>
                  )}
                </Card>
              ))}
          </div>
        </div>
      )}

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-secondary/50 px-3 py-1 rounded-full text-sm"
              >
                <FileText className="h-3 w-3" />
                <span>{file.name}</span>
                <button
                  onClick={() => removeFile(index)}
                  className="hover:text-destructive"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 container mx-auto px-4 py-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <Card className="p-8 text-center">
              <Brain className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h2 className="text-xl font-semibold mb-2">Welcome to Study Mode</h2>
              <p className="text-muted-foreground mb-4">
                Upload your syllabus, ask questions, and create mind maps to enhance your learning.
              </p>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div className="p-4 border rounded-lg">
                  <Upload className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="font-medium">Upload Materials</p>
                  <p className="text-muted-foreground">Add your syllabus or study materials</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <Send className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="font-medium">Ask Questions</p>
                  <p className="text-muted-foreground">Get detailed explanations</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <Brain className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="font-medium">Create Mind Maps</p>
                  <p className="text-muted-foreground">Visualize your learning</p>
                </div>
              </div>
            </Card>
          ) : (
            messages.map((message, index) => (
              <ChatMessage
                key={index}
                role={message.role}
                content={message.content}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t bg-card/50 backdrop-blur-sm sticky bottom-0">
        <div className="container mx-auto px-4 py-4">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a study question or request a study plan..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StudyMode;
