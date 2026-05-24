export type ResourceType = "Roleplay" | "Exam";

export type SupabaseResourceType = "roleplay" | "exam" | "reference" | "unknown";
export type ResourceApprovalStatus = "approved" | "pending" | "rejected" | string;
export type ProfileRole = "student" | "admin";

export type Profile = {
  id: string;
  email: string | null;
  role: ProfileRole;
  created_at: string | null;
};

export type Difficulty = "Intro" | "Standard" | "Advanced";

export type ResourceListItem = {
  id: string;
  title: string;
  created_at?: string | null;
  cluster: string | null;
  event_name: string | null;
  instructional_area: string | null;
  year: number | null;
  resource_type: SupabaseResourceType;
  approval_status: ResourceApprovalStatus | null;
  original_filename: string | null;
  performance_indicators: string[] | null;
  confidence_score: number | null;
  import_notes: string | null;
  file_path: string | null;
  storage_path: string | null;
};

export type ResourceMetadataUpdate = Pick<
  ResourceListItem,
  | "cluster"
  | "event_name"
  | "instructional_area"
  | "performance_indicators"
  | "resource_type"
  | "title"
  | "year"
>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          email?: string | null;
          role?: ProfileRole;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string | null;
          role?: ProfileRole;
          created_at?: string | null;
        };
        Relationships: [];
      };
      resources: {
        Row: ResourceListItem;
        Insert: Partial<ResourceListItem>;
        Update: Partial<ResourceListItem>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ensure_current_profile: {
        Args: Record<PropertyKey, never>;
        Returns: Profile;
      };
    };
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
