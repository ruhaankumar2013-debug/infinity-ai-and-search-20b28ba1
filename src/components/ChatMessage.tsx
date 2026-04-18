import { cn } from "@/lib/utils";
import { Bot, User, Loader2, Play, Pause } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  frames?: string[];
  isStreaming?: boolean;
}

const AnimatedFramePlayer = ({ frames, fps = 8 }: { frames: string[]; fps?: number }) => {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying && frames.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1) % frames.length);
      }, 1000 / fps);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, frames.length, fps]);

  const togglePlayback = () => setIsPlaying(!isPlaying);

  return (
    <div className="relative group">
      <img
        src={frames[currentFrame]}
        alt={`Animation frame ${currentFrame + 1}`}
        className="rounded-lg max-w-full h-auto shadow-lg"
      />
      {frames.length > 1 && (
        <>
          {/* Playback controls overlay */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between bg-black/60 rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={togglePlayback}
              className="text-white hover:text-primary transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2 text-white text-xs">
              <span>Frame {currentFrame + 1}/{frames.length}</span>
              <div className="w-20 h-1 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${((currentFrame + 1) / frames.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
          {/* Frame indicator dots */}
          <div className="absolute top-2 right-2 flex gap-1">
            {frames.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentFrame(idx);
                  setIsPlaying(false);
                }}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  currentFrame === idx ? "bg-primary scale-125" : "bg-white/50 hover:bg-white/80"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const VideoPlayer = ({ src }: { src: string }) => {
  return (
    <video
      src={src}
      controls
      playsInline
      className="rounded-lg max-w-full h-auto shadow-lg"
    />
  );
};

export const ChatMessage = ({ role, content, imageUrl, frames, isStreaming = false }: ChatMessageProps) => {
  const hasFrames = frames && frames.length > 0;
  const firstFrame = hasFrames ? frames![0] : undefined;
  const isVideoDataUrl = !!firstFrame && /^data:video\//i.test(firstFrame);
  
  return (
    <div
      className={cn(
        "flex gap-3 p-4 rounded-lg transition-all",
        role === "user"
          ? "bg-primary/10 ml-8"
          : "bg-card mr-8"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-gradient-to-br from-primary to-secondary text-background"
        )}
      >
        {role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className="flex-1 pt-1">
        {content ? (
          <p className="text-sm text-foreground whitespace-pre-wrap">{content}</p>
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        ) : null}
        {hasFrames ? (
          <div className="mt-3">
            {isVideoDataUrl ? (
              <VideoPlayer src={firstFrame!} />
            ) : (
              <AnimatedFramePlayer frames={frames!} fps={8} />
            )}
          </div>
        ) : imageUrl ? (
          <div className="mt-3">
            <img 
              src={imageUrl} 
              alt="Generated image" 
              className="rounded-lg max-w-full h-auto shadow-lg"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};
