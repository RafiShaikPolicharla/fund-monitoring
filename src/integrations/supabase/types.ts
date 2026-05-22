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
      alerts: {
        Row: {
          advisor_message: string
          classification_reason: string | null
          edited_advisor_message: string | null
          event_id: string | null
          generated_at: string | null
          id: string
          ir_action: string
          ir_summary: string
          llm_model: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewer_name: string | null
          status: string | null
          tier: number
          time_pressure: string | null
        }
        Insert: {
          advisor_message: string
          classification_reason?: string | null
          edited_advisor_message?: string | null
          event_id?: string | null
          generated_at?: string | null
          id?: string
          ir_action: string
          ir_summary: string
          llm_model?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewer_name?: string | null
          status?: string | null
          tier: number
          time_pressure?: string | null
        }
        Update: {
          advisor_message?: string
          classification_reason?: string | null
          edited_advisor_message?: string | null
          event_id?: string | null
          generated_at?: string | null
          id?: string
          ir_action?: string
          ir_summary?: string
          llm_model?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewer_name?: string | null
          status?: string | null
          tier?: number
          time_pressure?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "v_alert_queue"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "v_event_feed"
            referencedColumns: ["event_id"]
          },
        ]
      }
      approved_publishers: {
        Row: {
          category: string | null
          id: string
          name: string
          notes: string | null
          trust_tier: number | null
        }
        Insert: {
          category?: string | null
          id?: string
          name: string
          notes?: string | null
          trust_tier?: number | null
        }
        Update: {
          category?: string | null
          id?: string
          name?: string
          notes?: string | null
          trust_tier?: number | null
        }
        Relationships: []
      }
      batch_runs: {
        Row: {
          alerts_produced: number
          alerts_suppressed: number
          candidate_events: number
          completed_at: string | null
          created_at: string | null
          id: string
          notes: string | null
          sources_scanned: number
          started_at: string
          status: string | null
          tier1_count: number | null
          tier2_count: number | null
          tier3_count: number | null
        }
        Insert: {
          alerts_produced: number
          alerts_suppressed: number
          candidate_events: number
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          sources_scanned: number
          started_at: string
          status?: string | null
          tier1_count?: number | null
          tier2_count?: number | null
          tier3_count?: number | null
        }
        Update: {
          alerts_produced?: number
          alerts_suppressed?: number
          candidate_events?: number
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          sources_scanned?: number
          started_at?: string
          status?: string | null
          tier1_count?: number | null
          tier2_count?: number | null
          tier3_count?: number | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          cost_usd: number | null
          created_at: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model_version: string | null
          output_tokens: number | null
          prompt_version: string | null
          raw_response: Json | null
          role: string
          session_id: string | null
          system_prompt: string | null
          user_prompt: string | null
        }
        Insert: {
          content: string
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_version?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          raw_response?: Json | null
          role: string
          session_id?: string | null
          system_prompt?: string | null
          user_prompt?: string | null
        }
        Update: {
          content?: string
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_version?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          raw_response?: Json | null
          role?: string
          session_id?: string | null
          system_prompt?: string | null
          user_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          id: string
          last_activity_at: string | null
          reviewer_name: string | null
          scope: string
          scope_context: Json | null
          started_at: string | null
        }
        Insert: {
          id?: string
          last_activity_at?: string | null
          reviewer_name?: string | null
          scope: string
          scope_context?: Json | null
          started_at?: string | null
        }
        Update: {
          id?: string
          last_activity_at?: string | null
          reviewer_name?: string | null
          scope?: string
          scope_context?: Json | null
          started_at?: string | null
        }
        Relationships: []
      }
      evaluation_results: {
        Row: {
          action_match_rate: number | null
          confusion_matrix: Json | null
          created_at: string | null
          disagreements: Json | null
          eval_run_date: string
          fund_universe: string
          human_override_rate: number | null
          id: string
          lookback_months: number
          notes: string | null
          tier1_precision: number | null
          tier1_recall: number | null
          tier3_precision: number | null
          total_events: number
        }
        Insert: {
          action_match_rate?: number | null
          confusion_matrix?: Json | null
          created_at?: string | null
          disagreements?: Json | null
          eval_run_date: string
          fund_universe: string
          human_override_rate?: number | null
          id?: string
          lookback_months: number
          notes?: string | null
          tier1_precision?: number | null
          tier1_recall?: number | null
          tier3_precision?: number | null
          total_events: number
        }
        Update: {
          action_match_rate?: number | null
          confusion_matrix?: Json | null
          created_at?: string | null
          disagreements?: Json | null
          eval_run_date?: string
          fund_universe?: string
          human_override_rate?: number | null
          id?: string
          lookback_months?: number
          notes?: string | null
          tier1_precision?: number | null
          tier1_recall?: number | null
          tier3_precision?: number | null
          total_events?: number
        }
        Relationships: []
      }
      events: {
        Row: {
          category: string
          confidence: number | null
          created_at: string | null
          event_date: string
          fund_id: string | null
          headline: string
          id: string
          manager_id: string | null
          raw_summary: string | null
          source_publisher: string | null
          source_url: string | null
          subtype: string | null
        }
        Insert: {
          category: string
          confidence?: number | null
          created_at?: string | null
          event_date: string
          fund_id?: string | null
          headline: string
          id?: string
          manager_id?: string | null
          raw_summary?: string | null
          source_publisher?: string | null
          source_url?: string | null
          subtype?: string | null
        }
        Update: {
          category?: string
          confidence?: number | null
          created_at?: string | null
          event_date?: string
          fund_id?: string | null
          headline?: string
          id?: string
          manager_id?: string | null
          raw_summary?: string | null
          source_publisher?: string | null
          source_url?: string | null
          subtype?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "v_alert_queue"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "events_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "v_event_feed"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "events_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          approved_list: boolean | null
          asset_class: string
          aum_usd_billions: number | null
          benchmark: string | null
          category: string | null
          created_at: string | null
          id: string
          manager_id: string | null
          name: string
          named_pms: string[] | null
          notes: string | null
          pilot: boolean | null
          ticker: string | null
        }
        Insert: {
          approved_list?: boolean | null
          asset_class: string
          aum_usd_billions?: number | null
          benchmark?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          manager_id?: string | null
          name: string
          named_pms?: string[] | null
          notes?: string | null
          pilot?: boolean | null
          ticker?: string | null
        }
        Update: {
          approved_list?: boolean | null
          asset_class?: string
          aum_usd_billions?: number | null
          benchmark?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          named_pms?: string[] | null
          notes?: string | null
          pilot?: boolean | null
          ticker?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funds_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      inference_log: {
        Row: {
          alert_id: string | null
          cost_usd: number | null
          created_at: string | null
          entity_check_passed: boolean | null
          event_id: string | null
          guardrails_triggered: string[] | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model_version: string
          output_tokens: number | null
          prompt_version: string
          raw_response: Json | null
          source_check_passed: boolean | null
          system_prompt: string | null
          user_prompt: string | null
        }
        Insert: {
          alert_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          entity_check_passed?: boolean | null
          event_id?: string | null
          guardrails_triggered?: string[] | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_version: string
          output_tokens?: number | null
          prompt_version: string
          raw_response?: Json | null
          source_check_passed?: boolean | null
          system_prompt?: string | null
          user_prompt?: string | null
        }
        Update: {
          alert_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          entity_check_passed?: boolean | null
          event_id?: string | null
          guardrails_triggered?: string[] | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_version?: string
          output_tokens?: number | null
          prompt_version?: string
          raw_response?: Json | null
          source_check_passed?: boolean | null
          system_prompt?: string | null
          user_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inference_log_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inference_log_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "v_alert_queue"
            referencedColumns: ["alert_id"]
          },
          {
            foreignKeyName: "inference_log_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "v_recently_actioned"
            referencedColumns: ["alert_id"]
          },
          {
            foreignKeyName: "inference_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inference_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_alert_queue"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "inference_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_event_feed"
            referencedColumns: ["event_id"]
          },
        ]
      }
      ir_actions: {
        Row: {
          action_date: string | null
          action_taken: string
          created_at: string | null
          documented_by: string | null
          event_id: string | null
          id: string
          outcome: string | null
        }
        Insert: {
          action_date?: string | null
          action_taken: string
          created_at?: string | null
          documented_by?: string | null
          event_id?: string | null
          id?: string
          outcome?: string | null
        }
        Update: {
          action_date?: string | null
          action_taken?: string
          created_at?: string | null
          documented_by?: string | null
          event_id?: string | null
          id?: string
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ir_actions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ir_actions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_alert_queue"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "ir_actions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_event_feed"
            referencedColumns: ["event_id"]
          },
        ]
      }
      managers: {
        Row: {
          created_at: string | null
          hq_city: string | null
          id: string
          name: string
          notes: string | null
          parent: string | null
        }
        Insert: {
          created_at?: string | null
          hq_city?: string | null
          id?: string
          name: string
          notes?: string | null
          parent?: string | null
        }
        Update: {
          created_at?: string | null
          hq_city?: string | null
          id?: string
          name?: string
          notes?: string | null
          parent?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_alert_queue: {
        Row: {
          advisor_message: string | null
          alert_id: string | null
          asset_class: string | null
          category: string | null
          classification_reason: string | null
          confidence: number | null
          event_date: string | null
          event_id: string | null
          fund_id: string | null
          fund_name: string | null
          headline: string | null
          ir_action: string | null
          ir_summary: string | null
          manager_name: string | null
          pilot: boolean | null
          raw_summary: string | null
          source_publisher: string | null
          status: string | null
          subtype: string | null
          ticker: string | null
          tier: number | null
          time_pressure: string | null
        }
        Relationships: []
      }
      v_event_feed: {
        Row: {
          advisor_message: string | null
          asset_class: string | null
          category: string | null
          classification_reason: string | null
          confidence: number | null
          event_date: string | null
          event_id: string | null
          fund_id: string | null
          fund_name: string | null
          headline: string | null
          ir_action: string | null
          ir_summary: string | null
          manager_name: string | null
          pilot: boolean | null
          raw_summary: string | null
          source_publisher: string | null
          source_url: string | null
          subtype: string | null
          ticker: string | null
          tier: number | null
          time_pressure: string | null
        }
        Relationships: []
      }
      v_recently_actioned: {
        Row: {
          alert_id: string | null
          edited_advisor_message: string | null
          event_date: string | null
          fund_name: string | null
          headline: string | null
          original_advisor_message: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewer_name: string | null
          status: string | null
          ticker: string | null
          tier: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
