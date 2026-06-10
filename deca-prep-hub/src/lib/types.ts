export type ResourceType = "Roleplay" | "Exam";

export type Json =
  | boolean
  | null
  | number
  | string
  | Json[]
  | { [key: string]: Json | undefined };

export type SupabaseResourceType = "roleplay" | "exam" | "reference" | "unknown";
export type ResourceApprovalStatus = "approved" | "pending" | "rejected" | string;
export type ProfileRole = "student" | "admin" | "advisor";
export type ExamCorrectAnswer = "A" | "B" | "C" | "D" | "E";
export type ExamSelectedAnswer = ExamCorrectAnswer | "UNANSWERED";
export type ExamKeyStatus = "no-key" | "partial" | "complete";
export type AttemptProcessingStatus = "none" | "pending" | "complete" | "failed";
export type DecaEventType =
  | "individual_series"
  | "team_decision_making"
  | "principles"
  | "project"
  | "operations_research"
  | "other";
export type LearningContentStatus = "draft" | "approved" | "archived";
export type ReviewableContentStatus =
  | "draft"
  | "needs_review"
  | "approved"
  | "archived"
  | "rejected";
export type LadderStage = "recognize" | "define" | "connect" | "apply" | "explain" | "improve";
export type QuestionType = "multiple_choice" | "matching" | "multiple_select" | "free_text";
export type ConceptMasteryStatus =
  | "not_started"
  | "learning"
  | "practicing"
  | "almost_mastered"
  | "mastered";
export type AiExtractionJobType =
  | "resource_classification"
  | "exam_extraction"
  | "answer_key_extraction"
  | "roleplay_extraction"
  | "rubric_extraction"
  | "concept_feedback"
  | "roleplay_transcript_grading";
export type AiExtractionJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "needs_review"
  | "approved"
  | "rejected";
export type ResourceClassificationType =
  | "exam"
  | "answer_key"
  | "roleplay"
  | "judge_rubric"
  | "instructional_resource"
  | "unknown";

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
  detected_text?: string | null;
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

export type DecaEvent = {
  id: string;
  code: string;
  name: string;
  cluster: string | null;
  event_type: DecaEventType;
  participants: number | null;
  exam_cluster: string | null;
  description: string | null;
  is_pilot: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
};

export type KeySet = {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: LearningContentStatus;
  created_at: string | null;
  updated_at: string | null;
};

export type Concept = {
  id: string;
  name: string;
  slug: string;
  cluster: string | null;
  instructional_area: string | null;
  student_friendly_definition: string | null;
  detailed_explanation: string | null;
  example: string | null;
  common_misconceptions: string | null;
  status: LearningContentStatus;
  created_at: string | null;
  updated_at: string | null;
};

export type KeySetConcept = {
  key_set_id: string;
  concept_id: string;
  sort_order: number;
};

export type StructuredQuestion = {
  id: string;
  source_resource_id: string | null;
  event_id: string | null;
  concept_id: string | null;
  question_type: QuestionType | string;
  ladder_stage: LadderStage | null;
  prompt: string;
  choices: Json | null;
  correct_answer: Json | null;
  explanation: string | null;
  difficulty: string | null;
  status: ReviewableContentStatus;
  ai_generated: boolean;
  ai_extracted: boolean;
  admin_reviewed: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type QuestionAttempt = {
  id: string;
  user_id: string;
  question_id: string;
  answer: Json | null;
  is_correct: boolean | null;
  feedback: string | null;
  attempt_number: number;
  created_at: string | null;
};

export type ConceptMastery = {
  user_id: string;
  concept_id: string;
  status: ConceptMasteryStatus;
  recognize_score: number | null;
  define_score: number | null;
  connect_score: number | null;
  apply_score: number | null;
  explain_score: number | null;
  improve_score: number | null;
  last_practiced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RoleplayScenario = {
  id: string;
  resource_id: string | null;
  event_id: string | null;
  title: string | null;
  scenario_text: string | null;
  participant_role: string | null;
  judge_role: string | null;
  business_context: string | null;
  task: string | null;
  instructional_area: string | null;
  performance_indicators: Json | null;
  status: ReviewableContentStatus;
  ai_extracted: boolean;
  admin_reviewed: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type AiExtractionJob = {
  id: string;
  resource_id: string | null;
  user_id: string | null;
  job_type: AiExtractionJobType;
  status: AiExtractionJobStatus;
  model: string | null;
  input_storage_path: string | null;
  input_metadata: Json | null;
  raw_output_json: Json | null;
  validated_output_json: Json | null;
  confidence_score: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ResourceClassification = {
  id: string;
  resource_id: string;
  ai_extraction_job_id: string | null;
  classification: ResourceClassificationType;
  confidence: number | null;
  reasoning_summary: string | null;
  detected_event_code: string | null;
  detected_event_name: string | null;
  detected_year: number | null;
  warnings: Json | null;
  admin_confirmed: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type AiExtractedAnswerKey = {
  id: string;
  resource_id: string;
  ai_extraction_job_id: string | null;
  possible_exam_resource_id: string | null;
  title: string | null;
  detected_event_code: string | null;
  detected_year: number | null;
  answers: Json;
  status: ReviewableContentStatus;
  admin_reviewed: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type Rubric = {
  id: string;
  resource_id: string | null;
  event_id: string | null;
  ai_extraction_job_id: string | null;
  title: string | null;
  rubric_type: string | null;
  status: ReviewableContentStatus;
  ai_extracted: boolean;
  admin_reviewed: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type RubricCriterion = {
  id: string;
  rubric_id: string;
  name: string;
  description: string | null;
  max_points: number | null;
  performance_levels: Json | null;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
};

export type ConceptMasteryInput = Partial<
  Pick<
    ConceptMastery,
    | "apply_score"
    | "connect_score"
    | "define_score"
    | "explain_score"
    | "improve_score"
    | "last_practiced_at"
    | "recognize_score"
    | "status"
  >
>;

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
  examAnalyticsUnavailable?: boolean;
  roleplayPracticeUnavailable?: boolean;
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
      events: {
        Row: DecaEvent;
        Insert: {
          id?: string;
          code: string;
          name: string;
          cluster?: string | null;
          event_type: DecaEventType;
          participants?: number | null;
          exam_cluster?: string | null;
          description?: string | null;
          is_pilot?: boolean;
          sort_order?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
        Relationships: [];
      };
      key_sets: {
        Row: KeySet;
        Insert: {
          id?: string;
          event_id: string;
          title: string;
          description?: string | null;
          sort_order?: number;
          status?: LearningContentStatus;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["key_sets"]["Insert"]>;
        Relationships: [];
      };
      concepts: {
        Row: Concept;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          cluster?: string | null;
          instructional_area?: string | null;
          student_friendly_definition?: string | null;
          detailed_explanation?: string | null;
          example?: string | null;
          common_misconceptions?: string | null;
          status?: LearningContentStatus;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["concepts"]["Insert"]>;
        Relationships: [];
      };
      key_set_concepts: {
        Row: KeySetConcept;
        Insert: {
          key_set_id: string;
          concept_id: string;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["key_set_concepts"]["Insert"]>;
        Relationships: [];
      };
      questions: {
        Row: StructuredQuestion;
        Insert: {
          id?: string;
          source_resource_id?: string | null;
          event_id?: string | null;
          concept_id?: string | null;
          question_type: QuestionType | string;
          ladder_stage?: LadderStage | null;
          prompt: string;
          choices?: Json | null;
          correct_answer?: Json | null;
          explanation?: string | null;
          difficulty?: string | null;
          status?: ReviewableContentStatus;
          ai_generated?: boolean;
          ai_extracted?: boolean;
          admin_reviewed?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["questions"]["Insert"]>;
        Relationships: [];
      };
      question_attempts: {
        Row: QuestionAttempt;
        Insert: {
          id?: string;
          user_id: string;
          question_id: string;
          answer?: Json | null;
          is_correct?: boolean | null;
          feedback?: string | null;
          attempt_number?: number;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["question_attempts"]["Insert"]>;
        Relationships: [];
      };
      concept_mastery: {
        Row: ConceptMastery;
        Insert: {
          user_id: string;
          concept_id: string;
          status?: ConceptMasteryStatus;
          recognize_score?: number | null;
          define_score?: number | null;
          connect_score?: number | null;
          apply_score?: number | null;
          explain_score?: number | null;
          improve_score?: number | null;
          last_practiced_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["concept_mastery"]["Insert"]>;
        Relationships: [];
      };
      roleplay_scenarios: {
        Row: RoleplayScenario;
        Insert: {
          id?: string;
          resource_id?: string | null;
          event_id?: string | null;
          title?: string | null;
          scenario_text?: string | null;
          participant_role?: string | null;
          judge_role?: string | null;
          business_context?: string | null;
          task?: string | null;
          instructional_area?: string | null;
          performance_indicators?: Json | null;
          status?: ReviewableContentStatus;
          ai_extracted?: boolean;
          admin_reviewed?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["roleplay_scenarios"]["Insert"]>;
        Relationships: [];
      };
      ai_extraction_jobs: {
        Row: AiExtractionJob;
        Insert: {
          id?: string;
          resource_id?: string | null;
          user_id?: string | null;
          job_type: AiExtractionJobType;
          status?: AiExtractionJobStatus;
          model?: string | null;
          input_storage_path?: string | null;
          input_metadata?: Json | null;
          raw_output_json?: Json | null;
          validated_output_json?: Json | null;
          confidence_score?: number | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["ai_extraction_jobs"]["Insert"]>;
        Relationships: [];
      };
      resource_classifications: {
        Row: ResourceClassification;
        Insert: {
          id?: string;
          resource_id: string;
          ai_extraction_job_id?: string | null;
          classification: ResourceClassificationType;
          confidence?: number | null;
          reasoning_summary?: string | null;
          detected_event_code?: string | null;
          detected_event_name?: string | null;
          detected_year?: number | null;
          warnings?: Json | null;
          admin_confirmed?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["resource_classifications"]["Insert"]>;
        Relationships: [];
      };
      ai_extracted_answer_keys: {
        Row: AiExtractedAnswerKey;
        Insert: {
          id?: string;
          resource_id: string;
          ai_extraction_job_id?: string | null;
          possible_exam_resource_id?: string | null;
          title?: string | null;
          detected_event_code?: string | null;
          detected_year?: number | null;
          answers: Json;
          status?: ReviewableContentStatus;
          admin_reviewed?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["ai_extracted_answer_keys"]["Insert"]>;
        Relationships: [];
      };
      rubrics: {
        Row: Rubric;
        Insert: {
          id?: string;
          resource_id?: string | null;
          event_id?: string | null;
          ai_extraction_job_id?: string | null;
          title?: string | null;
          rubric_type?: string | null;
          status?: ReviewableContentStatus;
          ai_extracted?: boolean;
          admin_reviewed?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["rubrics"]["Insert"]>;
        Relationships: [];
      };
      rubric_criteria: {
        Row: RubricCriterion;
        Insert: {
          id?: string;
          rubric_id: string;
          name: string;
          description?: string | null;
          max_points?: number | null;
          performance_levels?: Json | null;
          sort_order?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["rubric_criteria"]["Insert"]>;
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
