import type { ActivityItem, EventItem, ExamResource, RoleplayResource } from "./types";

export const clusters = [
  "Marketing",
  "Finance",
  "Hospitality",
  "Management",
  "Entrepreneurship",
  "Personal Financial Literacy",
];

export const roleplayResources: RoleplayResource[] = [
  {
    id: "rp-1",
    title: "Customer Loyalty Recovery Plan",
    cluster: "Marketing",
    event: "Principles of Marketing",
    instructionalArea: "Customer Relations",
    performanceIndicator: "Explain actions employees can take to achieve company goals.",
    difficulty: "Intro",
    year: 2025,
    duration: "10 min prep",
  },
  {
    id: "rp-2",
    title: "Hotel Overbooking Response",
    cluster: "Hospitality",
    event: "Hospitality Services Team Decision Making",
    instructionalArea: "Operations",
    performanceIndicator: "Demonstrate procedures for handling difficult customers.",
    difficulty: "Standard",
    year: 2024,
    duration: "30 min prep",
  },
  {
    id: "rp-3",
    title: "Retail Expansion Pitch",
    cluster: "Entrepreneurship",
    event: "Entrepreneurship Series",
    instructionalArea: "Business Growth",
    performanceIndicator: "Identify factors affecting business risk.",
    difficulty: "Advanced",
    year: 2023,
    duration: "10 min prep",
  },
  {
    id: "rp-4",
    title: "Banking App Security Brief",
    cluster: "Finance",
    event: "Financial Consulting",
    instructionalArea: "Information Management",
    performanceIndicator: "Describe the nature of security and privacy risks.",
    difficulty: "Standard",
    year: 2025,
    duration: "15 min prep",
  },
];

export const examResources: ExamResource[] = [
  {
    id: "exam-1",
    title: "Marketing Cluster Exam Set A",
    cluster: "Marketing",
    year: 2025,
    questionCount: 100,
    averageScore: "76%",
    status: "Approved",
  },
  {
    id: "exam-2",
    title: "Finance Cluster Exam District Prep",
    cluster: "Finance",
    year: 2024,
    questionCount: 100,
    averageScore: "71%",
    status: "Approved",
  },
  {
    id: "exam-3",
    title: "Hospitality Cluster Practice Pack",
    cluster: "Hospitality",
    year: 2025,
    questionCount: 100,
    averageScore: "68%",
    status: "Review-ready",
  },
  {
    id: "exam-4",
    title: "Management Cluster Exam Set B",
    cluster: "Management",
    year: 2023,
    questionCount: 100,
    averageScore: "74%",
    status: "Approved",
  },
];

export const upcomingEvents: EventItem[] = [
  {
    title: "District Roleplay Scrimmage",
    date: "Jun 7, 2026",
    type: "Chapter",
    daysAway: 15,
  },
  {
    title: "State Conference Registration",
    date: "Jul 3, 2026",
    type: "Deadline",
    daysAway: 41,
  },
  {
    title: "Cluster Exam Benchmark",
    date: "Jul 19, 2026",
    type: "Assessment",
    daysAway: 57,
  },
];

export const countdowns = [
  { label: "Districts", value: 15, target: "Jun 7, 2026" },
  { label: "States", value: 88, target: "Aug 19, 2026" },
  { label: "ICDC", value: 334, target: "Apr 22, 2027" },
  { label: "Chapter Deadline", value: 41, target: "Jul 3, 2026" },
];

export const recentActivity: ActivityItem[] = [
  {
    action: "Completed",
    detail: "Marketing Cluster Exam Set A",
    time: "Today",
  },
  {
    action: "Bookmarked",
    detail: "Retail Expansion Pitch roleplay",
    time: "Yesterday",
  },
  {
    action: "Reviewed",
    detail: "Customer Relations performance indicators",
    time: "2 days ago",
  },
];

export const weakAreas = [
  { label: "Pricing Strategy", score: 58 },
  { label: "Financial Analysis", score: 62 },
  { label: "Operations Management", score: 65 },
];

export const strengths = [
  { label: "Customer Relations", score: 91 },
  { label: "Promotion", score: 88 },
  { label: "Professional Selling", score: 84 },
];

export const scoreSeries = [
  { label: "Week 1", score: 64 },
  { label: "Week 2", score: 68 },
  { label: "Week 3", score: 73 },
  { label: "Week 4", score: 79 },
  { label: "Week 5", score: 82 },
];
