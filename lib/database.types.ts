// This file defines the database types for Supabase
// These types should be kept in sync with the SQL schema

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrgRole = 'admin' | 'operator' | 'assistant' | 'viewer';
export type WeekStatus = 'draft' | 'approved' | 'scheduled' | 'published';
export type ItemStatus = 'draft' | 'needs_review' | 'approved' | 'scheduled' | 'posted' | 'failed';
export type AssetType = 'post' | 'comment' | 'followup';
export type AssetStatus = 'draft' | 'active' | 'archived';
export type RunType = 'week_gen' | 'regen_item';
export type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type JobType = 'generate_week' | 'generate_item' | 'publish_item' | 'ingest_metrics';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type RiskLevel = 'low' | 'medium' | 'high';
export type TopicSeedType = 'target_query' | 'pain_point' | 'competitor' | 'faq';
export type QualityRater = 'heuristic' | 'llm' | 'human';

export type Database = {
  public: {
    Tables: {
      orgs: {
        Row: {
          id: string;
          name: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      org_invitations: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: OrgRole;
          invited_by: string;
          token: string;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          role?: OrgRole;
          invited_by: string;
          token?: string;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          email?: string;
          role?: OrgRole;
          invited_by?: string;
          token?: string;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_invitations_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      org_members: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          role: OrgRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          role?: OrgRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          user_id?: string;
          role?: OrgRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_members_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          company_profile_json: Json;
          brand_voice_json: Json;
          posts_per_week: number;
          risk_tolerance: RiskLevel;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          company_profile_json?: Json;
          brand_voice_json?: Json;
          posts_per_week?: number;
          risk_tolerance?: RiskLevel;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          company_profile_json?: Json;
          brand_voice_json?: Json;
          posts_per_week?: number;
          risk_tolerance?: RiskLevel;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projects_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      personas: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          bio: string | null;
          tone: string | null;
          expertise_tags: string[];
          writing_rules_json: Json;
          disclosure_rules_json: Json;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          bio?: string | null;
          tone?: string | null;
          expertise_tags?: string[];
          writing_rules_json?: Json;
          disclosure_rules_json?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          bio?: string | null;
          tone?: string | null;
          expertise_tags?: string[];
          writing_rules_json?: Json;
          disclosure_rules_json?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'personas_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      subreddits: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          allowed_post_types_json: Json;
          rules_text: string | null;
          risk_level: RiskLevel;
          max_posts_per_week: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          allowed_post_types_json?: Json;
          rules_text?: string | null;
          risk_level?: RiskLevel;
          max_posts_per_week?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          allowed_post_types_json?: Json;
          rules_text?: string | null;
          risk_level?: RiskLevel;
          max_posts_per_week?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subreddits_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      topic_seeds: {
        Row: {
          id: string;
          project_id: string;
          seed_type: TopicSeedType;
          text: string;
          tags: string[];
          priority: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          seed_type: TopicSeedType;
          text: string;
          tags?: string[];
          priority?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          seed_type?: TopicSeedType;
          text?: string;
          tags?: string[];
          priority?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'topic_seeds_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_weeks: {
        Row: {
          id: string;
          project_id: string;
          week_start_date: string;
          status: WeekStatus;
          generation_run_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          week_start_date: string;
          status?: WeekStatus;
          generation_run_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          week_start_date?: string;
          status?: WeekStatus;
          generation_run_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_weeks_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_items: {
        Row: {
          id: string;
          calendar_week_id: string;
          scheduled_at: string;
          subreddit_id: string;
          primary_persona_id: string;
          status: ItemStatus;
          topic_cluster_key: string | null;
          risk_flags_json: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          calendar_week_id: string;
          scheduled_at: string;
          subreddit_id: string;
          primary_persona_id: string;
          status?: ItemStatus;
          topic_cluster_key?: string | null;
          risk_flags_json?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          calendar_week_id?: string;
          scheduled_at?: string;
          subreddit_id?: string;
          primary_persona_id?: string;
          status?: ItemStatus;
          topic_cluster_key?: string | null;
          risk_flags_json?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_items_week_id_fkey';
            columns: ['calendar_week_id'];
            isOneToOne: false;
            referencedRelation: 'calendar_weeks';
            referencedColumns: ['id'];
          },
        ];
      };
      content_assets: {
        Row: {
          id: string;
          calendar_item_id: string;
          asset_type: AssetType;
          author_persona_id: string;
          title: string | null;
          body_md: string;
          metadata_json: Json;
          version: number;
          status: AssetStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          calendar_item_id: string;
          asset_type: AssetType;
          author_persona_id: string;
          title?: string | null;
          body_md: string;
          metadata_json?: Json;
          version?: number;
          status?: AssetStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          calendar_item_id?: string;
          asset_type?: AssetType;
          author_persona_id?: string;
          title?: string | null;
          body_md?: string;
          metadata_json?: Json;
          version?: number;
          status?: AssetStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'content_assets_item_id_fkey';
            columns: ['calendar_item_id'];
            isOneToOne: false;
            referencedRelation: 'calendar_items';
            referencedColumns: ['id'];
          },
        ];
      };
      generation_runs: {
        Row: {
          id: string;
          project_id: string;
          run_type: RunType;
          inputs_json: Json;
          model_config_json: Json;
          status: RunStatus;
          started_at: string | null;
          finished_at: string | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          run_type: RunType;
          inputs_json?: Json;
          model_config_json?: Json;
          status?: RunStatus;
          started_at?: string | null;
          finished_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          run_type?: RunType;
          inputs_json?: Json;
          model_config_json?: Json;
          status?: RunStatus;
          started_at?: string | null;
          finished_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'generation_runs_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      quality_scores: {
        Row: {
          id: string;
          asset_id: string;
          dimensions_json: Json;
          overall_score: number;
          rater: QualityRater;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          asset_id: string;
          dimensions_json?: Json;
          overall_score: number;
          rater?: QualityRater;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          asset_id?: string;
          dimensions_json?: Json;
          overall_score?: number;
          rater?: QualityRater;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quality_scores_asset_id_fkey';
            columns: ['asset_id'];
            isOneToOne: false;
            referencedRelation: 'content_assets';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          org_id: string;
          project_id: string | null;
          actor_user_id: string;
          action: string;
          entity_type: string;
          entity_id: string;
          diff_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          project_id?: string | null;
          actor_user_id: string;
          action: string;
          entity_type: string;
          entity_id: string;
          diff_json?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          project_id?: string | null;
          actor_user_id?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          diff_json?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      jobs: {
        Row: {
          id: string;
          org_id: string;
          project_id: string;
          job_type: JobType;
          payload_json: Json;
          status: JobStatus;
          run_at: string;
          attempts: number;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          project_id: string;
          job_type: JobType;
          payload_json?: Json;
          status?: JobStatus;
          run_at?: string;
          attempts?: number;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          project_id?: string;
          job_type?: JobType;
          payload_json?: Json;
          status?: JobStatus;
          run_at?: string;
          attempts?: number;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'jobs_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_org_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      get_user_role_in_org: {
        Args: {
          target_org_id: string;
        };
        Returns: OrgRole;
      };
      user_has_org_access: {
        Args: {
          target_org_id: string;
        };
        Returns: boolean;
      };
      user_can_write_org: {
        Args: {
          target_org_id: string;
        };
        Returns: boolean;
      };
      user_is_org_admin: {
        Args: {
          target_org_id: string;
        };
        Returns: boolean;
      };
      claim_next_job: {
        Args: {
          worker_id: string;
          lock_timeout_ms?: number;
        };
        Returns: Database['public']['Tables']['jobs']['Row'][];
      };
      cleanup_stale_job_locks: {
        Args: {
          lock_timeout_ms?: number;
        };
        Returns: number;
      };
      create_org_with_owner: {
        Args: {
          org_name: string;
        };
        Returns: { org_id: string; member_id: string }[];
      };
      accept_org_invitation: {
        Args: {
          invite_token: string;
        };
        Returns: { org_id: string; member_id: string }[];
      };
    };
    Enums: {
      org_role: OrgRole;
      week_status: WeekStatus;
      item_status: ItemStatus;
      asset_type: AssetType;
      asset_status: AssetStatus;
      run_type: RunType;
      run_status: RunStatus;
      job_type: JobType;
      job_status: JobStatus;
      risk_level: RiskLevel;
      topic_seed_type: TopicSeedType;
      quality_rater: QualityRater;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// Helper types for use throughout the app
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
