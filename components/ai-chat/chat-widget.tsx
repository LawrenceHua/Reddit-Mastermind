'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Sparkles,
  Bot,
  User,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  functionCalled?: string;
  functionResult?: any;
  action?: string;
}

interface ChatWidgetProps {
  projectId?: string;
  companyInfo?: any;
  personas?: any[];
  subreddits?: any[];
  topicSeeds?: any[];
  onRefresh?: (type: 'company_info' | 'personas' | 'subreddits' | 'topics') => void;
}

export function ChatWidget({
  projectId,
  companyInfo,
  personas,
  subreddits,
  topicSeeds,
  onRefresh,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm your AI assistant for Reddit Mastermind. I can help you:\n\n• Scrape company websites for info\n• Generate personas, subreddits, and topics\n• Set up your project\n• Navigate the app\n\nWhat would you like to do?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          project_id: projectId,
          context: {
            current_page: pathname,
            company_info: companyInfo,
            personas,
            subreddits,
            topic_seeds: topicSeeds,
          },
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        functionCalled: data.function_called,
        functionResult: data.function_result,
        action: data.action,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Handle actions
      if (data.action) {
        handleAction(data.action, data.function_result);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = (action: string, result?: any) => {
    switch (action) {
      case 'navigate':
        if (result?.path) {
          router.push(result.path);
        }
        break;
      case 'navigate_to_calendar':
        if (projectId) {
          router.push(`/projects/${projectId}/calendar`);
        }
        break;
      case 'refresh_company_info':
        onRefresh?.('company_info');
        break;
      case 'refresh_personas':
        onRefresh?.('personas');
        break;
      case 'refresh_subreddits':
        onRefresh?.('subreddits');
        break;
      case 'refresh_topics':
        onRefresh?.('topics');
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 shadow-lg"
        size="icon"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card
      className={cn(
        'fixed bottom-6 right-6 shadow-2xl border-zinc-200 dark:border-zinc-800 transition-all duration-200',
        isMinimized ? 'w-80 h-14' : 'w-96 h-[500px]'
      )}
    >
      {/* Header */}
      <CardHeader className="flex flex-row items-center justify-between p-3 border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          AI Assistant
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? (
              <Maximize2 className="h-4 w-4" />
            ) : (
              <Minimize2 className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {!isMinimized && (
        <CardContent className="flex flex-col h-[calc(100%-60px)] p-0">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'rounded-lg px-3 py-2 max-w-[80%] text-sm',
                      message.role === 'user'
                        ? 'bg-orange-500 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    )}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                    {message.functionCalled && (
                      <div className="mt-2 text-xs opacity-70 border-t pt-1">
                        ⚡ Executed: {message.functionCalled}
                      </div>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="rounded-lg px-3 py-2 bg-zinc-100 dark:bg-zinc-800">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

