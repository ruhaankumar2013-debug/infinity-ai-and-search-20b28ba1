import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Upload, ArrowLeft, FileText, Loader2, Brain, Calendar, GraduationCap, BookOpen } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/components/ChatMessage";
import { ModelSelector } from "@/components/ModelSelector";
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

interface Model {
  id: string;
  model_id: string;
  name: string;
}

// NCERT Curriculum organized by grade
const NCERT_CURRICULUM: Record<string, Record<string, string[]>> = {
  "6": {
    "Science": ["Food: Where Does it Come From?", "Components of Food", "Fibre to Fabric", "Sorting Materials into Groups", "Separation of Substances", "Changes Around Us", "Getting to Know Plants", "Body Movements", "The Living Organisms", "Motion and Measurement", "Light Shadows and Reflections", "Electricity and Circuits", "Fun with Magnets", "Water", "Air Around Us", "Garbage In Garbage Out"],
    "Mathematics": ["Knowing Our Numbers", "Whole Numbers", "Playing with Numbers", "Basic Geometrical Ideas", "Understanding Elementary Shapes", "Integers", "Fractions", "Decimals", "Data Handling", "Mensuration", "Algebra", "Ratio and Proportion", "Symmetry", "Practical Geometry"],
    "Social Science": ["What Where How and When", "From Hunting Gathering to Growing Food", "In the Earliest Cities", "What Books and Burials Tell Us", "Kingdoms Kings and Early Republic", "New Questions and Ideas", "Ashoka The Emperor Who Gave Up War", "Vital Villages Thriving Towns", "The Earth in the Solar System", "Globe Latitudes and Longitudes", "Motions of the Earth", "Maps", "Major Domains of the Earth", "Understanding Diversity", "Diversity and Discrimination", "What is Government", "Key Elements of a Democratic Government", "Panchayati Raj", "Rural Administration", "Urban Administration", "Rural Livelihoods", "Urban Livelihoods"],
    "English": ["A Pact with the Sun", "Honeysuckle", "Reading", "Writing", "Grammar"],
    "Hindi": ["Vasant", "Durva", "Bal Ram Katha"]
  },
  "7": {
    "Science": ["Nutrition in Plants", "Nutrition in Animals", "Fibre to Fabric", "Heat", "Acids Bases and Salts", "Physical and Chemical Changes", "Weather Climate and Adaptations", "Winds Storms and Cyclones", "Soil", "Respiration in Organisms", "Transportation in Animals and Plants", "Reproduction in Plants", "Motion and Time", "Electric Current and its Effects", "Light", "Water A Precious Resource", "Forests Our Lifeline", "Wastewater Story"],
    "Mathematics": ["Integers", "Fractions and Decimals", "Data Handling", "Simple Equations", "Lines and Angles", "The Triangle and its Properties", "Congruence of Triangles", "Comparing Quantities", "Rational Numbers", "Practical Geometry", "Perimeter and Area", "Algebraic Expressions", "Exponents and Powers", "Symmetry", "Visualising Solid Shapes"],
    "Social Science": ["Tracing Changes Through a Thousand Years", "New Kings and Kingdoms", "The Delhi Sultans", "The Mughal Empire", "Rulers and Buildings", "Towns Traders and Craftspersons", "Tribes Nomads and Settled Communities", "Devotional Paths to the Divine", "The Making of Regional Cultures", "Eighteenth Century Political Formations", "Environment", "Inside Our Earth", "Our Changing Earth", "Air", "Water", "On Equality", "Role of the Government in Health", "How the State Government Works", "Growing up as Boys and Girls", "Women Change the World", "Understanding Advertising", "Markets Around Us", "A Shirt in the Market"],
    "English": ["An Alien Hand", "Honeycomb", "Reading", "Writing", "Grammar"],
    "Hindi": ["Vasant", "Durva", "Mahabharat"]
  },
  "8": {
    "Science": ["Crop Production and Management", "Microorganisms Friend and Foe", "Synthetic Fibres and Plastics", "Materials Metals and Non-Metals", "Coal and Petroleum", "Combustion and Flame", "Conservation of Plants and Animals", "Cell Structure and Functions", "Reproduction in Animals", "Reaching the Age of Adolescence", "Force and Pressure", "Friction", "Sound", "Chemical Effects of Electric Current", "Some Natural Phenomena", "Light", "Stars and the Solar System", "Pollution of Air and Water"],
    "Mathematics": ["Rational Numbers", "Linear Equations in One Variable", "Understanding Quadrilaterals", "Practical Geometry", "Data Handling", "Squares and Square Roots", "Cubes and Cube Roots", "Comparing Quantities", "Algebraic Expressions and Identities", "Visualising Solid Shapes", "Mensuration", "Exponents and Powers", "Direct and Inverse Proportions", "Factorisation", "Introduction to Graphs", "Playing with Numbers"],
    "Social Science": ["How When and Where", "From Trade to Territory", "Ruling the Countryside", "Tribals Dikus and the Vision of a Golden Age", "When People Rebel", "Colonialism and the City", "Weavers Iron Smelters and Factory Owners", "Civilising the Native Educating the Nation", "Women Caste and Reform", "The Changing World of Visual Arts", "The Making of the National Movement", "India After Independence", "Resources", "Land Soil Water Natural Vegetation and Wildlife Resources", "Mineral and Power Resources", "Agriculture", "Industries", "Human Resources", "The Indian Constitution", "Understanding Secularism", "Why Do We Need a Parliament", "Understanding Laws", "Judiciary", "Understanding Our Criminal Justice System", "Understanding Marginalisation", "Confronting Marginalisation", "Public Facilities", "Law and Social Justice"],
    "English": ["It So Happened", "Honeydew", "Reading", "Writing", "Grammar"],
    "Hindi": ["Vasant", "Durva", "Bharat Ki Khoj"]
  },
  "9": {
    "Science": ["Matter in Our Surroundings", "Is Matter Around Us Pure", "Atoms and Molecules", "Structure of the Atom", "The Fundamental Unit of Life", "Tissues", "Diversity in Living Organisms", "Motion", "Force and Laws of Motion", "Gravitation", "Work and Energy", "Sound", "Why Do We Fall Ill", "Natural Resources", "Improvement in Food Resources"],
    "Mathematics": ["Number Systems", "Polynomials", "Coordinate Geometry", "Linear Equations in Two Variables", "Introduction to Euclids Geometry", "Lines and Angles", "Triangles", "Quadrilaterals", "Areas of Parallelograms and Triangles", "Circles", "Constructions", "Herons Formula", "Surface Areas and Volumes", "Statistics", "Probability"],
    "Social Science": ["The French Revolution", "Socialism in Europe and the Russian Revolution", "Nazism and the Rise of Hitler", "Forest Society and Colonialism", "Pastoralists in the Modern World", "The Story of Village Palampur", "People as Resource", "Poverty as a Challenge", "Food Security in India", "India Size and Location", "Physical Features of India", "Drainage", "Climate", "Natural Vegetation and Wildlife", "Population", "What is Democracy Why Democracy", "Constitutional Design", "Electoral Politics", "Working of Institutions", "Democratic Rights"],
    "English": ["Beehive", "Moments", "Reading", "Writing", "Grammar"],
    "Hindi": ["Kshitiz", "Kritika", "Sparsh", "Sanchayan"]
  },
  "10": {
    "Science": ["Chemical Reactions and Equations", "Acids Bases and Salts", "Metals and Non-metals", "Carbon and its Compounds", "Periodic Classification of Elements", "Life Processes", "Control and Coordination", "How do Organisms Reproduce", "Heredity and Evolution", "Light Reflection and Refraction", "Human Eye and Colourful World", "Electricity", "Magnetic Effects of Electric Current", "Our Environment", "Management of Natural Resources"],
    "Mathematics": ["Real Numbers", "Polynomials", "Pair of Linear Equations in Two Variables", "Quadratic Equations", "Arithmetic Progressions", "Triangles", "Coordinate Geometry", "Introduction to Trigonometry", "Some Applications of Trigonometry", "Circles", "Constructions", "Areas Related to Circles", "Surface Areas and Volumes", "Statistics", "Probability"],
    "Social Science": ["The Rise of Nationalism in Europe", "Nationalism in India", "The Making of a Global World", "The Age of Industrialisation", "Print Culture and the Modern World", "Resources and Development", "Forest and Wildlife Resources", "Water Resources", "Agriculture", "Minerals and Energy Resources", "Manufacturing Industries", "Lifelines of National Economy", "Power Sharing", "Federalism", "Democracy and Diversity", "Gender Religion and Caste", "Popular Struggles and Movements", "Political Parties", "Outcomes of Democracy", "Development", "Sectors of the Indian Economy", "Money and Credit", "Globalisation and the Indian Economy", "Consumer Rights"],
    "English": ["First Flight", "Footprints Without Feet", "Reading", "Writing", "Grammar"],
    "Hindi": ["Kshitiz", "Kritika", "Sparsh", "Sanchayan"]
  },
  "11": {
    "Physics": ["Physical World", "Units and Measurements", "Motion in a Straight Line", "Motion in a Plane", "Laws of Motion", "Work Energy and Power", "System of Particles and Rotational Motion", "Gravitation", "Mechanical Properties of Solids", "Mechanical Properties of Fluids", "Thermal Properties of Matter", "Thermodynamics", "Kinetic Theory", "Oscillations", "Waves"],
    "Chemistry": ["Some Basic Concepts of Chemistry", "Structure of Atom", "Classification of Elements and Periodicity in Properties", "Chemical Bonding and Molecular Structure", "States of Matter", "Thermodynamics", "Equilibrium", "Redox Reactions", "Hydrogen", "The s-Block Elements", "The p-Block Elements", "Organic Chemistry Some Basic Principles and Techniques", "Hydrocarbons", "Environmental Chemistry"],
    "Biology": ["The Living World", "Biological Classification", "Plant Kingdom", "Animal Kingdom", "Morphology of Flowering Plants", "Anatomy of Flowering Plants", "Structural Organisation in Animals", "Cell The Unit of Life", "Biomolecules", "Cell Cycle and Cell Division", "Transport in Plants", "Mineral Nutrition", "Photosynthesis in Higher Plants", "Respiration in Plants", "Plant Growth and Development", "Digestion and Absorption", "Breathing and Exchange of Gases", "Body Fluids and Circulation", "Excretory Products and their Elimination", "Locomotion and Movement", "Neural Control and Coordination", "Chemical Coordination and Integration"],
    "Mathematics": ["Sets", "Relations and Functions", "Trigonometric Functions", "Principle of Mathematical Induction", "Complex Numbers and Quadratic Equations", "Linear Inequalities", "Permutations and Combinations", "Binomial Theorem", "Sequences and Series", "Straight Lines", "Conic Sections", "Introduction to Three Dimensional Geometry", "Limits and Derivatives", "Mathematical Reasoning", "Statistics", "Probability"],
    "Accountancy": ["Introduction to Accounting", "Theory Base of Accounting", "Recording of Transactions I", "Recording of Transactions II", "Bank Reconciliation Statement", "Trial Balance and Rectification of Errors", "Depreciation Provisions and Reserves", "Bill of Exchange", "Financial Statements I", "Financial Statements II", "Accounts from Incomplete Records", "Applications of Computers in Accounting", "Computerised Accounting System"],
    "Business Studies": ["Nature and Purpose of Business", "Forms of Business Organisation", "Public Private and Global Enterprises", "Business Services", "Emerging Modes of Business", "Social Responsibilities of Business and Business Ethics", "Formation of a Company", "Sources of Business Finance", "Small Business", "Internal Trade", "International Business"],
    "Economics": ["Introduction", "Theory of Consumer Behaviour", "Production and Costs", "The Theory of the Firm under Perfect Competition", "Market Equilibrium", "Non-competitive Markets", "Introduction to Macroeconomics", "National Income Accounting", "Money and Banking", "Determination of Income and Employment", "Government Budget and the Economy", "Open Economy Macroeconomics", "Indian Economy on the Eve of Independence", "Indian Economy 1950-1990", "Liberalisation Privatisation and Globalisation", "Poverty", "Human Capital Formation in India", "Rural Development", "Employment", "Infrastructure", "Environment and Sustainable Development", "Comparative Development Experiences of India with its Neighbours"],
    "Political Science": ["Constitution Why and How", "Rights in the Indian Constitution", "Election and Representation", "Executive", "Legislature", "Judiciary", "Federalism", "Local Governments", "Constitution as a Living Document", "The Philosophy of the Constitution", "Political Theory An Introduction", "Freedom", "Equality", "Social Justice", "Rights", "Citizenship", "Nationalism", "Secularism", "Peace", "Development"],
    "History": ["From the Beginning of Time", "Writing and City Life", "An Empire Across Three Continents", "The Central Islamic Lands", "Nomadic Empires", "The Three Orders", "Changing Cultural Traditions", "Confrontation of Cultures", "Paths to Modernisation", "Displacing Indigenous Peoples", "Paths to Modernisation"],
    "Geography": ["India Location", "Structure and Relief", "Drainage System", "Climate", "Natural Vegetation", "Soils", "Natural Hazards and Disasters", "The Origin and Evolution of the Earth", "Landforms and their Evolution", "Climate", "Water in the Atmosphere", "World Climate and Climate Change", "Water Oceans", "Biodiversity and Conservation", "Indian Economy"],
    "English": ["Hornbill", "Snapshots", "Reading", "Writing", "Grammar"],
    "Hindi": ["Aroh", "Vitan", "Antra"]
  },
  "12": {
    "Physics": ["Electric Charges and Fields", "Electrostatic Potential and Capacitance", "Current Electricity", "Moving Charges and Magnetism", "Magnetism and Matter", "Electromagnetic Induction", "Alternating Current", "Electromagnetic Waves", "Ray Optics and Optical Instruments", "Wave Optics", "Dual Nature of Radiation and Matter", "Atoms", "Nuclei", "Semiconductor Electronics Materials Devices and Simple Circuits", "Communication Systems"],
    "Chemistry": ["The Solid State", "Solutions", "Electrochemistry", "Chemical Kinetics", "Surface Chemistry", "General Principles and Processes of Isolation of Elements", "The p-Block Elements", "The d and f Block Elements", "Coordination Compounds", "Haloalkanes and Haloarenes", "Alcohols Phenols and Ethers", "Aldehydes Ketones and Carboxylic Acids", "Amines", "Biomolecules", "Polymers", "Chemistry in Everyday Life"],
    "Biology": ["Reproduction in Organisms", "Sexual Reproduction in Flowering Plants", "Human Reproduction", "Reproductive Health", "Principles of Inheritance and Variation", "Molecular Basis of Inheritance", "Evolution", "Human Health and Disease", "Strategies for Enhancement in Food Production", "Microbes in Human Welfare", "Biotechnology Principles and Processes", "Biotechnology and its Applications", "Organisms and Populations", "Ecosystem", "Biodiversity and Conservation", "Environmental Issues"],
    "Mathematics": ["Relations and Functions", "Inverse Trigonometric Functions", "Matrices", "Determinants", "Continuity and Differentiability", "Application of Derivatives", "Integrals", "Application of Integrals", "Differential Equations", "Vector Algebra", "Three Dimensional Geometry", "Linear Programming", "Probability"],
    "Accountancy": ["Accounting for Not for Profit Organisation", "Accounting for Partnership Basic Concepts", "Reconstitution of a Partnership Firm Admission of a Partner", "Reconstitution of a Partnership Firm Retirement Death of a Partner", "Dissolution of Partnership Firm", "Accounting for Share Capital", "Issue and Redemption of Debentures", "Financial Statements of a Company", "Analysis of Financial Statements", "Accounting Ratios", "Cash Flow Statement"],
    "Business Studies": ["Nature and Significance of Management", "Principles of Management", "Business Environment", "Planning", "Organising", "Staffing", "Directing", "Controlling", "Financial Management", "Financial Markets", "Marketing Management", "Consumer Protection"],
    "Economics": ["Introduction to Microeconomics", "Theory of Consumer Behaviour", "Production and Costs", "The Theory of the Firm under Perfect Competition", "Market Equilibrium", "Competition and Non-competitive Markets", "Introduction to Macroeconomics and its Concepts", "National Income and Related Aggregates", "Money and Banking", "Determination of Income and Employment", "Government Budget and the Economy", "Balance of Payments", "The Experience of Growth Development and Happiness", "India on the Eve of Independence", "Indian Economy in 1950-1990", "Economic Reforms Since 1991", "Poverty", "Human Capital Formation in India", "Rural Development", "Employment", "Sustainable Economic Development", "Development Experience of India"],
    "Political Science": ["Challenges of Nation Building", "Era of One Party Dominance", "Politics of Planned Development", "Indias External Relations", "Challenges to and Restoration of Congress System", "The Crisis of Democratic Order", "Rise of Popular Movements", "Regional Aspirations", "Recent Developments in Indian Politics", "The Cold War Era", "The End of Bipolarity", "US Hegemony in World Politics", "Alternative Centres of Power", "Contemporary South Asia", "International Organisations", "Security in the Contemporary World", "Environment and Natural Resources", "Globalisation"],
    "History": ["Bricks Beads and Bones", "Kings Farmers and Towns", "Kinship Caste and Class", "Thinkers Beliefs and Buildings", "Through the Eyes of Travellers", "Bhakti Sufi Traditions", "An Imperial Capital Vijayanagara", "Peasants Zamindars and the State", "Kings and Chronicles", "Colonialism and the Countryside", "Rebels and the Raj", "Colonial Cities", "Mahatma Gandhi and the Nationalist Movement", "Framing the Constitution", "Understanding Partition"],
    "Geography": ["Human Geography Nature and Scope", "The World Population", "Human Development", "Primary Activities", "Secondary Activities", "Tertiary and Quaternary Activities", "Transport and Communication", "International Trade", "Human Settlements", "Population Distribution Density Growth and Composition", "Human Development", "Primary Activities", "Secondary Activities", "Tertiary and Quaternary Activities", "Transport Communication and Trade", "Human Settlements", "Data Processing", "Spatial Information Technology"],
    "English": ["Flamingo", "Vistas", "Reading", "Writing", "Grammar"],
    "Hindi": ["Aroh", "Vitan", "Antra"]
  }
};

const StudyMode = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string>("10");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [newExamSubject, setNewExamSubject] = useState("");
  const [newExamDate, setNewExamDate] = useState<Date>();
  const [newExamNotes, setNewExamNotes] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch selected model details when modelId changes
  useEffect(() => {
    const fetchModelDetails = async () => {
      if (!selectedModelId) return;
      
      const { data, error } = await supabase
        .from('models')
        .select('id, model_id, name')
        .eq('id', selectedModelId)
        .single();
      
      if (!error && data) {
        setSelectedModel(data);
      }
    };
    
    fetchModelDetails();
  }, [selectedModelId]);

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
      if (!selectedModel) {
        toast({
          title: "No model selected",
          description: "Please select an AI model first.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("openchat", {
        body: {
          messages: [...messages, { role: "user", content: message }],
          modelId: selectedModel.id,
          modelName: selectedModel.model_id,
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

    if (!selectedModel) {
      toast({
        title: "No model selected",
        description: "Please select an AI model first.",
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
          modelId: selectedModel.id,
          modelName: selectedModel.model_id,
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

    if (!selectedModel) {
      toast({
        title: "No model selected",
        description: "Please select an AI model first.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("openchat", {
        body: {
          messages: [...messages, userMessage],
          modelId: selectedModel.id,
          modelName: selectedModel.model_id,
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
              <Select value={selectedGrade} onValueChange={(val) => {
                setSelectedGrade(val);
                setSelectedSubject("");
                setSelectedChapter("");
              }}>
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
                  {Object.keys(NCERT_CURRICULUM[selectedGrade] || {}).map((subject) => (
                    <SelectItem key={subject} value={subject}>
                      {subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSubject && NCERT_CURRICULUM[selectedGrade]?.[selectedSubject] && (
              <Select value={selectedChapter} onValueChange={handleChapterSelect}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select Chapter" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {NCERT_CURRICULUM[selectedGrade][selectedSubject].map((chapter) => (
                    <SelectItem key={chapter} value={chapter}>
                      {chapter}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="w-full sm:w-auto">
              <ModelSelector
                selectedModelId={selectedModelId}
                onSelectModel={setSelectedModelId}
              />
            </div>
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
