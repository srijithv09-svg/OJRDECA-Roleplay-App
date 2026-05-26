export type ResourceType = "Roleplay" | "Exam";

export type SupabaseResourceType = "roleplay" | "exam" | "reference" | "unknown";
export type ResourceApprovalStatus = "approved" | "pending" | "rejected" | string;
export type ProfileRole = "student" | "admin";
export type ExamCorrectAnswer = "A" | "B" | "C" | "D" | "E";
export type ExamSelectedAnswer = ExamCorrectAnswer | "UNANSWERED";
export type ExamKeyStatus = "no-key" | "partial" | "complete";

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
  performance_indicators_reviewed: boolean | null;
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
  | "performance_indicators_reviewed"
  | "resource_type"
  | "title"
  | "year"
>;

export type ExamAnswerKeyRow = {
  id: string;
  resource_id: string;
  question_number: number;
  correct_answer: ExamCorrectAnswer;
  instructional_area: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ExamAnswerKeyInput = {
  question_number: number;
  correct_answer: ExamCorrectAnswer;
  instructional_area: string | null;
};

export type ExamResourceWithKeyStatus = ResourceListItem & {
  answer_key_count: number;
  answer_key_status: ExamKeyStatus;
};

export type ExamAttempt = {
  id: string;
  user_id: string;
  resource_id: string;
  score: number | null;
  total_questions: number | null;
  percentage: number | null;
  completed_at: string | null;
};

export type ExamAttemptAnswer = {
  id: string;
  attempt_id: string;
  question_number: number;
  selected_answer: ExamSelectedAnswer;
  correct_answer: ExamCorrectAnswer;
  is_correct: boolean;
  instructional_area: string | null;
};

export type InstructionalAreaBreakdown = {
  instructional_area: string;
  correct_count: number;
  total_count: number;
  percentage: number;
};

export type ExamAttemptResult = {
  attempt: ExamAttempt;
  resource: PublicExamResource;
  answers: ExamAttemptAnswer[];
  breakdown: InstructionalAreaBreakdown[];
};

export type PublicExamResource = Pick<
  ResourceListItem,
  "cluster" | "event_name" | "id" | "original_filename" | "resource_type" | "title" | "year"
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
      exam_answer_keys: {
        Row: ExamAnswerKeyRow;
        Insert: Partial<ExamAnswerKeyRow>;
        Update: Partial<ExamAnswerKeyRow>;
        Relationships: [];
      };
      exam_attempts: {
        Row: ExamAttempt;
        Insert: {
          id?: string;
          user_id: string;
          resource_id: string;
          score?: number | null;
          total_questions?: number | null;
          percentage?: number | null;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["exam_attempts"]["Insert"]>;
        Relationships: [];
      };
      exam_attempt_answers: {
        Row: ExamAttemptAnswer;
        Insert: Partial<Database["public"]["Tables"]["exam_attempt_answers"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["exam_attempt_answers"]["Row"]>;
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
