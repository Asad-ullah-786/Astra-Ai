export const ASSISTANT_STATES = [
  "idle",
  "listening",
  "processing",
  "thinking",
  "speaking",
  "executing",
  "completed",
  "error",
] as const;

export type AssistantState = (typeof ASSISTANT_STATES)[number];

export interface HealthResponse {
  name: string;
  version: string;
  phase: number;
  status: string;
  database: string;
  auth_required: boolean;
  cloud_deployment: boolean;
  model: string;
  time_utc: string;
}

export interface SystemSnapshot {
  cpu_percent: number;
  cpu_count: number;
  ram_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  battery_percent: number | null;
  battery_plugged: boolean | null;
  disk_path: string;
  disk_percent: number;
  disk_free_gb: number;
  disk_total_gb: number;
  platform: string;
  hostname: string;
  python: string;
  system_uptime_seconds: number;
  app_uptime_seconds: number;
}

export interface ModuleInfo {
  id: string;
  name: string;
  phase: number;
  status: string;
  summary: string;
}

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
}

export interface CommandResult {
  conversation_id: string;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  state: AssistantState;
  model: string;
}

export interface InstalledModel {
  name: string;
  size: number;
  parameter_size: string | null;
  modified_at: string | null;
}

export interface AIStatus {
  connected: boolean;
  selected_model: string | null;
  models: InstalledModel[];
  clients: Record<string, boolean>;
  gemini?: GeminiStatus;
  openai?: GeminiStatus;
  error: string | null;
}

export interface GeminiStatus {
  configured: boolean;
  connected: boolean;
  models: string[];
  error: string | null;
}

export interface AIStreamEvent {
  type: "meta" | "token" | "done" | "error";
  conversation_id?: string;
  model?: string;
  user_message?: ChatMessage;
  assistant_message?: ChatMessage;
  content?: string;
  message?: string;
}

export interface ActivityItem {
  id: string;
  created_at: string;
  level: string;
  source: string;
  message: string;
  details: string | null;
}

export interface AstraTask {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  completed: boolean;
  in_progress: boolean;
  reminded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalMemory {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryInput {
  title: string;
  content: string;
}

export interface ResearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ResearchResponse {
  query: string;
  results: ResearchResult[];
}

export interface TaskCreateInput {
  title: string;
  notes: string | null;
  due_at: string | null;
}

export interface TaskUpdateInput {
  title?: string;
  notes?: string | null;
  due_at?: string | null;
  completed?: boolean;
  in_progress?: boolean;
}

export interface VoiceStatus {
  ready: boolean;
  dependencies_installed: boolean;
  model: string;
  languages: string[];
  message: string;
}

export interface VoiceTranscription {
  text: string;
  language: string;
  duration_seconds: number;
}

export interface SettingsPayload {
  user_display_name: string;
}

export interface CommandSendOptions {
  responseLanguage?: string;
  providerKey?: string;
  providerName?: "gemini" | "openai";
  onToken?: (chunk: string) => void;
}

export type LocalApplication = "code" | "cursor" | "chrome" | "settings";

export type DeviceIntent =
  | { action: "launch_app"; application: LocalApplication; label: string }
  | { action: "open_url"; url: string; label: string };

export interface AstraContextValue {
  health: HealthResponse | null;
  aiStatus: AIStatus | null;
  localClientAvailability: Record<string, boolean> | null;
  online: boolean;
  connectionError: string | null;
  activityError: string | null;
  commandError: string | null;
  state: AssistantState;
  stats: SystemSnapshot | null;
  modules: ModuleInfo[];
  activities: ActivityItem[];
  conversations: ConversationSummary[];
  tasks: AstraTask[];
  memories: PersonalMemory[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  settings: SettingsPayload | null;
  pendingDeviceAction: DeviceIntent | null;
  refresh: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  createTask: (task: TaskCreateInput) => Promise<void>;
  updateTask: (taskId: string, updates: TaskUpdateInput) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  createMemory: (memory: MemoryInput) => Promise<void>;
  updateMemory: (memoryId: string, memory: Partial<MemoryInput>) => Promise<void>;
  deleteMemory: (memoryId: string) => Promise<void>;
  refreshAI: () => Promise<void>;
  selectAIModel: (model: string) => Promise<void>;
  clearAIModel: () => Promise<void>;
  sendCommand: (text: string, options?: CommandSendOptions) => Promise<ChatMessage | null>;
  approveDeviceAction: () => Promise<void>;
  cancelDeviceAction: () => void;
  openConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;
  deleteActiveConversation: () => Promise<void>;
  saveDisplayName: (name: string) => Promise<void>;
  saveApiToken: (token: string) => void;
}
