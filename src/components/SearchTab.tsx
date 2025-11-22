import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SearchResults } from "@/components/SearchResults";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export const SearchTab = () => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [lastQuery, setLastQuery] = useState("");
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setLastQuery(query);

    try {
      const { data, error } = await supabase.functions.invoke('duckduckgo-search', {
        body: { query: query.trim() }
      });

      if (error) throw error;

      if (data?.results && data.results.length > 0) {
        setResults(data.results);
      } else {
        setResults([]);
        toast({
          title: "No results found",
          description: "Try a different search query",
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

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-border">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Search className="w-5 h-5 text-background" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Web Search</h2>
              <p className="text-sm text-muted-foreground">Powered by DuckDuckGo</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isSearching && handleSearch()}
              placeholder="Search the web..."
              disabled={isSearching}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isSearching || !query.trim()}>
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>

      {results.length > 0 && (
        <div className="space-y-4">
          <SearchResults results={results} query={lastQuery} />
        </div>
      )}

      {!isSearching && results.length === 0 && lastQuery && (
        <Card className="p-8 bg-card/50 border-border">
          <div className="text-center space-y-2">
            <Search className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No results found for "{lastQuery}"</p>
            <p className="text-sm text-muted-foreground">Try a different search query</p>
          </div>
        </Card>
      )}

      {!lastQuery && (
        <Card className="p-8 bg-card/50 border-border">
          <div className="text-center space-y-2">
            <Search className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Enter a search query to get started</p>
          </div>
        </Card>
      )}
    </div>
  );
};
