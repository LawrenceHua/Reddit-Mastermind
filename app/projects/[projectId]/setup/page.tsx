'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  Users,
  Hash,
  Target,
  Settings,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  ArrowRight,
  Cloud,
  CloudOff,
  Sparkles,
  Globe,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ChatWidget } from '@/components/ai-chat';
import {
  SuggestionsModal,
  PersonaItem,
  SubredditItem,
  TopicItem,
} from '@/components/ai-chat/suggestions-modal';

// Debounce delay in ms
const AUTOSAVE_DELAY = 1000;

interface ProjectData {
  id: string;
  name: string;
  company_profile_json: {
    name?: string;
    description?: string;
    website?: string;
    industry?: string;
    target_audience?: string;
    key_benefits?: string[];
    brand_voice?: string;
  };
  brand_voice_json: {
    tone?: string;
    keywords?: string[];
  };
  posts_per_week: number;
  risk_tolerance: 'low' | 'medium' | 'high';
}

interface Persona {
  id?: string;
  name: string;
  bio: string;
  tone: string;
  expertise_tags: string[];
  disclosure_rules_json: { required: boolean };
  active: boolean;
}

interface Subreddit {
  id?: string;
  name: string;
  rules_text: string;
  risk_level: 'low' | 'medium' | 'high';
  max_posts_per_week: number;
}

interface TopicSeed {
  id?: string;
  seed_type: 'target_query' | 'pain_point' | 'competitor' | 'faq';
  text: string;
  tags: string[];
  priority: number;
  active: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// AI Suggestion Types
interface PersonaSuggestion {
  name: string;
  bio: string;
  tone: string;
  expertise_tags: string[];
  disclosure_required: boolean;
  reasoning?: string;
}

interface SubredditSuggestion {
  name: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
  max_posts_per_week: number;
  rules_summary: string;
  subscriber_estimate?: string;
  verified?: boolean;
  reasoning?: string;
}

interface TopicSuggestion {
  type: 'target_query' | 'pain_point' | 'competitor' | 'faq';
  value: string;
  tags: string[];
  reasoning?: string;
  priority?: number;
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  switch (status) {
    case 'saving':
      return (
        <div className="flex items-center gap-2 text-amber-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Saving...</span>
        </div>
      );
    case 'saved':
      return (
        <div className="flex items-center gap-2 text-green-500">
          <Cloud className="h-4 w-4" />
          <span className="text-sm">Saved</span>
        </div>
      );
    case 'error':
      return (
        <div className="flex items-center gap-2 text-red-500">
          <CloudOff className="h-4 w-4" />
          <span className="text-sm">Save failed</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-2 text-zinc-400">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">All changes saved</span>
        </div>
      );
  }
}

export default function SetupPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('company');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // Data states
  const [project, setProject] = useState<ProjectData | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [topicSeeds, setTopicSeeds] = useState<TopicSeed[]>([]);

  // AI states
  const [isScrapingWebsite, setIsScrapingWebsite] = useState(false);
  const [isLoadingPersonas, setIsLoadingPersonas] = useState(false);
  const [isLoadingSubreddits, setIsLoadingSubreddits] = useState(false);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);

  const [personaSuggestions, setPersonaSuggestions] = useState<PersonaSuggestion[]>([]);
  const [subredditSuggestions, setSubredditSuggestions] = useState<SubredditSuggestion[]>([]);
  const [topicSuggestions, setTopicSuggestions] = useState<TopicSuggestion[]>([]);

  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [showSubredditModal, setShowSubredditModal] = useState(false);
  const [showTopicModal, setShowTopicModal] = useState(false);

  const [aiError, setAiError] = useState<string | null>(null);

  // Refs for debouncing
  const projectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const personaTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const subredditTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const topicSeedTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Load data
  useEffect(() => {
    async function loadData() {
      const supabase = createClient();

      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectData) {
        setProject(projectData as unknown as ProjectData);
      }

      const { data: personasData } = await supabase
        .from('personas')
        .select('*')
        .eq('project_id', projectId);

      if (personasData) {
        setPersonas(personasData as unknown as Persona[]);
      }

      const { data: subredditsData } = await supabase
        .from('subreddits')
        .select('*')
        .eq('project_id', projectId);

      if (subredditsData) {
        setSubreddits(subredditsData as unknown as Subreddit[]);
      }

      const { data: topicSeedsData } = await supabase
        .from('topic_seeds')
        .select('*')
        .eq('project_id', projectId)
        .order('priority', { ascending: false });

      if (topicSeedsData) {
        setTopicSeeds(topicSeedsData as unknown as TopicSeed[]);
      }

      setLoading(false);
    }

    loadData();
  }, [projectId]);

  // Autosave project
  const saveProjectDebounced = useCallback(
    (updatedProject: ProjectData) => {
      if (projectTimeoutRef.current) {
        clearTimeout(projectTimeoutRef.current);
      }

      setSaveStatus('saving');

      projectTimeoutRef.current = setTimeout(async () => {
        const supabase = createClient();
        const { error } = await (supabase.from('projects') as any)
          .update({
            company_profile_json: updatedProject.company_profile_json,
            brand_voice_json: updatedProject.brand_voice_json,
            posts_per_week: updatedProject.posts_per_week,
            risk_tolerance: updatedProject.risk_tolerance,
          })
          .eq('id', projectId);

        if (error) {
          setSaveStatus('error');
          toast.error('Failed to save project');
        } else {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        }
      }, AUTOSAVE_DELAY);
    },
    [projectId]
  );

  // Autosave persona
  const savePersonaDebounced = useCallback((persona: Persona) => {
    const personaId = persona.id;
    if (!personaId) return;

    const existingTimeout = personaTimeoutsRef.current.get(personaId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    setSaveStatus('saving');

    const timeout = setTimeout(async () => {
      const supabase = createClient();
      const { error } = await (supabase.from('personas') as any)
        .update({
          name: persona.name,
          bio: persona.bio,
          tone: persona.tone,
          expertise_tags: persona.expertise_tags,
          disclosure_rules_json: persona.disclosure_rules_json,
          active: persona.active,
        })
        .eq('id', personaId);

      if (error) {
        setSaveStatus('error');
        toast.error('Failed to save persona');
      } else {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    }, AUTOSAVE_DELAY);

    personaTimeoutsRef.current.set(personaId, timeout);
  }, []);

  // Autosave subreddit
  const saveSubredditDebounced = useCallback((subreddit: Subreddit) => {
    const subredditId = subreddit.id;
    if (!subredditId) return;

    const existingTimeout = subredditTimeoutsRef.current.get(subredditId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    setSaveStatus('saving');

    const timeout = setTimeout(async () => {
      const supabase = createClient();
      const { error } = await (supabase.from('subreddits') as any)
        .update({
          name: subreddit.name,
          rules_text: subreddit.rules_text,
          risk_level: subreddit.risk_level,
          max_posts_per_week: subreddit.max_posts_per_week,
        })
        .eq('id', subredditId);

      if (error) {
        setSaveStatus('error');
        toast.error('Failed to save subreddit');
      } else {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    }, AUTOSAVE_DELAY);

    subredditTimeoutsRef.current.set(subredditId, timeout);
  }, []);

  // Autosave topic seed
  const saveTopicSeedDebounced = useCallback((seed: TopicSeed) => {
    const seedId = seed.id;
    if (!seedId) return;

    const existingTimeout = topicSeedTimeoutsRef.current.get(seedId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    setSaveStatus('saving');

    const timeout = setTimeout(async () => {
      const supabase = createClient();
      const { error } = await (supabase.from('topic_seeds') as any)
        .update({
          seed_type: seed.seed_type,
          text: seed.text,
          tags: seed.tags,
          priority: seed.priority,
          active: seed.active,
        })
        .eq('id', seedId);

      if (error) {
        setSaveStatus('error');
        toast.error('Failed to save topic');
      } else {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    }, AUTOSAVE_DELAY);

    topicSeedTimeoutsRef.current.set(seedId, timeout);
  }, []);

  // Update handlers that trigger autosave
  const updateProject = (updates: Partial<ProjectData>) => {
    if (!project) return;
    const updated = { ...project, ...updates };
    setProject(updated);
    saveProjectDebounced(updated);
  };

  const updatePersona = (idx: number, updates: Partial<Persona>) => {
    const updated = [...personas];
    updated[idx] = { ...updated[idx], ...updates };
    setPersonas(updated);
    savePersonaDebounced(updated[idx]);
  };

  const updateSubreddit = (idx: number, updates: Partial<Subreddit>) => {
    const updated = [...subreddits];
    updated[idx] = { ...updated[idx], ...updates };
    setSubreddits(updated);
    saveSubredditDebounced(updated[idx]);
  };

  const updateTopicSeed = (idx: number, updates: Partial<TopicSeed>) => {
    const updated = [...topicSeeds];
    updated[idx] = { ...updated[idx], ...updates };
    setTopicSeeds(updated);
    saveTopicSeedDebounced(updated[idx]);
  };

  // Add handlers
  const addPersona = async () => {
    const supabase = createClient();
    const newPersona: Persona = {
      name: 'New Persona',
      bio: '',
      tone: 'casual',
      expertise_tags: [],
      disclosure_rules_json: { required: false },
      active: true,
    };

    const { data, error } = await (supabase.from('personas') as any)
      .insert({ ...newPersona, project_id: projectId })
      .select()
      .single();

    if (!error && data) {
      setPersonas([...personas, data as unknown as Persona]);
      toast.success('Persona added');
    }
  };

  const addSubreddit = async () => {
    const supabase = createClient();
    const newSubreddit: Subreddit = {
      name: 'NewSubreddit',
      rules_text: '',
      risk_level: 'medium',
      max_posts_per_week: 1,
    };

    const { data, error } = await (supabase.from('subreddits') as any)
      .insert({ ...newSubreddit, project_id: projectId })
      .select()
      .single();

    if (!error && data) {
      setSubreddits([...subreddits, data as unknown as Subreddit]);
      toast.success('Subreddit added');
    }
  };

  const addTopicSeed = async () => {
    const supabase = createClient();
    const newSeed: TopicSeed = {
      seed_type: 'target_query',
      text: '',
      tags: [],
      priority: 0,
      active: true,
    };

    const { data, error } = await (supabase.from('topic_seeds') as any)
      .insert({ ...newSeed, project_id: projectId })
      .select()
      .single();

    if (!error && data) {
      setTopicSeeds([...topicSeeds, data as unknown as TopicSeed]);
      toast.success('Topic seed added');
    }
  };

  // Delete handlers
  const deletePersona = async (idx: number) => {
    const persona = personas[idx];
    if (!persona.id) return;

    const supabase = createClient();
    const { error } = await supabase.from('personas').delete().eq('id', persona.id);

    if (!error) {
      setPersonas(personas.filter((_, i) => i !== idx));
      toast.success('Persona deleted');
    } else {
      toast.error('Failed to delete persona');
    }
  };

  const deleteSubreddit = async (idx: number) => {
    const sub = subreddits[idx];
    if (!sub.id) return;

    const supabase = createClient();
    const { error } = await supabase.from('subreddits').delete().eq('id', sub.id);

    if (!error) {
      setSubreddits(subreddits.filter((_, i) => i !== idx));
      toast.success('Subreddit deleted');
    } else {
      toast.error('Failed to delete subreddit');
    }
  };

  const deleteTopicSeed = async (idx: number) => {
    const seed = topicSeeds[idx];
    if (!seed.id) return;

    const supabase = createClient();
    const { error } = await supabase.from('topic_seeds').delete().eq('id', seed.id);

    if (!error) {
      setTopicSeeds(topicSeeds.filter((_, i) => i !== idx));
      toast.success('Topic deleted');
    } else {
      toast.error('Failed to delete topic');
    }
  };

  // AI Functions
  const scrapeWebsite = async () => {
    const website = project?.company_profile_json?.website;
    if (!website) {
      toast.error('Please enter a website URL first');
      return;
    }

    // Validate URL
    try {
      new URL(website.startsWith('http') ? website : `https://${website}`);
    } catch {
      toast.error('Please enter a valid website URL');
      return;
    }

    setIsScrapingWebsite(true);
    setAiError(null);

    try {
      const response = await fetch('/api/ai/scrape-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website_url: website.startsWith('http') ? website : `https://${website}`,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Update project with scraped data
      updateProject({
        company_profile_json: {
          ...project.company_profile_json,
          name: data.data.name || project.company_profile_json?.name,
          description: data.data.description || project.company_profile_json?.description,
          industry: data.data.industry || project.company_profile_json?.industry,
          target_audience: data.data.target_audience,
          key_benefits: data.data.key_benefits,
          brand_voice: data.data.brand_voice,
        },
      });

      toast.success('Company info extracted from website!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to scrape website';
      setAiError(message);
      toast.error(message);
    } finally {
      setIsScrapingWebsite(false);
    }
  };

  const generatePersonaSuggestions = async () => {
    if (!project?.company_profile_json?.name) {
      toast.error('Please fill in company info first');
      return;
    }

    setIsLoadingPersonas(true);
    setAiError(null);
    setPersonaSuggestions([]);
    setShowPersonaModal(true);

    try {
      const response = await fetch('/api/ai/suggest-personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: project.company_profile_json.name,
          company_description: project.company_profile_json.description || '',
          industry: project.company_profile_json.industry || 'Technology',
          target_audience: project.company_profile_json.target_audience || 'Business professionals',
          brand_voice: project.company_profile_json.brand_voice,
          num_personas: 3,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setPersonaSuggestions(data.data.personas);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate personas';
      setAiError(message);
      toast.error(message);
    } finally {
      setIsLoadingPersonas(false);
    }
  };

  const generateSubredditSuggestions = async () => {
    if (!project?.company_profile_json?.name) {
      toast.error('Please fill in company info first');
      return;
    }

    setIsLoadingSubreddits(true);
    setAiError(null);
    setSubredditSuggestions([]);
    setShowSubredditModal(true);

    try {
      const response = await fetch('/api/ai/suggest-subreddits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: project.company_profile_json.name,
          company_description: project.company_profile_json.description || '',
          industry: project.company_profile_json.industry || 'Technology',
          target_audience: project.company_profile_json.target_audience || 'Business professionals',
          num_subreddits: 5,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setSubredditSuggestions(data.data.subreddits);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to suggest subreddits';
      setAiError(message);
      toast.error(message);
    } finally {
      setIsLoadingSubreddits(false);
    }
  };

  const generateTopicSuggestions = async () => {
    if (!project?.company_profile_json?.name) {
      toast.error('Please fill in company info first');
      return;
    }

    setIsLoadingTopics(true);
    setAiError(null);
    setTopicSuggestions([]);
    setShowTopicModal(true);

    try {
      const response = await fetch('/api/ai/suggest-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: project.company_profile_json.name,
          company_description: project.company_profile_json.description || '',
          industry: project.company_profile_json.industry || 'Technology',
          target_audience: project.company_profile_json.target_audience || 'Business professionals',
          key_benefits: project.company_profile_json.key_benefits,
          subreddits: subreddits.map((s) => s.name),
          num_topics: 10,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setTopicSuggestions(data.data.topics);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate topics';
      setAiError(message);
      toast.error(message);
    } finally {
      setIsLoadingTopics(false);
    }
  };

  // Accept suggestions handlers
  const acceptPersonaSuggestions = async (selectedPersonas: PersonaSuggestion[]) => {
    const supabase = createClient();

    for (const persona of selectedPersonas) {
      const newPersona = {
        project_id: projectId,
        name: persona.name,
        bio: persona.bio,
        tone: persona.tone,
        expertise_tags: persona.expertise_tags,
        disclosure_rules_json: { required: persona.disclosure_required },
        active: true,
      };

      const { data, error } = await (supabase.from('personas') as any)
        .insert(newPersona)
        .select()
        .single();

      if (!error && data) {
        setPersonas((prev) => [...prev, data as unknown as Persona]);
      }
    }

    toast.success(`Added ${selectedPersonas.length} persona(s)`);
  };

  const replacePersonaSuggestions = async (selectedPersonas: PersonaSuggestion[]) => {
    const supabase = createClient();

    // Delete existing personas
    for (const persona of personas) {
      if (persona.id) {
        await supabase.from('personas').delete().eq('id', persona.id);
      }
    }
    setPersonas([]);

    // Add new ones
    await acceptPersonaSuggestions(selectedPersonas);
  };

  const acceptSubredditSuggestions = async (selectedSubreddits: SubredditSuggestion[]) => {
    const supabase = createClient();

    for (const sub of selectedSubreddits) {
      const newSubreddit = {
        project_id: projectId,
        name: sub.name,
        rules_text: sub.rules_summary,
        risk_level: sub.risk_level,
        max_posts_per_week: sub.max_posts_per_week,
      };

      const { data, error } = await (supabase.from('subreddits') as any)
        .insert(newSubreddit)
        .select()
        .single();

      if (!error && data) {
        setSubreddits((prev) => [...prev, data as unknown as Subreddit]);
      }
    }

    toast.success(`Added ${selectedSubreddits.length} subreddit(s)`);
  };

  const replaceSubredditSuggestions = async (selectedSubreddits: SubredditSuggestion[]) => {
    const supabase = createClient();

    // Delete existing subreddits
    for (const sub of subreddits) {
      if (sub.id) {
        await supabase.from('subreddits').delete().eq('id', sub.id);
      }
    }
    setSubreddits([]);

    // Add new ones
    await acceptSubredditSuggestions(selectedSubreddits);
  };

  const acceptTopicSuggestions = async (selectedTopics: TopicSuggestion[]) => {
    const supabase = createClient();

    for (const topic of selectedTopics) {
      const newTopic = {
        project_id: projectId,
        seed_type: topic.type,
        text: topic.value,
        tags: topic.tags,
        priority: topic.priority || 5,
        active: true,
      };

      const { data, error } = await (supabase.from('topic_seeds') as any)
        .insert(newTopic)
        .select()
        .single();

      if (!error && data) {
        setTopicSeeds((prev) => [...prev, data as unknown as TopicSeed]);
      }
    }

    toast.success(`Added ${selectedTopics.length} topic(s)`);
  };

  const replaceTopicSuggestions = async (selectedTopics: TopicSuggestion[]) => {
    const supabase = createClient();

    // Delete existing topics
    for (const seed of topicSeeds) {
      if (seed.id) {
        await supabase.from('topic_seeds').delete().eq('id', seed.id);
      }
    }
    setTopicSeeds([]);

    // Add new ones
    await acceptTopicSuggestions(selectedTopics);
  };

  // Refresh handler for chat widget
  const handleChatRefresh = useCallback(
    async (type: 'company_info' | 'personas' | 'subreddits' | 'topics') => {
      const supabase = createClient();

      switch (type) {
        case 'company_info': {
          const { data } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();
          if (data) setProject(data as unknown as ProjectData);
          break;
        }
        case 'personas': {
          const { data } = await supabase.from('personas').select('*').eq('project_id', projectId);
          if (data) setPersonas(data as unknown as Persona[]);
          break;
        }
        case 'subreddits': {
          const { data } = await supabase
            .from('subreddits')
            .select('*')
            .eq('project_id', projectId);
          if (data) setSubreddits(data as unknown as Subreddit[]);
          break;
        }
        case 'topics': {
          const { data } = await supabase
            .from('topic_seeds')
            .select('*')
            .eq('project_id', projectId)
            .order('priority', { ascending: false });
          if (data) setTopicSeeds(data as unknown as TopicSeed[]);
          break;
        }
      }
    },
    [projectId]
  );

  if (loading) {
    return (
      <AppShell title="Setup" projectId={projectId}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell title="Setup" projectId={projectId}>
        <Alert variant="destructive">
          <AlertDescription>Project not found</AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  return (
    <AppShell title={`Setup: ${project.name}`} projectId={projectId}>
      <div className="max-w-4xl mx-auto space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="company" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Company</span>
            </TabsTrigger>
            <TabsTrigger value="personas" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Personas</span>
            </TabsTrigger>
            <TabsTrigger value="subreddits" className="flex items-center gap-2">
              <Hash className="h-4 w-4" />
              <span className="hidden sm:inline">Subreddits</span>
            </TabsTrigger>
            <TabsTrigger value="topics" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Topics</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          {/* Company Profile */}
          <TabsContent value="company" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Company Profile</CardTitle>
                    <CardDescription>
                      Information about your company that helps generate authentic content
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={scrapeWebsite}
                    disabled={isScrapingWebsite || !project.company_profile_json?.website}
                    className="gap-2"
                  >
                    {isScrapingWebsite ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Globe className="h-4 w-4" />
                    )}
                    <Sparkles className="h-4 w-4 text-orange-500" />
                    Auto-fill from Website
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      value={project.company_profile_json?.name ?? ''}
                      onChange={(e) =>
                        updateProject({
                          company_profile_json: {
                            ...project.company_profile_json,
                            name: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      placeholder="https://example.com"
                      value={project.company_profile_json?.website ?? ''}
                      onChange={(e) =>
                        updateProject({
                          company_profile_json: {
                            ...project.company_profile_json,
                            website: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    rows={4}
                    value={project.company_profile_json?.description ?? ''}
                    onChange={(e) =>
                      updateProject({
                        company_profile_json: {
                          ...project.company_profile_json,
                          description: e.target.value,
                        },
                      })
                    }
                    placeholder="What does your company do? What problems do you solve?"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      value={project.company_profile_json?.industry ?? ''}
                      onChange={(e) =>
                        updateProject({
                          company_profile_json: {
                            ...project.company_profile_json,
                            industry: e.target.value,
                          },
                        })
                      }
                      placeholder="e.g., SaaS, E-commerce, Healthcare"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="targetAudience">Target Audience</Label>
                    <Input
                      id="targetAudience"
                      value={project.company_profile_json?.target_audience ?? ''}
                      onChange={(e) =>
                        updateProject({
                          company_profile_json: {
                            ...project.company_profile_json,
                            target_audience: e.target.value,
                          },
                        })
                      }
                      placeholder="e.g., Small business owners, developers"
                    />
                  </div>
                </div>
                {project.company_profile_json?.key_benefits &&
                  project.company_profile_json.key_benefits.length > 0 && (
                    <div className="space-y-2">
                      <Label>Key Benefits (AI-detected)</Label>
                      <div className="flex flex-wrap gap-2">
                        {project.company_profile_json.key_benefits.map((benefit, idx) => (
                          <Badge key={idx} variant="secondary">
                            {benefit}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                {project.company_profile_json?.brand_voice && (
                  <div className="space-y-2">
                    <Label>Brand Voice (AI-detected)</Label>
                    <Badge variant="outline">{project.company_profile_json.brand_voice}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Personas */}
          <TabsContent value="personas" className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Writing Personas</h3>
                <p className="text-sm text-zinc-500">
                  Define the voices that will create your content
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={generatePersonaSuggestions}>
                  <Wand2 className="mr-2 h-4 w-4" />
                  <Sparkles className="mr-2 h-4 w-4 text-orange-500" />
                  AI Suggest
                </Button>
                <Button onClick={addPersona}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Persona
                </Button>
              </div>
            </div>

            {personas.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-zinc-400 mb-4" />
                  <p className="text-zinc-500 mb-4">No personas yet. Add one to get started.</p>
                  <Button variant="outline" onClick={generatePersonaSuggestions}>
                    <Sparkles className="mr-2 h-4 w-4 text-orange-500" />
                    Generate with AI
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {personas.map((persona, idx) => (
                  <Card key={persona.id ?? idx}>
                    <CardContent className="pt-6">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input
                            value={persona.name}
                            onChange={(e) => updatePersona(idx, { name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tone</Label>
                          <Input
                            value={persona.tone ?? ''}
                            onChange={(e) => updatePersona(idx, { tone: e.target.value })}
                            placeholder="e.g., casual and helpful, analytical, friendly"
                          />
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <Label>Bio</Label>
                        <Textarea
                          value={persona.bio ?? ''}
                          onChange={(e) => updatePersona(idx, { bio: e.target.value })}
                          placeholder="Background and expertise of this persona"
                        />
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={persona.disclosure_rules_json?.required ?? false}
                              onCheckedChange={(checked) =>
                                updatePersona(idx, {
                                  disclosure_rules_json: { required: checked },
                                })
                              }
                            />
                            <Label>Require disclosure</Label>
                          </div>
                          <Badge variant={persona.active ? 'default' : 'secondary'}>
                            {persona.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => deletePersona(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Subreddits */}
          <TabsContent value="subreddits" className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Target Subreddits</h3>
                <p className="text-sm text-zinc-500">Communities where you want to share content</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={generateSubredditSuggestions}>
                  <Hash className="mr-2 h-4 w-4" />
                  <Sparkles className="mr-2 h-4 w-4 text-orange-500" />
                  AI Discover
                </Button>
                <Button onClick={addSubreddit}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Subreddit
                </Button>
              </div>
            </div>

            {subreddits.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Hash className="h-12 w-12 text-zinc-400 mb-4" />
                  <p className="text-zinc-500 mb-4">No subreddits yet. Add one to get started.</p>
                  <Button variant="outline" onClick={generateSubredditSuggestions}>
                    <Sparkles className="mr-2 h-4 w-4 text-orange-500" />
                    Discover with AI
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {subreddits.map((sub, idx) => (
                  <Card key={sub.id ?? idx}>
                    <CardContent className="pt-6">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Subreddit Name</Label>
                          <div className="flex items-center">
                            <span className="text-zinc-500 mr-1">r/</span>
                            <Input
                              value={sub.name.replace(/^r\//, '')}
                              onChange={(e) =>
                                updateSubreddit(idx, { name: `r/${e.target.value}` })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Risk Level</Label>
                          <Select
                            value={sub.risk_level}
                            onValueChange={(value: 'low' | 'medium' | 'high') =>
                              updateSubreddit(idx, { risk_level: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Max Posts/Week</Label>
                          <Input
                            type="number"
                            min={1}
                            max={5}
                            value={sub.max_posts_per_week}
                            onChange={(e) =>
                              updateSubreddit(idx, {
                                max_posts_per_week: parseInt(e.target.value) || 1,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <Label>Subreddit Rules</Label>
                        <Textarea
                          value={sub.rules_text ?? ''}
                          onChange={(e) => updateSubreddit(idx, { rules_text: e.target.value })}
                          placeholder="Paste relevant subreddit rules here"
                          rows={3}
                        />
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => deleteSubreddit(idx)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Topics */}
          <TabsContent value="topics" className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Topic Seeds</h3>
                <p className="text-sm text-zinc-500">
                  Ideas and queries to generate content around
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={generateTopicSuggestions}>
                  <Target className="mr-2 h-4 w-4" />
                  <Sparkles className="mr-2 h-4 w-4 text-orange-500" />
                  AI Generate
                </Button>
                <Button onClick={addTopicSeed}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Topic
                </Button>
              </div>
            </div>

            {topicSeeds.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Target className="h-12 w-12 text-zinc-400 mb-4" />
                  <p className="text-zinc-500 mb-4">No topic seeds yet. Add one to get started.</p>
                  <Button variant="outline" onClick={generateTopicSuggestions}>
                    <Sparkles className="mr-2 h-4 w-4 text-orange-500" />
                    Generate with AI
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {topicSeeds.map((seed, idx) => (
                  <Card key={seed.id ?? idx}>
                    <CardContent className="pt-6">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select
                            value={seed.seed_type}
                            onValueChange={(value: TopicSeed['seed_type']) =>
                              updateTopicSeed(idx, { seed_type: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="target_query">Target Query</SelectItem>
                              <SelectItem value="pain_point">Pain Point</SelectItem>
                              <SelectItem value="competitor">Competitor</SelectItem>
                              <SelectItem value="faq">FAQ</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Priority: {seed.priority}</Label>
                          <Slider
                            value={[seed.priority]}
                            onValueChange={([value]) => updateTopicSeed(idx, { priority: value })}
                            max={10}
                            step={1}
                          />
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <Label>Content</Label>
                        <Textarea
                          value={seed.text}
                          onChange={(e) => updateTopicSeed(idx, { text: e.target.value })}
                          placeholder="Enter the topic, question, or content idea"
                        />
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => deleteTopicSeed(idx)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Settings */}
          <TabsContent value="settings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Generation Settings</CardTitle>
                <CardDescription>
                  Configure how content is generated for this project
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Posts per Week: {project.posts_per_week}</Label>
                  <Slider
                    value={[project.posts_per_week]}
                    onValueChange={([value]) => updateProject({ posts_per_week: value })}
                    max={20}
                    min={1}
                    step={1}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Risk Tolerance</Label>
                  <Select
                    value={project.risk_tolerance}
                    onValueChange={(value: 'low' | 'medium' | 'high') =>
                      updateProject({ risk_tolerance: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low - Conservative posting</SelectItem>
                      <SelectItem value="medium">Medium - Balanced approach</SelectItem>
                      <SelectItem value="high">High - More aggressive</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-zinc-500">
                    Affects how posts are distributed across high-risk subreddits
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Navigation */}
        <div className="flex justify-between items-center pt-6 border-t">
          <SaveIndicator status={saveStatus} />
          <Button onClick={() => router.push(`/projects/${projectId}/calendar`)}>
            Go to Calendar
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Suggestion Modals */}
      <SuggestionsModal
        isOpen={showPersonaModal}
        onClose={() => setShowPersonaModal(false)}
        title="AI-Generated Personas"
        description="Select the personas you want to add to your project"
        suggestions={personaSuggestions}
        isLoading={isLoadingPersonas}
        error={aiError}
        getItemId={(p) => p.name}
        renderItem={(persona) => <PersonaItem persona={persona} />}
        onAccept={acceptPersonaSuggestions}
        onReplace={replacePersonaSuggestions}
      />

      <SuggestionsModal
        isOpen={showSubredditModal}
        onClose={() => setShowSubredditModal(false)}
        title="AI-Discovered Subreddits"
        description="Select the subreddits you want to target"
        suggestions={subredditSuggestions}
        isLoading={isLoadingSubreddits}
        error={aiError}
        getItemId={(s) => s.name}
        renderItem={(subreddit) => <SubredditItem subreddit={subreddit} />}
        onAccept={acceptSubredditSuggestions}
        onReplace={replaceSubredditSuggestions}
      />

      <SuggestionsModal
        isOpen={showTopicModal}
        onClose={() => setShowTopicModal(false)}
        title="AI-Generated Topics"
        description="Select the topic seeds you want to add"
        suggestions={topicSuggestions}
        isLoading={isLoadingTopics}
        error={aiError}
        getItemId={(t) => t.value}
        renderItem={(topic) => <TopicItem topic={topic} />}
        onAccept={acceptTopicSuggestions}
        onReplace={replaceTopicSuggestions}
      />

      {/* Chat Widget */}
      <ChatWidget
        projectId={projectId}
        companyInfo={project.company_profile_json}
        personas={personas}
        subreddits={subreddits}
        topicSeeds={topicSeeds}
        onRefresh={handleChatRefresh}
      />
    </AppShell>
  );
}
