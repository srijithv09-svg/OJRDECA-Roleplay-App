export type ResourceType = "Roleplay" | "Exam";

export type SupabaseResourceType = "roleplay" | "exam";

export type Difficulty = "Intro" | "Standard" | "Advanced";

export type ResourceListItem = {
  id: string;
  title: string;
  cluster: string | null;
  event_name: string | null;
  instructional_area: string | null;
  year: number | null;
  resource_type: SupabaseResourceType;
};

export type Database = {
  public: {
    Tables: {
      resources: {
        Row: ResourceListItem;
        Insert: Partial<ResourceListItem>;
        Update: Partial<ResourceListItem>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type RoleplayResource = {
  id: string;
  title: string;
  cluster: string;
  event: string;
  instructionalArea: string;
  performanceIndicator: string;
  difficulty: Difficulty;
  year: number;
  duration: string;
};

export type ExamResource = {
  id: string;
  title: string;
  cluster: string;
  year: number;
  questionCount: number;
  averageScore: string;
  status: "Approved" | "Review-ready";
};

export type EventItem = {
  title: string;
  date: string;
  type: string;
  daysAway: number;
};

export type ActivityItem = {
  action: string;
  detail: string;
  time: string;
};
