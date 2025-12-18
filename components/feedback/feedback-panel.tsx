'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Star,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  ExternalLink,
  ChevronDown,
  Loader2,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FeedbackPanelProps {
  assetId: string;
  initialRating?: number | null;
  initialWasPosted?: boolean;
  initialRedditScore?: number | null;
  initialRedditUrl?: string | null;
  onFeedbackSaved?: () => void;
}

export function FeedbackPanel({
  assetId,
  initialRating,
  initialWasPosted = false,
  initialRedditScore,
  initialRedditUrl,
  onFeedbackSaved,
}: FeedbackPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(initialRating ?? null);
  const [wasPosted, setWasPosted] = useState(initialWasPosted);
  const [redditScore, setRedditScore] = useState<string>(
    initialRedditScore?.toString() ?? ''
  );
  const [redditUrl, setRedditUrl] = useState(initialRedditUrl ?? '');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleQuickRating = async (newRating: number) => {
    setRating(newRating);
    await saveFeedback({ rating: newRating });
  };

  const handleWasPosted = async (posted: boolean) => {
    setWasPosted(posted);
    await saveFeedback({ wasPosted: posted });
  };

  const saveFeedback = async (data: {
    rating?: number;
    wasPosted?: boolean;
    redditScore?: number;
    redditUrl?: string;
    feedback?: string;
  }) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/content-assets/${assetId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to save feedback');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onFeedbackSaved?.();
    } catch (error) {
      toast.error('Failed to save feedback');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    await saveFeedback({
      rating: rating ?? undefined,
      wasPosted,
      redditScore: redditScore ? parseInt(redditScore, 10) : undefined,
      redditUrl: redditUrl || undefined,
      feedback: feedback || undefined,
    });
    toast.success('Feedback saved!');
  };

  return (
    <div className="border-t mt-4 pt-4">
      {/* Quick feedback row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Star rating */}
        <div className="flex items-center gap-1">
          <span className="text-sm text-zinc-500 mr-2">Rate:</span>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => handleQuickRating(star)}
              disabled={saving}
              className={cn(
                'p-1 transition-colors',
                rating && rating >= star
                  ? 'text-yellow-500'
                  : 'text-zinc-300 hover:text-yellow-400'
              )}
            >
              <Star
                className={cn(
                  'h-5 w-5',
                  rating && rating >= star ? 'fill-current' : ''
                )}
              />
            </button>
          ))}
          {rating && (
            <Badge variant="outline" className="ml-2 text-xs">
              {rating}/5
            </Badge>
          )}
        </div>

        {/* Posted checkbox */}
        <div className="flex items-center gap-2">
          <Checkbox
            id={`posted-${assetId}`}
            checked={wasPosted}
            onCheckedChange={(checked) => handleWasPosted(checked as boolean)}
            disabled={saving}
          />
          <label
            htmlFor={`posted-${assetId}`}
            className="text-sm cursor-pointer"
          >
            I posted this
          </label>
          {wasPosted && (
            <Badge className="bg-green-500/10 text-green-500 text-xs">
              <Check className="h-3 w-3 mr-1" />
              Posted
            </Badge>
          )}
        </div>

        {/* Saving indicator */}
        {saving && (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
        )}
        {saved && !saving && (
          <span className="text-xs text-green-500 flex items-center gap-1">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
      </div>

      {/* Expandable detailed feedback */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-xs">
            <ChevronDown
              className={cn(
                'h-4 w-4 mr-1 transition-transform',
                isOpen && 'rotate-180'
              )}
            />
            {isOpen ? 'Less options' : 'More feedback options'}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Reddit URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Reddit Post URL</label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://reddit.com/r/..."
                  value={redditUrl}
                  onChange={(e) => setRedditUrl(e.target.value)}
                />
                {redditUrl && (
                  <Button variant="outline" size="icon" asChild>
                    <a href={redditUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {/* Reddit Score */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Upvotes (optional)</label>
              <Input
                type="number"
                placeholder="e.g., 42"
                value={redditScore}
                onChange={(e) => setRedditScore(e.target.value)}
              />
            </div>
          </div>

          {/* Written feedback */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea
              placeholder="What did you like or dislike about this content?"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          {/* Save button */}
          <Button
            onClick={handleSaveAll}
            disabled={saving}
            className="w-full md:w-auto"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Save All Feedback
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Quick thumbs up/down component for inline use
export function QuickFeedback({
  assetId,
  initialRating,
}: {
  assetId: string;
  initialRating?: number | null;
}) {
  const [rating, setRating] = useState<number | null>(initialRating ?? null);
  const [saving, setSaving] = useState(false);

  const handleRating = async (isPositive: boolean) => {
    const newRating = isPositive ? 5 : 2;
    setRating(newRating);
    setSaving(true);

    try {
      await fetch(`/api/content-assets/${assetId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: newRating }),
      });
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleRating(true)}
        disabled={saving}
        className={cn(
          rating === 5 && 'bg-green-500/10 text-green-500'
        )}
      >
        <ThumbsUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleRating(false)}
        disabled={saving}
        className={cn(
          rating === 2 && 'bg-red-500/10 text-red-500'
        )}
      >
        <ThumbsDown className="h-4 w-4" />
      </Button>
    </div>
  );
}

