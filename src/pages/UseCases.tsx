import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare, Image, Video, BookOpen, Briefcase } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";

const UseCases = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link to="/">
            <Button variant="ghost">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <SiteNav className="hidden sm:flex" />
        </div>

        <h1 className="text-4xl font-bold mb-8 text-foreground">Use Cases</h1>

        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground">Conversational AI Assistant</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Infinity AI serves as your intelligent conversational partner, capable of engaging in natural, context-aware discussions on virtually any topic. Whether you need help brainstorming ideas, writing content, debugging code, or simply having an informative conversation, our AI assistant adapts to your communication style and provides thoughtful, relevant responses. With support for multiple advanced language models, you can choose the best model for your specific needs, from quick casual chats to complex technical discussions.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Image className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground">AI Image Generation</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Transform your creative visions into stunning visual reality with our powerful image generation capabilities. Using state-of-the-art models like Stable Diffusion XL, Infinity AI can create high-quality images from simple text descriptions. Whether you're a designer seeking inspiration, a marketer needing custom visuals, or an artist exploring new creative territories, our image generation tools provide the flexibility and quality you need. From photorealistic scenes to abstract art, the only limit is your imagination.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Video className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground">AI Video Synthesis</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Enter the cutting edge of AI content creation with our video generation capabilities. Leveraging advanced models like Mochi 1 Preview and Stable Video Diffusion, Infinity AI can create dynamic video content from text prompts. This revolutionary technology opens new possibilities for content creators, educators, and businesses looking to produce engaging video content without traditional video production resources. From animated explainers to creative visual stories, AI video synthesis is transforming how we create and consume visual media.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <BookOpen className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground">Learning and Research</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Accelerate your learning journey with Infinity AI as your personal tutor and research assistant. Our platform excels at explaining complex concepts in simple terms, providing detailed answers to technical questions, and helping you explore new subjects at your own pace. Students can use our Study Mode to prepare for exams, researchers can quickly synthesize information from multiple sources, and lifelong learners can dive deep into any topic that sparks their curiosity. With web search integration, you always have access to the latest information.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Briefcase className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground">Business and Productivity</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Boost your professional productivity with AI-powered assistance for everyday business tasks. From drafting emails and creating presentations to analyzing data and generating reports, Infinity AI helps you work smarter, not harder. Teams can leverage our platform for collaborative brainstorming, content creation, and problem-solving. Entrepreneurs can use it to develop business plans, marketing strategies, and customer communications. Whatever your professional needs, our AI tools are designed to enhance your efficiency and output quality.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UseCases;
