export type UserRow = {
  id: string;
  telegram_chat_id?: number | null;
  is_calendar_authorized?: boolean;
  custom_categories?: string[] | null;
  created_at?: string;
};

export type TaskRow = {
  id: string;
  title: string;
  client?: string | null;
  owner?: string | null;
  category?: string | null;
  status?: string | null;
  task_type?: string | null;
  deadline?: string | null;
  follow_up_date?: string | null;
  confidence?: number | null;
  needs_review?: boolean | null;
  source_quote?: string | null;
  priority?: 'high' | 'medium' | 'low' | null;
  created_at: string;
};

export type CalendarIntentRow = {
  id: string;
  title: string;
  client?: string | null;
  location?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  confidence?: number | null;
  needs_review?: boolean | null;
  sync_status?: string | null;
  source_quote?: string | null;
  external_calendar_id?: string | null;
  synced_at?: string | null;
  created_at: string;
};

export type SourceBatchRow = {
  id: string;
  summary?: string | null;
  created_at: string;
  metadata?: {
    task_count?: number;
    event_count?: number;
    review_count?: number;
    unresolved_notes?: string[];
  } | null;
};

export type DocumentRow = {
  id: string;
  user_id?: string;
  title: string;
  content: string;
  status: 'processing' | 'completed' | 'failed';
  created_at: string;
};

export type DateLinkData = {
  id: string;
  label: string;
  date: string;
  source?: string;
  field?: 'currentStatus' | 'progress' | 'nextPush' | 'shootingNote' | 'companyHelp';
  start?: number;
};

export type ClientCalendarDateLink = DateLinkData & {
  client_name: string;
};

export type ClientRow = {
  id: string;
  user_id?: string;
  name: string;
  contact_info?: Record<string, unknown> | null;
  contract_start?: string | null;
  contract_end?: string | null;
  default_monthly_target?: number;
  status?: 'active' | 'paused' | 'completed';
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ClientWeeklyNoteRow = {
  id: string;
  user_id?: string;
  client_name: string;
  week_key: string;
  traffic_light: 'green' | 'yellow' | 'red';
  raw_count: number;
  edited_count: number;
  scheduled_count: number;
  unshot_count: number;
  current_status: string;
  progress_note: string;
  next_week_note: string;
  urgent_note: string;
  date_links: DateLinkData[];
  created_at?: string;
  updated_at?: string;
};

export type WeekBucket = {
  date: string;
  label: string;
  is_today: boolean;
  tasks: TaskRow[];
  events: CalendarIntentRow[];
};

export type WeeklyDashboardResponse = {
  user: UserRow | null;
  week_view: WeekBucket[];
  unscheduled_tasks: TaskRow[];
  batches: SourceBatchRow[];
  tasks: TaskRow[];
  calendarIntents: CalendarIntentRow[];
};

export type DayColumnProps = {
  bucket: WeekBucket;
  onEditTask: (task: TaskRow) => void;
  onEditEvent: (event: CalendarIntentRow) => void;
  onToggleTaskComplete: (taskId: string, currentStatus: string) => void;
  onSyncEvent: (eventId: string) => void;
  onDropTask?: (taskId: string, date: string) => void;
  onDropEvent?: (eventId: string, targetDate: string, originalStartTime: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDeleteEvent?: (eventId: string) => void;
  weather?: { label: string; max: number; min: number };
};

export type ReviewPanelProps = {
  tasks: TaskRow[];
  events: CalendarIntentRow[];
  onConfirmTask: (taskId: string) => void;
  onConfirmEvent: (eventId: string) => void;
  onEditTask: (task: TaskRow) => void;
  onEditEvent: (event: CalendarIntentRow) => void;
  onDeleteTask?: (taskId: string) => void;
  onDeleteEvent?: (eventId: string) => void;
};

export type BacklogPanelProps = {
  tasks: TaskRow[];
  onEditTask: (task: TaskRow) => void;
  onToggleTaskComplete: (taskId: string, currentStatus: string) => void;
  onDeleteTask?: (taskId: string) => void;
};

export type BatchListProps = {
  batches: SourceBatchRow[];
};

export type EditModalProps = {
  editing: { type: 'task'; item: TaskRow } | { type: 'event'; item: CalendarIntentRow };
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  saving: boolean;
};

export const STATUS_LABELS: Record<string, string> = {
  pending: '待處理',
  needs_review: '需補充',
  ready: '待同步',
  completed: '已完成',
  cancelled: '已取消',
  synced: '已同步',
  failed: '失敗',
  ignored: '已忽略',
  pending_review: '需補充',
};
