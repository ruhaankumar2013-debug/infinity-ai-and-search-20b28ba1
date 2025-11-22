import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
}

export const SearchResults = ({ results, query }: SearchResultsProps) => {
  if (results.length === 0) {
    return (
      <Card className="w-full bg-card/50 border-border">
        <CardContent className="p-4">
          <p className="text-muted-foreground text-sm">No results found for "{query}"</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="text-sm text-muted-foreground px-2">
        Found {results.length} results for "{query}"
      </div>
      {results.map((result, index) => (
        <Card key={index} className="w-full bg-card/50 border-border hover:bg-card/70 transition-colors">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base flex items-start gap-2">
              <a 
                href={result.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline flex-1"
              >
                {result.title}
              </a>
              <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            </CardTitle>
            <CardDescription className="text-xs break-all">
              {result.url}
            </CardDescription>
          </CardHeader>
          {result.snippet && (
            <CardContent className="p-4 pt-0">
              <p className="text-sm text-muted-foreground">{result.snippet}</p>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
};
