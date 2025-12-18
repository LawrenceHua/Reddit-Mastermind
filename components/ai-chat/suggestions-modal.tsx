'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SuggestionsModalProps<T> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  suggestions: T[];
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  onAccept: (items: T[]) => void;
  onReplace: (items: T[]) => void;
  isLoading?: boolean;
  error?: string | null;
  getItemId: (item: T) => string;
}

export function SuggestionsModal<T>({
  isOpen,
  onClose,
  title,
  description,
  suggestions,
  renderItem,
  onAccept,
  onReplace,
  isLoading,
  error,
  getItemId,
}: SuggestionsModalProps<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(suggestions.map(getItemId))
  );

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === suggestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suggestions.map(getItemId)));
    }
  };

  const getSelectedItems = () => suggestions.filter((s) => selectedIds.has(getItemId(s)));

  // Update selections when suggestions change
  useState(() => {
    setSelectedIds(new Set(suggestions.map(getItemId)));
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-500" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500 mb-4" />
              <p className="text-sm text-zinc-500">Generating suggestions with AI...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-4" />
              <p className="text-sm text-red-500 font-medium">Error generating suggestions</p>
              <p className="text-sm text-zinc-500 mt-1">{error}</p>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles className="h-8 w-8 text-zinc-400 mb-4" />
              <p className="text-sm text-zinc-500">No suggestions generated yet.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIds.size === suggestions.length}
                    onCheckedChange={toggleAll}
                    id="select-all"
                  />
                  <label
                    htmlFor="select-all"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Select all ({selectedIds.size}/{suggestions.length})
                  </label>
                </div>
              </div>

              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-3">
                  {suggestions.map((item) => {
                    const id = getItemId(item);
                    const isSelected = selectedIds.has(id);
                    return (
                      <div
                        key={id}
                        className={cn(
                          'flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                          isSelected
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'
                            : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                        )}
                        onClick={() => toggleItem(id)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleItem(id)}
                          className="mt-1"
                        />
                        <div className="flex-1">{renderItem(item, isSelected)}</div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onReplace(getSelectedItems());
              onClose();
            }}
            disabled={isLoading || selectedIds.size === 0}
          >
            Replace All
          </Button>
          <Button
            onClick={() => {
              onAccept(getSelectedItems());
              onClose();
            }}
            disabled={isLoading || selectedIds.size === 0}
            className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
          >
            <Check className="h-4 w-4 mr-2" />
            Add Selected ({selectedIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Pre-styled item renderers for common use cases

export function PersonaItem({
  persona,
}: {
  persona: {
    name: string;
    bio: string;
    tone: string;
    expertise_tags: string[];
    disclosure_required: boolean;
    reasoning?: string;
  };
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium">{persona.name}</span>
        <Badge variant={persona.disclosure_required ? 'destructive' : 'secondary'} className="text-xs">
          {persona.disclosure_required ? 'Disclosure Required' : 'Customer Type'}
        </Badge>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">{persona.bio}</p>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-zinc-500">Tone:</span>
        <span>{persona.tone}</span>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {persona.expertise_tags.map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs">
            {tag}
          </Badge>
        ))}
      </div>
      {persona.reasoning && (
        <p className="text-xs text-zinc-500 mt-2 italic">{persona.reasoning}</p>
      )}
    </div>
  );
}

export function SubredditItem({
  subreddit,
}: {
  subreddit: {
    name: string;
    description: string;
    risk_level: string;
    max_posts_per_week: number;
    rules_summary: string;
    subscriber_estimate?: string;
    verified?: boolean;
    reasoning?: string;
  };
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium">{subreddit.name}</span>
        <Badge
          variant={
            subreddit.risk_level === 'low'
              ? 'secondary'
              : subreddit.risk_level === 'high'
              ? 'destructive'
              : 'default'
          }
          className="text-xs"
        >
          {subreddit.risk_level} risk
        </Badge>
        {subreddit.verified && (
          <Badge variant="outline" className="text-xs text-green-600">
            <Check className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        )}
        {subreddit.subscriber_estimate && (
          <Badge variant="outline" className="text-xs">
            {subreddit.subscriber_estimate} members
          </Badge>
        )}
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">{subreddit.description}</p>
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>Max {subreddit.max_posts_per_week} posts/week</span>
      </div>
      {subreddit.rules_summary && (
        <p className="text-xs text-zinc-500 mt-1">
          <span className="font-medium">Rules:</span> {subreddit.rules_summary}
        </p>
      )}
      {subreddit.reasoning && (
        <p className="text-xs text-zinc-500 mt-2 italic">{subreddit.reasoning}</p>
      )}
    </div>
  );
}

export function TopicItem({
  topic,
}: {
  topic: {
    type: string;
    value: string;
    tags: string[];
    reasoning?: string;
    priority?: number;
  };
}) {
  const typeLabels: Record<string, { label: string; color: string }> = {
    target_query: { label: 'Search Query', color: 'bg-blue-100 text-blue-700' },
    pain_point: { label: 'Pain Point', color: 'bg-red-100 text-red-700' },
    competitor: { label: 'Competitor', color: 'bg-purple-100 text-purple-700' },
    faq: { label: 'FAQ', color: 'bg-green-100 text-green-700' },
  };

  const typeInfo = typeLabels[topic.type] || { label: topic.type, color: 'bg-zinc-100 text-zinc-700' };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Badge className={cn('text-xs', typeInfo.color)}>{typeInfo.label}</Badge>
        {topic.priority && (
          <Badge variant="outline" className="text-xs">
            Priority: {topic.priority}/5
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium mb-2">{topic.value}</p>
      <div className="flex flex-wrap gap-1">
        {topic.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs">
            {tag}
          </Badge>
        ))}
      </div>
      {topic.reasoning && (
        <p className="text-xs text-zinc-500 mt-2 italic">{topic.reasoning}</p>
      )}
    </div>
  );
}

