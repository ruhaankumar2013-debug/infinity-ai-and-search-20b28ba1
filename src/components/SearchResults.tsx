import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Star, Globe, TrendingUp } from "lucide-react";
import { useMemo } from "react";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevance?: number;
  source?: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
}

const getDomainName = (url: string): string => {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain;
  } catch {
    return url;
  }
};

const highlightQuery = (text: string, query: string): string => {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark class="bg-primary/20 text-primary font-medium rounded px-0.5">$1</mark>');
};

const getRelevanceBadge = (relevance?: number) => {
  if (!relevance) return null;
  if (relevance >= 15) return <Badge variant="default" className="text-xs">Top Result</Badge>;
  if (relevance >= 10) return <Badge variant="secondary" className="text-xs">Highly Relevant</Badge>;
  return null;
};

export const SearchResults = ({ results, query }: SearchResultsProps) => {
  const highlightedQuery = useMemo(() => query, [query]);

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
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="w-4 h-4" />
          <span>Found <strong className="text-foreground">{results.length}</strong> results for <strong className="text-foreground">"{query}"</strong></span>
        </div>
        <div className="text-xs text-muted-foreground">
          Sorted by relevance
        </div>
      </div>
      
      <div className="space-y-3">
        {results.map((result, index) => {
          const domain = getDomainName(result.url);
          const isTopResult = index === 0 && (result.relevance || 0) >= 15;
          
          return (
            <Card 
              key={`${result.url}-${index}`} 
              className={`w-full bg-card/50 border-border hover:bg-card/80 transition-all duration-200 hover:shadow-md ${
                isTopResult ? 'ring-2 ring-primary/20' : ''
              }`}
            >
              <CardHeader className="p-5 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <CardTitle className="text-lg leading-tight">
                        <a 
                          href={result.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-semibold line-clamp-2"
                          dangerouslySetInnerHTML={{ __html: highlightQuery(result.title, highlightedQuery) }}
                        />
                      </CardTitle>
                      {getRelevanceBadge(result.relevance)}
                    </div>
                    <CardDescription className="flex items-center gap-2 mt-1.5 text-xs">
                      <Globe className="w-3 h-3 flex-shrink-0" />
                      <a 
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground break-all line-clamp-1"
                      >
                        {domain}
                      </a>
                      {result.source && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <Badge variant="outline" className="text-xs py-0 px-1.5 h-5">
                            {result.source}
                          </Badge>
                        </>
                      )}
                    </CardDescription>
                  </div>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 p-2 hover:bg-accent rounded-lg transition-colors"
                    aria-label="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </a>
                </div>
              </CardHeader>
              {result.snippet && (
                <CardContent className="p-5 pt-0">
                  <p 
                    className="text-sm text-muted-foreground leading-relaxed line-clamp-3"
                    dangerouslySetInnerHTML={{ __html: highlightQuery(result.snippet, highlightedQuery) }}
                  />
                </CardContent>
              )}
              {isTopResult && (
                <div className="px-5 pb-3">
                  <div className="flex items-center gap-1.5 text-xs text-primary">
                    <Star className="w-3 h-3 fill-primary" />
                    <span>Top result for this query</span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
