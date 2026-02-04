import { Link } from "react-router-dom";

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
    </nav>
  );
}
