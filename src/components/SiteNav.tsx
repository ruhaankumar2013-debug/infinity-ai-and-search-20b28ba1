import { Link } from "react-router-dom";
import { Code2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SiteNavProps = {
  className?: string;
};

export function SiteNav({ className }: SiteNavProps) {
  return (
    <nav className={cn("flex items-center gap-1", className)} aria-label="Site">
      <Button asChild variant="ghost" size="sm">
        <Link to="/about">About</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link to="/terms">Terms</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link to="/use-cases">Use Cases</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link to="/study">Study</Link>
      </Button>
      <Button asChild variant="default" size="sm" className="ml-1">
        <Link to="/code">
          <Code2 className="w-3.5 h-3.5 mr-1" />
          Code Mode
        </Link>
      </Button>
    </nav>
  );
}

