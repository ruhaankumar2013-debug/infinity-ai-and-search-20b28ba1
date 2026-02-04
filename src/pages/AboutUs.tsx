import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";

const AboutUs = () => {
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

        <h1 className="text-4xl font-bold mb-8 text-foreground">About Us</h1>

        <div className="space-y-6 text-muted-foreground leading-relaxed">
          <p>
            Welcome to Infinity AI, a next-generation artificial intelligence platform designed to empower creators, developers, and businesses alike. Our mission is to democratize access to powerful AI tools, making cutting-edge technology accessible to everyone regardless of their technical background. We believe that AI should be a force for good, enhancing human creativity and productivity rather than replacing it.
          </p>

          <p>
            Founded by a team of passionate technologists and AI researchers, Infinity AI was born from a simple vision: to create an AI platform that combines power with simplicity. We've spent countless hours refining our algorithms, optimizing our infrastructure, and designing an intuitive interface that puts the user experience first. Our platform leverages the latest advancements in large language models, image generation, and video synthesis to deliver results that exceed expectations.
          </p>

          <p>
            At the heart of Infinity AI is our commitment to innovation. We continuously integrate the most advanced AI models available, from state-of-the-art language models like Llama and Mistral to powerful image generators like SDXL and cutting-edge video synthesis models like Mochi and Stable Video Diffusion. This multi-model approach ensures that our users always have access to the best tools for their specific needs.
          </p>

          <p>
            Privacy and security are paramount to everything we do. We understand that trust is earned, which is why we've implemented robust security measures to protect your data and conversations. Our platform is built on enterprise-grade infrastructure with end-to-end encryption, ensuring that your interactions remain private and secure. We never sell your data or use it for purposes other than improving your experience.
          </p>

          <p>
            Looking ahead, we're excited about the future of AI and our role in shaping it. We're constantly exploring new frontiers in artificial intelligence, from advanced reasoning capabilities to multimodal understanding. Our goal is to be at the forefront of AI innovation, bringing the latest breakthroughs to our users as soon as they become available. Join us on this incredible journey as we push the boundaries of what's possible with artificial intelligence.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;
