export interface Subject {
  id: number;
  code: string;
  display_name: string;
  label: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface Interaction {
  id: number;
  subject_id: number;
  speaker: "elder" | "ai" | "system";
  kind: string;
  status: string;
  transcript: string | null;
  redaction_hit: boolean;
  created_at: string | null;
  updated_at: string | null;
  audio_url: string | null;
  source_interaction_id: number | null;
}

export interface AssetSnapshot {
  id: number;
  subject_id: number;
  source_interaction_id: number | null;
  payload_json: {
    family_code?: {
      fact_layer?: {
        time_period?: string;
        key_events?: string[];
        traditional_skills?: string[];
      };
      attribution_layer?: {
        historical_context?: string;
        core_emotions?: string[];
        driving_motivation?: string;
      };
      wisdom_layer?: {
        family_motto?: string;
        heritage_value?: string;
      };
    };
  };
  created_at: string | null;
}

export interface Metrics {
  mlu: number;
  ttr: number;
  total_words: number;
  unique_words: number;
  transcript_count: number;
  total_characters: number;
}

export interface ActivityPoint {
  interaction_id: number;
  timestamp: string;
  label: string;
  characters: number;
}
