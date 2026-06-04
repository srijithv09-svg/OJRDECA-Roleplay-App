export type ResourceType = "Roleplay" | "Exam";

export type SupabaseResourceType = "roleplay" | "exam" | "reference" | "unknown";
export type ResourceApprovalStatus = "approved" | "pending" | "rejected" | string;
export type ProfileRole = "student" | "admin" | "advisor";
export type ExamCorrectAnswer = "A" | "B" | "C" | "D" | "E";
export type ExamSelectedAnswer = ExamCorrectAnswer | "UNANSWERED";
export type ExamKeyStatus = "no-key" | "partial" | "complete";
export type AttemptProcessingStatus = "none" | "pending" | "complete" | "failed";

export type Profile = {
  id: string;
  email: string | null;
  role: ProfileRole;
  created_at: string | null;
  updated_at: string | null;
};

export type Difficulty = "Intro" | "Standard" | "Advanced";

export type ResourceListItem = {
  id: string;
  title: string;
  created_at?: string | null;
  cluster: string | null;
  event_category: string | null;
  event_code: string | null;
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
  | "event_category"
  | "event_code"
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

export type RoleplayAttempt = {
  id: string;
  user_id: string;
  resource_id: string;
  response_notes: string | null;
  performance_indicator_notes: string | null;
  self_reflection: string | null;
  judge_feedback: string | null;
  audio_path: string | null;
  transcript: string | null;
  transcript_status: AttemptProcessingStatus;
  ai_feedback_status: AttemptProcessingStatus;
  ai_overall_score: number | null;
  ai_feedback_json: Record<string, unknown> | null;
  strengths: string[] | null;
  growth_areas: string[] | null;
  confidence_rating: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RoleplayAttemptInput = {
  response_notes?: string | null;
  performance_indicator_notes?: string | null;
  self_reflection?: string | null;
  judge_feedback?: string | null;
  confidence_rating?: number | null;
};

export type InstructionalAreaBreakdown = {
  instructional_area: string;
  correct_count: number;
  total_count: number;
  percentage: number;
};

export type AnalyticsAreaSummary = {
  instructional_area: string;
  correct_count: number;
  incorrect_count: number;
  total_count: number;
  percentage: number;
};

export type AnalyticsAttemptSummary = {
  id: string;
  user_id?: string;
  user_email?: string | null;
  resource_id: string;
  resource_title: string;
  cluster: string | null;
  score: number;
  total_questions: number;
  percentage: number;
  completed_at: string | null;
};

export type MissedQuestionSummary = {
  attempt_id: string;
  resource_id: string;
  resource_title: string;
  question_number: number;
  instructional_area: string;
  completed_at: string | null;
};

export type StudentAnalyticsSummary = {
  examsCompleted: number;
  averageScore: number;
  bestScore: number | null;
  mostRecentScore: number | null;
  roleplayAttemptsCompleted: number;
  recentRoleplayAttempts: RoleplayAttemptSummary[];
  mostPracticedEventCodes: Array<{
    event_code: string;
    attempts: number;
  }>;
  recentAttempts: AnalyticsAttemptSummary[];
  attemptHistory: AnalyticsAttemptSummary[];
  weakAreas: AnalyticsAreaSummary[];
  strongAreas: AnalyticsAreaSummary[];
  missedQuestions: MissedQuestionSummary[];
};

export type AdminAnalyticsSummary = {
  totalAttempts: number;
  averageScore: number;
  profileCount: number | null;
  profileCountUnavailable: boolean;
  mostAttemptedExams: Array<{
    resource_id: string;
    resource_title: string;
    attempts: number;
  }>;
  weakAreas: AnalyticsAreaSummary[];
  recentAttempts: AnalyticsAttemptSummary[];
  resourceTypeCounts: Record<SupabaseResourceType, number>;
  approvalCounts: Record<"approved" | "pending" | "rejected", number>;
};

export type ExamAttemptResult = {
  attempt: ExamAttempt;
  resource: PublicExamResource;
  answers: ExamAttemptAnswer[];
  breakdown: InstructionalAreaBreakdown[];
};

export type PublicRoleplayResource = Pick<
  ResourceListItem,
  | "cluster"
  | "event_category"
  | "event_code"
  | "event_name"
  | "id"
  | "original_filename"
  | "performance_indicators"
  | "performance_indicators_reviewed"
  | "resource_type"
  | "title"
  | "year"
>;

export type RoleplayAttemptResult = {
  attempt: RoleplayAttempt;
  resource: PublicRoleplayResource;
};

export type RoleplayAttemptSummary = {
  id: string;
  resource_id: string;
  resource_title: string;
  event_code: string | null;
  event_name: string | null;
  event_category: string | null;
  cluster: string | null;
  confidence_rating: number | null;
  transcript_status: AttemptProcessingStatus;
  ai_feedback_status: AttemptProcessingStatus;
  created_at: string | null;
};

export type PublicExamResource = Pick<
  ResourceListItem,
  | "cluster"
  | "event_category"
  | "event_code"
  | "event_name"
  | "id"
  | "original_filename"
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
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string | null;
          role?: ProfileRole;
          created_at?: string | null;
          updated_at?: string | null;
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
      roleplay_attempts: {
        Row: RoleplayAttempt;
        Insert: {
          id?: string;
          user_id: string;
          resource_id: string;
          response_notes?: string | null;
          performance_indicator_notes?: string | null;
          self_reflection?: string | null;
          judge_feedback?: string | null;
          audio_path?: string | null;
          transcript?: string | null;
          transcript_status?: AttemptProcessingStatus;
          ai_feedback_status?: AttemptProcessingStatus;
          ai_overall_score?: number | null;
          ai_feedback_json?: Record<string, unknown> | null;
          strengths?: string[] | null;
          growth_areas?: string[] | null;
          confidence_rating?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["roleplay_attempts"]["Insert"]>;
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
