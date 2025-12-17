'use client';

import { useState, useEffect, use } from 'react';
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
  Save,
  Loader2,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';

interface ProjectData {
  id: string;
  name: string;
  company_profile_json: {
    name?: string;
    description?: string;
    website?: string;
    industry?: string;
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

export default function SetupPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Data states
  const [project, setProject] = useState<ProjectData | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [topicSeeds, setTopicSeeds] = useState<TopicSeed[]>([]);

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

  // Save project
  const saveProject = async () => {
    if (!project) return;
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from('projects')
      .update({
        company_profile_json: project.company_profile_json,
        brand_voice_json: project.brand_voice_json,
        posts_per_week: project.posts_per_week,
        risk_tolerance: project.risk_tolerance,
      })
      .eq('id', projectId);

    setSaving(false);
    if (error) {
      toast.error('Failed to save project');
    } else {
      toast.success('Project saved');
    }
  };

  // Add persona
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

    const { data, error } = await supabase
      .from('personas')
      .insert({ ...newPersona, project_id: projectId })
      .select()
      .single();

    if (!error && data) {
      setPersonas([...personas, data as unknown as Persona]);
      toast.success('Persona added');
    }
  };

  // Add subreddit
  const addSubreddit = async () => {
    const supabase = createClient();
    const newSubreddit: Subreddit = {
      name: 'NewSubreddit',
      rules_text: '',
      risk_level: 'medium',
      max_posts_per_week: 1,
    };

    const { data, error } = await supabase
      .from('subreddits')
      .insert({ ...newSubreddit, project_id: projectId })
      .select()
      .single();

    if (!error && data) {
      setSubreddits([...subreddits, data as unknown as Subreddit]);
      toast.success('Subreddit added');
    }
  };

  // Add topic seed
  const addTopicSeed = async () => {
    const supabase = createClient();
    const newSeed: TopicSeed = {
      seed_type: 'target_query',
      text: '',
      tags: [],
      priority: 0,
      active: true,
    };

    const { data, error } = await supabase
      .from('topic_seeds')
      .insert({ ...newSeed, project_id: projectId })
      .select()
      .single();

    if (!error && data) {
      setTopicSeeds([...topicSeeds, data as unknown as TopicSeed]);
      toast.success('Topic seed added');
    }
  };

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
                <CardTitle>Company Profile</CardTitle>
                <CardDescription>
                  Information about your company that helps generate authentic content
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      value={project.company_profile_json?.name ?? ''}
                      onChange={(e) =>
                        setProject({
                          ...project,
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
                      value={project.company_profile_json?.website ?? ''}
                      onChange={(e) =>
                        setProject({
                          ...project,
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
                      setProject({
                        ...project,
                        company_profile_json: {
                          ...project.company_profile_json,
                          description: e.target.value,
                        },
                      })
                    }
                    placeholder="What does your company do? What problems do you solve?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    value={project.company_profile_json?.industry ?? ''}
                    onChange={(e) =>
                      setProject({
                        ...project,
                        company_profile_json: {
                          ...project.company_profile_json,
                          industry: e.target.value,
                        },
                      })
                    }
                    placeholder="e.g., SaaS, E-commerce, Healthcare"
                  />
                </div>
                <Button onClick={saveProject} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
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
              <Button onClick={addPersona}>
                <Plus className="mr-2 h-4 w-4" />
                Add Persona
              </Button>
            </div>

            {personas.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-zinc-400 mb-4" />
                  <p className="text-zinc-500">No personas yet. Add one to get started.</p>
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
                            onChange={(e) => {
                              const updated = [...personas];
                              updated[idx] = { ...persona, name: e.target.value };
                              setPersonas(updated);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tone</Label>
                          <Select
                            value={persona.tone}
                            onValueChange={(value) => {
                              const updated = [...personas];
                              updated[idx] = { ...persona, tone: value };
                              setPersonas(updated);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="casual">Casual</SelectItem>
                              <SelectItem value="professional">Professional</SelectItem>
                              <SelectItem value="friendly">Friendly</SelectItem>
                              <SelectItem value="technical">Technical</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <Label>Bio</Label>
                        <Textarea
                          value={persona.bio ?? ''}
                          onChange={(e) => {
                            const updated = [...personas];
                            updated[idx] = { ...persona, bio: e.target.value };
                            setPersonas(updated);
                          }}
                          placeholder="Background and expertise of this persona"
                        />
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={persona.disclosure_rules_json?.required ?? false}
                            onCheckedChange={(checked) => {
                              const updated = [...personas];
                              updated[idx] = {
                                ...persona,
                                disclosure_rules_json: { required: checked },
                              };
                              setPersonas(updated);
                            }}
                          />
                          <Label>Require disclosure</Label>
                        </div>
                        <Badge variant={persona.active ? 'default' : 'secondary'}>
                          {persona.active ? 'Active' : 'Inactive'}
                        </Badge>
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
              <Button onClick={addSubreddit}>
                <Plus className="mr-2 h-4 w-4" />
                Add Subreddit
              </Button>
            </div>

            {subreddits.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Hash className="h-12 w-12 text-zinc-400 mb-4" />
                  <p className="text-zinc-500">No subreddits yet. Add one to get started.</p>
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
                              value={sub.name}
                              onChange={(e) => {
                                const updated = [...subreddits];
                                updated[idx] = { ...sub, name: e.target.value };
                                setSubreddits(updated);
                              }}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Risk Level</Label>
                          <Select
                            value={sub.risk_level}
                            onValueChange={(value: 'low' | 'medium' | 'high') => {
                              const updated = [...subreddits];
                              updated[idx] = { ...sub, risk_level: value };
                              setSubreddits(updated);
                            }}
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
                            onChange={(e) => {
                              const updated = [...subreddits];
                              updated[idx] = {
                                ...sub,
                                max_posts_per_week: parseInt(e.target.value) || 1,
                              };
                              setSubreddits(updated);
                            }}
                          />
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <Label>Subreddit Rules</Label>
                        <Textarea
                          value={sub.rules_text ?? ''}
                          onChange={(e) => {
                            const updated = [...subreddits];
                            updated[idx] = { ...sub, rules_text: e.target.value };
                            setSubreddits(updated);
                          }}
                          placeholder="Paste relevant subreddit rules here"
                          rows={3}
                        />
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
              <Button onClick={addTopicSeed}>
                <Plus className="mr-2 h-4 w-4" />
                Add Topic
              </Button>
            </div>

            {topicSeeds.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Target className="h-12 w-12 text-zinc-400 mb-4" />
                  <p className="text-zinc-500">No topic seeds yet. Add one to get started.</p>
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
                            onValueChange={(value: TopicSeed['seed_type']) => {
                              const updated = [...topicSeeds];
                              updated[idx] = { ...seed, seed_type: value };
                              setTopicSeeds(updated);
                            }}
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
                          <Label>Priority</Label>
                          <Slider
                            value={[seed.priority]}
                            onValueChange={([value]) => {
                              const updated = [...topicSeeds];
                              updated[idx] = { ...seed, priority: value };
                              setTopicSeeds(updated);
                            }}
                            max={10}
                            step={1}
                          />
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <Label>Content</Label>
                        <Textarea
                          value={seed.text}
                          onChange={(e) => {
                            const updated = [...topicSeeds];
                            updated[idx] = { ...seed, text: e.target.value };
                            setTopicSeeds(updated);
                          }}
                          placeholder="Enter the topic, question, or content idea"
                        />
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
                  <Label>Posts per Week</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[project.posts_per_week]}
                      onValueChange={([value]) => setProject({ ...project, posts_per_week: value })}
                      max={20}
                      min={1}
                      step={1}
                      className="flex-1"
                    />
                    <span className="w-12 text-right font-medium">{project.posts_per_week}</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Risk Tolerance</Label>
                  <Select
                    value={project.risk_tolerance}
                    onValueChange={(value: 'low' | 'medium' | 'high') =>
                      setProject({ ...project, risk_tolerance: value })
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

                <Button onClick={saveProject} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Navigation */}
        <div className="flex justify-between pt-6 border-t">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-sm text-zinc-500">Changes are saved automatically</span>
          </div>
          <Button onClick={() => router.push(`/projects/${projectId}/calendar`)}>
            Go to Calendar
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
