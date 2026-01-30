import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, X, Clock, TrendingUp, Filter, Sparkles, Keyboard as KeyboardIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SearchResults } from "@/components/SearchResults";
import { AISearchSummary } from "@/components/AISearchSummary";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevance?: number;
  source?: string;
}

const RECENT_SEARCHES_KEY = "infinity_search_recent";
const MAX_RECENT_SEARCHES = 5;

export const SearchTab = () => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [lastQuery, setLastQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchType, setSearchType] = useState<"all" | "web" | "images" | "news">("all");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // Escape to clear search
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setQuery("");
        setShowSuggestions(false);
      }
      // Ctrl/Cmd + / to show shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShowShortcuts(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // Load recent searches from localStorage
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to load recent searches:", e);
      }
    }
  }, []);

  const saveRecentSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    const updated = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, MAX_RECENT_SEARCHES);
    setRecentSearches(updated);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const handleSearch = async (searchQuery?: string) => {
    const finalQuery = searchQuery || query.trim();
    if (!finalQuery) return;

    setIsSearching(true);
    setLastQuery(finalQuery);
    setShowSuggestions(false);
    saveRecentSearch(finalQuery);

    try {
      // Try multiple search sources for better results
      const searchPromises = [
        supabase.functions.invoke('duckduckgo-search', {
          body: { query: finalQuery }
        }),
        supabase.functions.invoke('web-search', {
          body: { query: finalQuery, type: 'search' }
        })
      ];

      const responses = await Promise.allSettled(searchPromises);
      const allResults: SearchResult[] = [];

      responses.forEach((response, index) => {
        if (response.status === 'fulfilled' && response.value.data?.results) {
          const sourceResults = response.value.data.results.map((r: SearchResult) => ({
            ...r,
            source: index === 0 ? 'DuckDuckGo' : 'Web Search',
            relevance: calculateRelevance(r, finalQuery)
          }));
          allResults.push(...sourceResults);
        }
      });

      // Deduplicate and rank results
      const uniqueResults = deduplicateResults(allResults);
      const rankedResults = rankResults(uniqueResults, finalQuery);

      if (rankedResults.length > 0) {
        setResults(rankedResults.slice(0, 20)); // Show top 20 results
      } else {
        setResults([]);
        toast({
          title: "No results found",
          description: "Try a different search query or check your connection",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error("Search error:", error);
      toast({
        title: "Search failed",
        description: "Failed to perform search. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const calculateRelevance = (result: SearchResult, query: string): number => {
    let score = 0;
    const lowerQuery = query.toLowerCase();
    const lowerTitle = result.title.toLowerCase();
    const lowerSnippet = result.snippet.toLowerCase();
    const lowerUrl = result.url.toLowerCase();

    // Title matches are most important
    if (lowerTitle.includes(lowerQuery)) score += 10;
    if (lowerTitle.startsWith(lowerQuery)) score += 5;

    // Snippet matches
    if (lowerSnippet.includes(lowerQuery)) score += 3;

    // URL matches
    if (lowerUrl.includes(lowerQuery)) score += 2;

    // Exact phrase match bonus
    if (lowerTitle.includes(lowerQuery) || lowerSnippet.includes(lowerQuery)) score += 5;

    // Domain authority (simple heuristic)
    const domain = new URL(result.url).hostname;
    if (domain.includes('edu') || domain.includes('gov') || domain.includes('org')) score += 2;
    if (domain.includes('wikipedia')) score += 3;

    return score;
  };

  const deduplicateResults = (results: SearchResult[]): SearchResult[] => {
    const seen = new Set<string>();
    return results.filter(result => {
      const key = result.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const rankResults = (results: SearchResult[], query: string): SearchResult[] => {
    return results.sort((a, b) => {
      const scoreA = a.relevance || calculateRelevance(a, query);
      const scoreB = b.relevance || calculateRelevance(b, query);
      return scoreB - scoreA;
    });
  };

  const handleRecentSearchClick = (recentQuery: string) => {
    setQuery(recentQuery);
    handleSearch(recentQuery);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-border shadow-xl hover:shadow-2xl transition-shadow">
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary via-primary/90 to-secondary flex items-center justify-center shadow-lg ring-2 ring-primary/20">
                <Sparkles className="w-7 h-7 text-background" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                  Infinity Search
                  <Badge variant="secondary" className="text-xs font-semibold">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Enhanced
                  </Badge>
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">Multi-source intelligent search with AI summaries</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={searchType} onValueChange={(value: any) => setSearchType(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Results</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="images">Images</SelectItem>
                  <SelectItem value="news">News</SelectItem>
                </SelectContent>
              </Select>
              <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <KeyboardIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Shortcuts</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <KeyboardIcon className="w-5 h-5" />
                      Keyboard Shortcuts
                    </DialogTitle>
                    <DialogDescription>
                      Speed up your search with these keyboard shortcuts
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="text-sm">Focus Search</span>
                        <kbd className="px-2 py-1 text-xs font-semibold text-foreground bg-background border border-border rounded shadow-sm">
                          {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + K
                        </kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="text-sm">Search</span>
                        <kbd className="px-2 py-1 text-xs font-semibold text-foreground bg-background border border-border rounded shadow-sm">
                          Enter
                        </kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="text-sm">Clear Search</span>
                        <kbd className="px-2 py-1 text-xs font-semibold text-foreground bg-background border border-border rounded shadow-sm">
                          Esc
                        </kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="text-sm">Show Shortcuts</span>
                        <kbd className="px-2 py-1 text-xs font-semibold text-foreground bg-background border border-border rounded shadow-sm">
                          {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + /
                        </kbd>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="relative">
          <div className="flex gap-2">
              <div className="flex-1 relative">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <Input
                    ref={inputRef}
              value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setShowSuggestions(e.target.value.length > 0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isSearching) {
                        handleSearch();
                      } else if (e.key === "Escape") {
                        setShowSuggestions(false);
                      }
                    }}
                    onFocus={() => setShowSuggestions(query.length > 0 || recentSearches.length > 0)}
                    placeholder="Search the web with enhanced results..."
              disabled={isSearching}
                    className="pl-12 pr-24 text-lg h-14 border-2 focus:border-primary transition-colors"
                  />
                  {!query && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                      <kbd className="hidden sm:inline-flex px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded shadow-sm">
                        {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}K
                      </kbd>
                    </div>
                  )}
                  {query && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setQuery("");
                        setShowSuggestions(false);
                        inputRef.current?.focus();
                      }}
                      title="Clear (Esc)"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              <Button 
                onClick={() => handleSearch()} 
                disabled={isSearching || !query.trim()}
                size="lg"
                className="h-14 px-8 text-base font-semibold shadow-lg hover:shadow-xl transition-shadow"
              >
              {isSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
              ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </>
              )}
            </Button>
            </div>

            {/* Search Suggestions */}
            {showSuggestions && (recentSearches.length > 0 || query.length > 0) && (
              <Card className="absolute z-50 w-full mt-2 bg-card border-border shadow-xl">
                {recentSearches.length > 0 && (
                  <div className="p-3 border-b border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span className="font-medium">Recent Searches</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearRecentSearches}
                        className="h-6 px-2 text-xs"
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.slice(0, 5).map((recent, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="cursor-pointer hover:bg-accent transition-colors"
                          onClick={() => handleRecentSearchClick(recent)}
                        >
                          {recent}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {query.length > 0 && (
                  <div className="p-2">
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => handleSearch()}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Search for "{query}"
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </div>

          {lastQuery && !isSearching && results.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span>Found <strong className="text-foreground">{results.length}</strong> results for <strong className="text-foreground">"{lastQuery}"</strong></span>
            </div>
          )}
        </div>
      </Card>

      {results.length > 0 && (
        <div className="space-y-4">
          <AISearchSummary query={lastQuery} results={results} />
          <SearchResults results={results} query={lastQuery} />
        </div>
      )}

      {!isSearching && results.length === 0 && lastQuery && (
        <Card className="p-12 bg-card/50 border-border">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No results found</h3>
              <p className="text-muted-foreground mb-1">No results found for "{lastQuery}"</p>
              <p className="text-sm text-muted-foreground">Try:</p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li>• Using different keywords</li>
                <li>• Checking your spelling</li>
                <li>• Using more general terms</li>
              </ul>
            </div>
          </div>
        </Card>
      )}

      {!lastQuery && !isSearching && (
        <Card className="p-12 bg-card/50 border-border">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">Enhanced Search Engine</h3>
              <p className="text-muted-foreground mb-4">
                Get better results with our multi-source intelligent search
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-left">
                <div className="p-4 rounded-lg bg-card border border-border">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                    <Search className="w-4 h-4 text-primary" />
                  </div>
                  <h4 className="font-semibold text-sm mb-1">Multi-Source</h4>
                  <p className="text-xs text-muted-foreground">Combines multiple search engines for comprehensive results</p>
                </div>
                <div className="p-4 rounded-lg bg-card border border-border">
                  <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center mb-2">
                    <TrendingUp className="w-4 h-4 text-secondary" />
                  </div>
                  <h4 className="font-semibold text-sm mb-1">Smart Ranking</h4>
                  <p className="text-xs text-muted-foreground">Intelligent relevance scoring for better results</p>
                </div>
                <div className="p-4 rounded-lg bg-card border border-border">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center mb-2">
                    <Clock className="w-4 h-4 text-accent" />
                  </div>
                  <h4 className="font-semibold text-sm mb-1">Recent Searches</h4>
                  <p className="text-xs text-muted-foreground">Quick access to your search history</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
