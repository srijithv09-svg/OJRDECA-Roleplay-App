export type ResourceType = "Roleplay" | "Exam";

export type Difficulty = "Intro" | "Standard" | "Advanced";

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
