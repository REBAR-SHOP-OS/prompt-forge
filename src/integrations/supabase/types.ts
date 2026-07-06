export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_api_request_logs: {
        Row: {
          created_at: string
          error_code: string | null
          estimated_cost: number
          id: string
          latency_ms: number | null
          method: string
          model_key: string | null
          provider_key: string | null
          request_id: string
          route: string
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          estimated_cost?: number
          id?: string
          latency_ms?: number | null
          method: string
          model_key?: string | null
          provider_key?: string | null
          request_id: string
          route: string
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          estimated_cost?: number
          id?: string
          latency_ms?: number | null
          method?: string
          model_key?: string | null
          provider_key?: string | null
          request_id?: string
          route?: string
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_api_request_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "core_user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          request_id: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          request_id?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          request_id?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "core_user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          job_id: string | null
          type: Database["public"]["Enums"]["credit_tx_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string | null
          type: Database["public"]["Enums"]["credit_tx_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string | null
          type?: Database["public"]["Enums"]["credit_tx_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_credit_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "generator_generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_credit_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "core_user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_user_quotas: {
        Row: {
          created_at: string
          daily_limit_credits: number
          last_reset_day: string
          last_reset_month: string
          monthly_limit_credits: number
          updated_at: string
          used_this_month: number
          used_today: number
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_limit_credits?: number
          last_reset_day?: string
          last_reset_month?: string
          monthly_limit_credits?: number
          updated_at?: string
          used_this_month?: number
          used_today?: number
          user_id: string
        }
        Update: {
          created_at?: string
          daily_limit_credits?: number
          last_reset_day?: string
          last_reset_month?: string
          monthly_limit_credits?: number
          updated_at?: string
          used_this_month?: number
          used_today?: number
          user_id?: string
        }
        Relationships: []
      }
      core_ai_provider_registry: {
        Row: {
          base_url: string | null
          created_at: string
          default_model: string
          display_name: string
          enabled: boolean
          provider_key: string
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          default_model: string
          display_name: string
          enabled?: boolean
          provider_key: string
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          default_model?: string
          display_name?: string
          enabled?: boolean
          provider_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      core_user_profiles: {
        Row: {
          created_at: string
          credits_balance: number
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_balance?: number
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_balance?: number
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      generator_business_profiles: {
        Row: {
          business_info: string
          contact_address: string | null
          contact_logo_url: string | null
          contact_phone: string | null
          contact_website: string | null
          narration_instructions: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          business_info: string
          contact_address?: string | null
          contact_logo_url?: string | null
          contact_phone?: string | null
          contact_website?: string | null
          narration_instructions?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          business_info?: string
          contact_address?: string | null
          contact_logo_url?: string | null
          contact_phone?: string | null
          contact_website?: string | null
          narration_instructions?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generator_clip_overlays: {
        Row: {
          bg_color: string | null
          clip_id: string
          clip_kind: string
          color: string | null
          created_at: string
          deleted_at: string | null
          font_family: string | null
          font_weight: number | null
          id: string
          image_path: string | null
          image_url: string | null
          kind: string
          rotation: number
          scale: number
          text_align: string | null
          text_value: string | null
          updated_at: string
          user_id: string
          x: number
          y: number
          z_index: number
        }
        Insert: {
          bg_color?: string | null
          clip_id: string
          clip_kind: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          font_family?: string | null
          font_weight?: number | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          kind: string
          rotation?: number
          scale?: number
          text_align?: string | null
          text_value?: string | null
          updated_at?: string
          user_id: string
          x?: number
          y?: number
          z_index?: number
        }
        Update: {
          bg_color?: string | null
          clip_id?: string
          clip_kind?: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          font_family?: string | null
          font_weight?: number | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          kind?: string
          rotation?: number
          scale?: number
          text_align?: string | null
          text_value?: string | null
          updated_at?: string
          user_id?: string
          x?: number
          y?: number
          z_index?: number
        }
        Relationships: []
      }
      generator_copyright_reviews: {
        Row: {
          created_at: string
          id: string
          job_id: string
          music_status: string | null
          result: Json
          summary: string | null
          updated_at: string
          user_id: string
          verdict: string
          video_status: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          music_status?: string | null
          result?: Json
          summary?: string | null
          updated_at?: string
          user_id: string
          verdict: string
          video_status?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          music_status?: string | null
          result?: Json
          summary?: string | null
          updated_at?: string
          user_id?: string
          verdict?: string
          video_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generator_copyright_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "core_user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      generator_film_exports: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          mp4_storage_path: string | null
          source_asset_id: string
          source_storage_path: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          mp4_storage_path?: string | null
          source_asset_id: string
          source_storage_path: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          mp4_storage_path?: string | null
          source_asset_id?: string
          source_storage_path?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generator_generation_jobs: {
        Row: {
          client_request_id: string | null
          created_at: string
          deleted_at: string | null
          draft_group_id: string | null
          first_frame_url: string | null
          id: string
          input_prompt: string
          last_frame_url: string | null
          model_key: string | null
          narration_text: string | null
          negative_prompt: string | null
          parent_final_job_id: string | null
          provider_job_id: string | null
          provider_key: string | null
          provider_start_attempts: number
          provider_start_claimed_at: string | null
          provider_start_last_error: string | null
          reference_image_urls: string[] | null
          requested_aspect_ratio: string | null
          requested_duration: number | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          deleted_at?: string | null
          draft_group_id?: string | null
          first_frame_url?: string | null
          id?: string
          input_prompt: string
          last_frame_url?: string | null
          model_key?: string | null
          narration_text?: string | null
          negative_prompt?: string | null
          parent_final_job_id?: string | null
          provider_job_id?: string | null
          provider_key?: string | null
          provider_start_attempts?: number
          provider_start_claimed_at?: string | null
          provider_start_last_error?: string | null
          reference_image_urls?: string[] | null
          requested_aspect_ratio?: string | null
          requested_duration?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          deleted_at?: string | null
          draft_group_id?: string | null
          first_frame_url?: string | null
          id?: string
          input_prompt?: string
          last_frame_url?: string | null
          model_key?: string | null
          narration_text?: string | null
          negative_prompt?: string | null
          parent_final_job_id?: string | null
          provider_job_id?: string | null
          provider_key?: string | null
          provider_start_attempts?: number
          provider_start_claimed_at?: string | null
          provider_start_last_error?: string | null
          reference_image_urls?: string[] | null
          requested_aspect_ratio?: string | null
          requested_duration?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generator_generation_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "core_user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      generator_library_state: {
        Row: {
          created_at: string
          state: Json
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          state?: Json
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          state?: Json
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      generator_user_audio: {
        Row: {
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          id: string
          kind: string
          mime_type: string | null
          name: string | null
          size_bytes: number | null
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          id?: string
          kind: string
          mime_type?: string | null
          name?: string | null
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          name?: string | null
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generator_user_images: {
        Row: {
          category: string
          created_at: string
          deleted_at: string | null
          description: string | null
          draft_group_id: string | null
          height: number | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          still_duration_seconds: number
          storage_path: string
          title: string | null
          updated_at: string
          user_id: string
          width: number | null
        }
        Insert: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          draft_group_id?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          still_duration_seconds?: number
          storage_path: string
          title?: string | null
          updated_at?: string
          user_id: string
          width?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          draft_group_id?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          still_duration_seconds?: number
          storage_path?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      generator_video_assets: {
        Row: {
          aspect_ratio: string | null
          created_at: string
          deleted_at: string | null
          duration: number | null
          id: string
          job_id: string
          storage_path: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string
          deleted_at?: string | null
          duration?: number | null
          id?: string
          job_id: string
          storage_path: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string
          deleted_at?: string | null
          duration?: number | null
          id?: string
          job_id?: string
          storage_path?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generator_video_assets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "generator_generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generator_video_assets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "core_user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mp4_export_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          output_path: string | null
          source_bucket: string
          source_path: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          output_path?: string | null
          source_bucket: string
          source_path: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          output_path?: string | null
          source_bucket?: string
          source_path?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      storage_objects: {
        Row: {
          backend: string
          content_type: string | null
          created_at: string
          id: string
          logical_bucket: string
          nas_path: string | null
          object_key: string
          size_bytes: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          backend?: string
          content_type?: string | null
          created_at?: string
          id?: string
          logical_bucket: string
          nas_path?: string | null
          object_key: string
          size_bytes?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          backend?: string
          content_type?: string | null
          created_at?: string
          id?: string
          logical_bucket?: string
          nas_path?: string | null
          object_key?: string
          size_bytes?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_cost_summary: { Args: never; Returns: Json }
      admin_set_user_quota: {
        Args: { _daily: number; _monthly: number; _user_id: string }
        Returns: undefined
      }
      generator_claim_provider_start: {
        Args: {
          _job_id: string
          _stale_after_seconds?: number
          _user_id: string
        }
        Returns: boolean
      }
      generator_complete_job: {
        Args: {
          _aspect_ratio: string
          _duration: number
          _job_id: string
          _storage_path: string
          _thumbnail_url: string
          _user_id: string
        }
        Returns: string
      }
      generator_delete_job: {
        Args: { _job_id: string; _user_id: string }
        Returns: {
          storage_path: string
        }[]
      }
      generator_delete_user_image: {
        Args: { _image_id: string; _user_id: string }
        Returns: string
      }
      generator_fail_job: {
        Args: {
          _job_id: string
          _reason?: string
          _refund?: boolean
          _user_id: string
        }
        Returns: undefined
      }
      generator_finalize_film: {
        Args: {
          _aspect_ratio: string
          _clip_count: number
          _duration: number
          _source_job_ids: string[]
          _storage_path: string
          _user_id: string
        }
        Returns: string
      }
      generator_mark_job_processing: {
        Args: { _job_id: string; _provider_job_id: string; _user_id: string }
        Returns: undefined
      }
      generator_record_provider_start_error: {
        Args: { _job_id: string; _reason: string; _user_id: string }
        Returns: undefined
      }
      generator_set_draft_group: {
        Args: {
          _group_id: string
          _image_ids: string[]
          _job_ids: string[]
          _user_id: string
        }
        Returns: undefined
      }
      generator_start_job: {
        Args: {
          _cost: number
          _model_key: string
          _prompt: string
          _provider_key: string
          _user_id: string
        }
        Returns: string
      }
      generator_start_job_v2: {
        Args: {
          _client_request_id?: string
          _cost: number
          _draft_group_id?: string
          _first_frame_url?: string
          _last_frame_url?: string
          _model_key: string
          _narration_text?: string
          _prompt: string
          _provider_key: string
          _reference_image_urls?: string[]
          _requested_aspect_ratio?: string
          _requested_duration?: number
          _user_id: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "user" | "admin"
      credit_tx_type: "grant" | "spend" | "refund" | "adjustment"
      job_status:
        | "pending"
        | "queued"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "admin"],
      credit_tx_type: ["grant", "spend", "refund", "adjustment"],
      job_status: [
        "pending",
        "queued",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
    },
  },
} as const
