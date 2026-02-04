import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const TermsOfUse = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link to="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-8 text-foreground">Terms of Use</h1>

        <div className="space-y-6 text-muted-foreground leading-relaxed">
          <p>
            By accessing and using Infinity AI, you agree to be bound by these Terms of Use, all applicable laws, and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this platform. The materials and services provided by Infinity AI are protected by applicable copyright and trademark laws. These terms constitute a legally binding agreement between you and Infinity AI.
          </p>

          <p>
            Users are granted a limited, non-exclusive, non-transferable license to access and use Infinity AI for personal or commercial purposes in accordance with these terms. You may not reproduce, distribute, modify, create derivative works of, publicly display, publicly perform, republish, download, store, or transmit any of the proprietary algorithms or system components. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
          </p>

          <p>
            You agree to use Infinity AI only for lawful purposes and in a manner that does not infringe upon the rights of others or restrict their use of the platform. Prohibited activities include but are not limited to: generating content that is illegal, harmful, threatening, abusive, or violates any applicable laws; attempting to gain unauthorized access to the platform or its systems; using the service to generate spam, malware, or deceptive content; and violating any intellectual property rights of third parties.
          </p>

          <p>
            Infinity AI provides its services on an "as is" and "as available" basis without any warranties, expressed or implied. We do not guarantee that the service will be uninterrupted, secure, or error-free. We shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the service. Our total liability shall not exceed the amount paid by you, if any, for accessing the service during the twelve months preceding the claim.
          </p>

          <p>
            We reserve the right to modify these Terms of Use at any time without prior notice. Your continued use of Infinity AI following any changes constitutes acceptance of those changes. We may terminate or suspend your access to the platform immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach these Terms. All provisions of these Terms which by their nature should survive termination shall survive, including ownership provisions, warranty disclaimers, indemnity, and limitations of liability.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TermsOfUse;
