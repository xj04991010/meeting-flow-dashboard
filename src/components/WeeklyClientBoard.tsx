import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RichNoteEditor, type RichNoteSelection } from './RichNoteEditor';
import { ArrowLeft, Bot, Building2, CalendarClock, CalendarDays, CheckCircle2, ChevronRight, Clipboard, CloudOff, Download, Film, History, Link2, LoaderCircle, Plus, RefreshCw, Search, Send, Sparkles, X } from 'lucide-react';
import type { CalendarIntentRow, ClientRow, ClientWeeklyNoteRow, TaskRow } from '../types';
import { formatDateOnly } from '../utils';
import { askClientAssistant, batchSaveClientNotes, fetchClientNoteWeeks, fetchClientNotes, saveClientNote } from '../api';

type WeeklyClientBoardProps = {
  tasks: TaskRow[];
  events: CalendarIntentRow[];
  clients: ClientRow[];
  selectedDate?: string;
  onEditTask: (task: TaskRow) => void;
  onEditEvent: (event: CalendarIntentRow) => void;
  onCreateClient: (name: string) => Promise<void>;
  onSelectWeek: (weekKey: string) => void;
};

type ClientNote = {
  trafficLight: TrafficLight;
  currentStatus: string;
  progress: string;
  nextPush: string;
  shootingNote: string;
  companyHelp: string;
  footage: string;
  finished: string;
  editing: string;
  planning: string;
  dateLinks: Array<{ id: string; label: string; date: string; source?: string; field?: TextFieldKey; start?: number }>;
  savedAt?: string;
};

type ClientWeek = {
  name: string;
  tasks: TaskRow[];
  events: CalendarIntentRow[];
};

type CalendarItem = {
  id: string;
  date: string;
  client: string;
  label: string;
  type: 'task' | 'event' | 'date-link';
  item?: TaskRow | CalendarIntentRow;
  source?: string;
};

type TextFieldKey = 'currentStatus' | 'progress' | 'nextPush' | 'shootingNote' | 'companyHelp';
type TrafficLight = 'green' | 'yellow' | 'red';
type SyncState = 'loading' | 'saving' | 'saved' | 'local-only';
type ClientWorkspaceTab = 'report' | 'dates' | 'history';

type SelectionDraft = {
  clientName: string;
  field: TextFieldKey;
  text: string;
  start: number;
  anchorLeft: number;
  anchorTop: number;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
};

type BossReportExportRecord = {
  exportDate: string;
  exportedAt: string;
  action: 'copy' | 'download';
};

const FIELD_LABELS: Record<TextFieldKey, string> = {
  currentStatus: '目前狀態',
  progress: '本週進度',
  nextPush: '下週推進',
  shootingNote: '待拍攝內容',
  companyHelp: '需公司判斷或協辦',
};

const REPORT_FIELD_ORDER: TextFieldKey[] = [
  'currentStatus',
  'progress',
  'nextPush',
  'shootingNote',
  'companyHelp',
];

const SHOOTING_SECTION = '【待拍攝內容】';
const COMPANY_HELP_SECTION = '【需公司判斷／緊急協辦】';

const TRAFFIC_LIGHTS: Record<TrafficLight, { label: string; short: string; description: string }> = {
  green: {
    label: '綠燈',
    short: '正常推進',
    description: '正常推進，不需公司介入。',
  },
  yellow: {
    label: '黃燈',
    short: '持續追蹤',
    description: '客戶回覆變慢、拍攝時間未確認、方向尚未明確，我會持續追蹤並給明確選項。',
  },
  red: {
    label: '紅燈',
    short: '當天回報',
    description: '已影響排程、交付、合作判斷，或追蹤後仍沒有明確結論，我會當天回報並提出處理建議。',
  },
};

const TRAFFIC_ORDER: TrafficLight[] = ['green', 'yellow', 'red'];

const DEFAULT_NOTE: ClientNote = {
  trafficLight: 'green',
  currentStatus: '',
  progress: '',
  nextPush: '',
  shootingNote: '',
  companyHelp: '',
  footage: '',
  finished: '',
  editing: '',
  planning: '',
  dateLinks: [],
};

function getWeekStartKey(selectedDate?: string) {
  const base = selectedDate ? new Date(selectedDate) : new Date();
  const day = base.getDay();
  const diff = base.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(base);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function getRollingStartKey(selectedDate?: string) {
  const base = selectedDate ? new Date(`${selectedDate}T00:00:00+08:00`) : new Date();
  return base.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function buildWeekDays(startKey: string) {
  const start = new Date(`${startKey}T00:00:00+08:00`);
  const weekdayLabels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const today = todayKey();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    return {
      key,
      label: key === today ? '今天' : weekdayLabels[date.getDay()],
      day: date.getDate(),
    };
  });
}

function toDateKey(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

let dateLinkSequence = 0;
function createDateLinkId() {
  dateLinkSequence += 1;
  return `${Date.now()}-${dateLinkSequence}`;
}

function daysUntil(dateKey: string) {
  const today = new Date(`${todayKey()}T00:00:00+08:00`).getTime();
  const target = new Date(`${dateKey}T00:00:00+08:00`).getTime();
  return Math.round((target - today) / 86400000);
}

function toCount(value: string | undefined) {
  const count = Number.parseInt(value || '0', 10);
  return Number.isFinite(count) ? count : 0;
}

function formatReportDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function cleanReportText(value?: string) {
  return normalizeLegacyNoteText(value || '').replace(/\s+/g, ' ').trim();
}

function loadBossReportExports(): BossReportExportRecord[] {
  try {
    return JSON.parse(localStorage.getItem('MF_BOSS_REPORT_EXPORTS') || '[]') as BossReportExportRecord[];
  } catch {
    return [];
  }
}

function saveBossReportExports(records: BossReportExportRecord[]) {
  localStorage.setItem('MF_BOSS_REPORT_EXPORTS', JSON.stringify(records.slice(0, 12)));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeLegacyNoteText(value: string) {
  let current = value || '';
  if (!current || !/[<&]/.test(current)) return current;

  for (let index = 0; index < 512; index += 1) {
    const next = current
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&nbsp;/g, ' ');
    if (next === current) break;
    current = next;
  }

  if (typeof DOMParser !== 'undefined' && /<[^>]+>/.test(current)) {
    const markup = current
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li)>/gi, '\n');
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    current = parsed.body.textContent || '';
  }

  return current.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function parseSupplementNote(value?: string | null) {
  const normalized = normalizeLegacyNoteText(value || '');
  if (!normalized.includes(SHOOTING_SECTION) && !normalized.includes(COMPANY_HELP_SECTION)) {
    return { shootingNote: '', companyHelp: normalized };
  }

  const shootingStart = normalized.indexOf(SHOOTING_SECTION);
  const companyStart = normalized.indexOf(COMPANY_HELP_SECTION);
  const shootingNote = shootingStart >= 0
    ? normalized.slice(
      shootingStart + SHOOTING_SECTION.length,
      companyStart > shootingStart ? companyStart : undefined,
    ).trim()
    : '';
  const companyHelp = companyStart >= 0
    ? normalized.slice(
      companyStart + COMPANY_HELP_SECTION.length,
      shootingStart > companyStart ? shootingStart : undefined,
    ).trim()
    : '';
  return { shootingNote, companyHelp };
}

function serializeSupplementNote(shootingNote: string, companyHelp: string) {
  return [
    shootingNote.trim() ? `${SHOOTING_SECTION}\n${shootingNote.trim()}` : '',
    companyHelp.trim() ? `${COMPANY_HELP_SECTION}\n${companyHelp.trim()}` : '',
  ].filter(Boolean).join('\n\n');
}

function formatReportNote(value: string, links: ClientNote['dateLinks'], field: TextFieldKey) {
  const text = normalizeLegacyNoteText(value || '').trim();
  if (!text) return '';
  const occupied: Array<{ start: number; end: number }> = [];
  const placements = (links || [])
    .filter((link) => (
      link.label.trim()
      && (
        link.field === field
        || link.source === FIELD_LABELS[field]
        || (!link.field && text.includes(link.label))
      )
    ))
    .flatMap((link) => {
      const candidates: number[] = [];
      let searchFrom = 0;
      while (searchFrom <= text.length - link.label.length) {
        const found = text.indexOf(link.label, searchFrom);
        if (found < 0) break;
        candidates.push(found);
        searchFrom = found + Math.max(1, link.label.length);
      }
      const preferred = typeof link.start === 'number' ? link.start : undefined;
      candidates.sort((a, b) => (
        preferred === undefined ? a - b : Math.abs(a - preferred) - Math.abs(b - preferred)
      ));
      const start = candidates.find((candidate) => !occupied.some((range) => (
        candidate < range.end && candidate + link.label.length > range.start
      )));
      if (start === undefined) return [];
      occupied.push({ start, end: start + link.label.length });
      return [{ ...link, start }];
    })
    .sort((a, b) => b.start - a.start);

  let result = text;
  for (const link of placements) {
    const end = link.start + link.label.length;
    const suffix = `（${formatReportDate(link.date)}）`;
    if (result.slice(end, end + suffix.length) === suffix) continue;
    result = `${result.slice(0, end)}${suffix}${result.slice(end)}`;
  }
  return result;
}

function renderLinkedNoteHtml(
  value: string,
  links: ClientNote['dateLinks'],
  field: TextFieldKey,
) {
  if (!value.trim()) return '';
  const fieldLinks = (links || [])
    .filter((link) => (
      link.label.trim()
      && (
        link.field === field
        || link.source === FIELD_LABELS[field]
        || (!link.field && value.includes(link.label))
      )
    ));

  const occupied: Array<{ start: number; end: number }> = [];
  const placements = fieldLinks.flatMap((link) => {
    const candidates: number[] = [];
    let searchFrom = 0;
    while (searchFrom <= value.length - link.label.length) {
      const found = value.indexOf(link.label, searchFrom);
      if (found < 0) break;
      candidates.push(found);
      searchFrom = found + Math.max(1, link.label.length);
    }

    const preferred = typeof link.start === 'number' ? link.start : undefined;
    candidates.sort((a, b) => (
      preferred === undefined ? a - b : Math.abs(a - preferred) - Math.abs(b - preferred)
    ));
    const start = candidates.find((candidate) => !occupied.some((range) => (
      candidate < range.end && candidate + link.label.length > range.start
    )));
    if (start === undefined) return [];
    occupied.push({ start, end: start + link.label.length });
    return [{ ...link, start }];
  }).sort((a, b) => a.start - b.start);

  const placementByStart = new Map(placements.map((link) => [link.start, link]));

  let index = 0;
  let html = '';
  while (index < value.length) {
    const matched = placementByStart.get(index);
    if (matched) {
      html += `<span class="inline-date-link" data-type="inline-date-link" contenteditable="false" role="button" tabindex="0" data-id="${escapeHtml(matched.id)}" data-date="${escapeHtml(matched.date)}" data-label="${escapeHtml(matched.label)}" data-source="${escapeHtml(matched.source || '')}" data-start="${matched.start}"><span class="inline-date-link-label">${escapeHtml(matched.label)}</span><span class="inline-date-link-date">${escapeHtml(matched.date.slice(5).replace('-', '/'))}</span></span>`;
      index += matched.label.length;
      continue;
    }

    const char = value[index];
    html += char === '\n' ? '<br>' : escapeHtml(char);
    index += 1;
  }
  return `<p>${html}</p>`;
}

type InlineDateNoteProps = {
  clientName: string;
  value: string;
  links: ClientNote['dateLinks'];
  field: TextFieldKey;
  placeholder: string;
  draft: SelectionDraft | null;
  dateValue: string;
  onChange: (value: string, retainedLinkIds: string[]) => void;
  onSelectText: (selection: RichNoteSelection | null) => void;
  onOpenDate: (date: string) => void;
  onDateChange: (value: string) => void;
  onCreateLink: () => void;
  onCreateLinkForDate: (date: string) => void;
  onUpdateLink: (id: string, date: string) => void;
  onRemoveLink: (id: string) => void;
  onCancelLink: () => void;
};

function InlineDateNote({
  clientName,
  value,
  links,
  field,
  placeholder,
  draft,
  dateValue,
  onChange,
  onSelectText,
  onOpenDate,
  onDateChange,
  onCreateLink,
  onCreateLinkForDate,
  onUpdateLink,
  onRemoveLink,
  onCancelLink,
}: InlineDateNoteProps) {
  const isActiveDraft = draft?.clientName === clientName && draft.field === field;
  const [viewLink, setViewLink] = useState<{ id: string; label: string; date: string; source?: string } | null>(null);
  const plainTextRef = useRef(value);
  useEffect(() => {
    plainTextRef.current = value;
  }, [value]);
  const quickDate = (offsetDays: number) => {
    const date = new Date(`${todayKey()}T00:00:00+08:00`);
    date.setDate(date.getDate() + offsetDays);
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  };
  return (
    <div className="row-note-field rich-note-field">
      <RichNoteEditor
        content={renderLinkedNoteHtml(value, links, field)}
        placeholder={placeholder}
        ariaLabel={`${clientName} ${FIELD_LABELS[field]}`}
        className={`rich-note-editor ${value.trim() ? '' : 'is-empty'}`}
        onChange={(text, retainedLinkIds) => {
          onChange(text, retainedLinkIds);
        }}
        onSelectionChange={onSelectText}
        onInlineDateClick={setViewLink}
        onFocus={() => {}}
        onBlur={() => {}}
      />
      {viewLink && (
        <div className="inline-date-view-popover" onMouseDown={(event) => {
          if ((event.target as HTMLElement).tagName !== 'INPUT') event.preventDefault();
        }}>
          <div>
            <span>已連結日期</span>
            <strong>{viewLink.label}</strong>
            <small>{viewLink.date}{viewLink.source ? ` · ${viewLink.source}` : ''}</small>
          </div>
          <div className="inline-date-view-actions">
            <input
              type="date"
              value={viewLink.date}
              onChange={(event) => setViewLink((current) => current ? { ...current, date: event.target.value } : current)}
              aria-label="修改連結日期"
            />
            <button type="button" onClick={() => onUpdateLink(viewLink.id, viewLink.date)}>
              儲存日期
            </button>
            <button type="button" onClick={() => onOpenDate(viewLink.date)}>
              查看當日
            </button>
            <button type="button" className="ghost mini danger" onClick={() => {
              onRemoveLink(viewLink.id);
              setViewLink(null);
            }}>
              解除連結
            </button>
            <button type="button" className="ghost mini" onClick={() => setViewLink(null)}>
              關閉
            </button>
          </div>
        </div>
      )}
      {isActiveDraft && (
        <div
          className="inline-date-popover"
          style={{ left: draft.anchorLeft, top: draft.anchorTop }}
          onMouseDown={(event) => {
          if ((event.target as HTMLElement).tagName !== 'INPUT') event.preventDefault();
          }}
        >
          <div className="inline-date-selection">
            <span>替這段文字標示日期</span>
            <strong>{draft.text}</strong>
          </div>
          <div className="inline-date-quick-options" aria-label="快速日期">
            <button type="button" onClick={() => onCreateLinkForDate(quickDate(0))}>今天</button>
            <button type="button" onClick={() => onCreateLinkForDate(quickDate(1))}>明天</button>
            <button type="button" onClick={() => onCreateLinkForDate(quickDate(7))}>下週</button>
          </div>
          <input
            type="date"
            value={dateValue}
            onChange={(event) => onDateChange(event.target.value)}
            aria-label="連結日期"
          />
          <button type="button" onClick={onCreateLink}>
            標示日期
          </button>
          <button type="button" className="ghost mini inline-date-cancel" onClick={onCancelLink}>取消</button>
          <small className="inline-date-helper">完成後會出現在週曆，AI 助理也會依日期追蹤。</small>
        </div>
      )}
    </div>
  );
}

function loadNotesFromLocal(weekKey: string): Record<string, ClientNote> {
  try {
    const raw = localStorage.getItem(`MF_WEEKLY_CLIENT_NOTES_${weekKey}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ClientNote>;
    const normalized = Object.fromEntries(Object.entries(parsed).map(([clientName, note]) => {
      const currentStatus = normalizeLegacyNoteText(note.currentStatus || '');
      const progress = normalizeLegacyNoteText(note.progress || '');
      const nextPush = normalizeLegacyNoteText(note.nextPush || '');
      const shootingNote = normalizeLegacyNoteText(note.shootingNote || '');
      const companyHelp = normalizeLegacyNoteText(note.companyHelp || '');
      const fieldText: Record<TextFieldKey, string> = {
        currentStatus,
        progress,
        nextPush,
        shootingNote,
        companyHelp,
      };
      const dateLinks = (note.dateLinks || []).filter((link) => {
        if (!link.label?.trim()) return false;
        if (link.field) return fieldText[link.field]?.includes(link.label);
        return Object.values(fieldText).some((text) => text.includes(link.label));
      });
      return [
      clientName,
      {
        ...note,
        currentStatus,
        progress,
        nextPush,
        shootingNote,
        companyHelp,
        dateLinks,
      },
    ];
    }));
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      saveNotesToLocal(weekKey, normalized);
    }
    return normalized;
  } catch {
    return {};
  }
}

function saveNotesToLocal(weekKey: string, notes: Record<string, ClientNote>) {
  localStorage.setItem(`MF_WEEKLY_CLIENT_NOTES_${weekKey}`, JSON.stringify(notes));
  const historyRaw = localStorage.getItem('MF_WEEKLY_CLIENT_NOTE_WEEKS');
  const history = historyRaw ? JSON.parse(historyRaw) as string[] : [];
  if (!history.includes(weekKey)) {
    localStorage.setItem('MF_WEEKLY_CLIENT_NOTE_WEEKS', JSON.stringify([weekKey, ...history].slice(0, 24)));
  }
}

function mapRowToNote(row: ClientWeeklyNoteRow): ClientNote {
  const supplement = parseSupplementNote(row.urgent_note);
  return {
    trafficLight: row.traffic_light as TrafficLight,
    currentStatus: normalizeLegacyNoteText(row.current_status || ''),
    progress: normalizeLegacyNoteText(row.progress_note || ''),
    nextPush: normalizeLegacyNoteText(row.next_week_note || ''),
    shootingNote: supplement.shootingNote,
    companyHelp: supplement.companyHelp,
    footage: String(row.raw_count || 0),
    finished: String(row.edited_count || 0),
    editing: String(row.scheduled_count || 0),
    planning: String(row.unshot_count || 0),
    dateLinks: (row.date_links || []).map((dl) => ({
      id: dl.id || `${Date.now()}`,
      label: dl.label,
      date: dl.date,
      source: dl.source,
      field: dl.field as TextFieldKey | undefined,
      start: dl.start,
    })),
    savedAt: row.updated_at || row.created_at,
  };
}

function mapNoteToPayload(clientName: string, weekKey: string, note: ClientNote) {
  return {
    client_name: clientName,
    week_key: weekKey,
    traffic_light: note.trafficLight || 'green',
    raw_count: toCount(note.footage),
    edited_count: toCount(note.finished),
    scheduled_count: toCount(note.editing),
    unshot_count: toCount(note.planning),
    progress_note: note.progress || '',
    current_status: note.currentStatus || '',
    next_week_note: note.nextPush || '',
    urgent_note: serializeSupplementNote(note.shootingNote || '', note.companyHelp || ''),
    date_links: (note.dateLinks || []).map((dl) => ({
      id: dl.id,
      label: dl.label,
      date: dl.date,
      source: dl.source,
      field: dl.field,
      start: dl.start,
    })),
  };
}

export function WeeklyClientBoard({
  tasks,
  events,
  clients,
  selectedDate,
  onEditTask,
  onEditEvent,
  onCreateClient,
  onSelectWeek,
}: WeeklyClientBoardProps) {
  const weekKey = useMemo(() => getWeekStartKey(selectedDate), [selectedDate]);
  const rollingStartKey = useMemo(() => getRollingStartKey(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => buildWeekDays(rollingStartKey), [rollingStartKey]);
  const [notes, setNotes] = useState<Record<string, ClientNote>>(() => loadNotesFromLocal(weekKey));
  const notesRef = useRef(notes);
  const syncWeekRef = useRef(weekKey);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [syncError, setSyncError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyWeeks, setHistoryWeeks] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('MF_WEEKLY_CLIENT_NOTE_WEEKS') || '[]') as string[];
    } catch {
      return [];
    }
  });
  const [newDateValue, setNewDateValue] = useState<Record<string, string>>({});
  const [focusDate, setFocusDate] = useState(() => selectedDate || todayKey());
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(null);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [clientWorkspaceTab, setClientWorkspaceTab] = useState<ClientWorkspaceTab>('report');
  const [clientQuery, setClientQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [chatPending, setChatPending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  const [reportExportDate, setReportExportDate] = useState(() => todayKey());
  const [reportExportHistory, setReportExportHistory] = useState<BossReportExportRecord[]>(() => loadBossReportExports());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '我可以像秘書一樣幫你追進度、整理紅黃燈，也可以把你框選的文字變成提醒或日期連結。',
    },
  ]);
  const [currentWeekKey] = useState(() => getWeekStartKey());

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const syncTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const syncFailuresRef = useRef(new Set<string>());

  const syncNoteToBackend = useCallback((clientName: string, note: ClientNote) => {
    const targetWeek = weekKey;
    const syncKey = `${targetWeek}:${clientName}`;
    const existingTimer = syncTimersRef.current.get(syncKey);
    if (existingTimer) clearTimeout(existingTimer);

    syncFailuresRef.current.delete(syncKey);
    if (syncWeekRef.current === targetWeek) {
      setSyncState('saving');
      setSyncError('');
    }

    const timer = setTimeout(async () => {
      try {
        await saveClientNote(mapNoteToPayload(clientName, targetWeek, note));
        syncFailuresRef.current.delete(syncKey);
      } catch (error) {
        syncFailuresRef.current.add(syncKey);
        if (syncWeekRef.current === targetWeek) {
          setSyncError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        syncTimersRef.current.delete(syncKey);
        if (syncWeekRef.current === targetWeek) {
          const hasCurrentWeekFailure = [...syncFailuresRef.current]
            .some((key) => key.startsWith(`${targetWeek}:`));
          const hasCurrentWeekPending = [...syncTimersRef.current.keys()]
            .some((key) => key.startsWith(`${targetWeek}:`));
          setSyncState(hasCurrentWeekFailure ? 'local-only' : hasCurrentWeekPending ? 'saving' : 'saved');
        }
      }
    }, 800);
    syncTimersRef.current.set(syncKey, timer);
  }, [weekKey]);

  useEffect(() => {
    syncWeekRef.current = weekKey;
    let cancelled = false;
    const localNotes = loadNotesFromLocal(weekKey);
    queueMicrotask(() => {
      if (cancelled) return;
      setSyncState('loading');
      setSyncError('');
      setNotes(localNotes);
    });

    fetchClientNotes(weekKey, weekKey === currentWeekKey)
      .then((rows) => {
        if (cancelled) return;
        if (rows.length > 0) {
          const currentLocal = notesRef.current;
          const merged: Record<string, ClientNote> = { ...currentLocal };
          for (const row of rows) {
            const remoteNote = mapRowToNote(row);
            const localNote = currentLocal[row.client_name];
            // Remote wins if local has no savedAt or remote is newer
            if (!localNote?.savedAt || (remoteNote.savedAt && remoteNote.savedAt > localNote.savedAt)) {
              merged[row.client_name] = remoteNote;
            }
          }
          notesRef.current = merged;
          setNotes(merged);
          saveNotesToLocal(weekKey, merged);
        }
        const hasCurrentWeekFailure = [...syncFailuresRef.current]
          .some((key) => key.startsWith(`${weekKey}:`));
        const hasCurrentWeekPending = [...syncTimersRef.current.keys()]
          .some((key) => key.startsWith(`${weekKey}:`));
        setSyncState(hasCurrentWeekFailure ? 'local-only' : hasCurrentWeekPending ? 'saving' : 'saved');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[MF] Failed to load notes from Supabase, using localStorage:', err);
        setSyncState('local-only');
        setSyncError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [currentWeekKey, weekKey]);

  useEffect(() => {
    fetchClientNoteWeeks()
      .then((weeks) => setHistoryWeeks(weeks))
      .catch(() => {
        // Local history remains available while offline.
      });
  }, []);

  useEffect(() => () => {
    syncTimersRef.current.forEach((timer) => clearTimeout(timer));
    syncTimersRef.current.clear();
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (selectedDate) {
        setFocusDate(selectedDate);
        return;
      }

      const today = todayKey();
      const isTodayInWeek = weekDays.some((day) => day.key === today);
      setFocusDate(isTodayInWeek ? today : weekDays[0]?.key || today);
    });
  }, [selectedDate, weekDays]);

  const clientMap = useMemo(() => {
    const map = new Map<string, ClientWeek>();
    
    clients.forEach((client) => {
      map.set(client.name, { name: client.name, tasks: [], events: [] });
    });

    const ensure = (name: string) => {
      if (!map.has(name)) map.set(name, { name, tasks: [], events: [] });
      return map.get(name)!;
    };

    tasks
      .filter((task) => task.status !== 'cancelled')
      .forEach((task) => ensure(task.client || task.category || '未分類業主').tasks.push(task));
    events
      .filter((event) => event.status !== 'cancelled')
      .forEach((event) => ensure(event.client || '未分類業主').events.push(event));

    return Array.from(map.values());
  }, [events, tasks, clients]);

  const [newClientName, setNewClientName] = useState('');

  const handleCreateClient = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newClientName.trim()) {
      await onCreateClient(newClientName.trim());
      setNewClientName('');
    }
  };

  const calendarItems = useMemo(() => {
    const items: CalendarItem[] = [];

    const sourceTasks = tasks;
    const sourceEvents = events;

    sourceTasks.filter((task) => task.status !== 'cancelled').forEach((task) => {
      const date = toDateKey(task.deadline);
      if (!date) return;
      items.push({
        id: `task-${task.id}`,
        date,
        client: task.client || task.category || '未分類',
        label: task.title,
        type: 'task',
        item: task,
      });
    });

    sourceEvents.filter((event) => event.status !== 'cancelled').forEach((event) => {
      const date = toDateKey(event.start_time);
      if (!date) return;
      items.push({
        id: `event-${event.id}`,
        date,
        client: event.client || '行程',
        label: event.title,
        type: 'event',
        item: event,
      });
    });

    Object.entries(notes).forEach(([clientName, note]) => {
      (note.dateLinks || []).forEach((link) => {
        items.push({
          id: `date-link-${clientName}-${link.id}`,
          date: link.date,
          client: clientName,
          label: link.label,
          type: 'date-link',
          source: link.source,
        });
      });
    });

    return items;
  }, [events, notes, tasks]);

  const focusedItems = useMemo(
    () => calendarItems.filter((item) => item.date === focusDate),
    [calendarItems, focusDate],
  );

  const focusedDay = weekDays.find((day) => day.key === focusDate);

  const productionTotals = useMemo(() => clients.reduce((totals, client) => {
    const note = notes[client.name] || DEFAULT_NOTE;
    return {
      footage: totals.footage + toCount(note.footage),
      finished: totals.finished + toCount(note.finished),
      scheduled: totals.scheduled + toCount(note.editing),
      monthlyUnshot: totals.monthlyUnshot + toCount(note.planning),
    };
  }, {
    footage: 0,
    finished: 0,
    scheduled: 0,
    monthlyUnshot: 0,
  }), [clients, notes]);

  const assistantReminders = useMemo(() => (
    calendarItems
      .map((item) => ({ ...item, days: daysUntil(item.date) }))
      .filter((item) => item.days >= 0 && item.days <= 14)
      .sort((a, b) => a.days - b.days)
      .slice(0, 6)
  ), [calendarItems]);

  const weeklyBossReport = useMemo(() => {
    const reportDate = formatReportDate(reportExportDate);
    const reportClients = clients.filter((client) => {
      const note = notes[client.name] || DEFAULT_NOTE;
      return [note.currentStatus, note.progress, note.nextPush, note.shootingNote, note.companyHelp]
        .some((value) => cleanReportText(value));
    });
    const clientNames = reportClients.map((client) => client.name).join('、');
    const clientBlocks = reportClients.map((client) => {
      const note = notes[client.name] || DEFAULT_NOTE;
      const traffic = note.trafficLight || 'green';
      const lines = [`【${client.name}】`];
      const reportFields: Array<[string, TextFieldKey, string]> = [
        ['目前狀態', 'currentStatus', note.currentStatus],
        ['本週進度', 'progress', note.progress],
        ['下週推進', 'nextPush', note.nextPush],
        ['待拍攝內容', 'shootingNote', note.shootingNote],
      ];
      reportFields.forEach(([label, field, value]) => {
        const formatted = formatReportNote(value, note.dateLinks, field);
        if (formatted) lines.push(`${label}：${formatted}`);
      });

      if (traffic !== 'green') {
        lines.push(
          `需公司判斷：此案目前屬於${TRAFFIC_LIGHTS[traffic].label}，${formatReportNote(note.companyHelp, note.dateLinks, 'companyHelp') || TRAFFIC_LIGHTS[traffic].description}`,
        );
      } else {
        const companyHelp = formatReportNote(note.companyHelp, note.dateLinks, 'companyHelp');
        if (companyHelp) lines.push(`需公司協助：${companyHelp}`);
      }

      return lines.join('\n');
    }).join('\n\n');

    return [
      `這是 ${reportDate} 給老闆的 IP 進度通知。`,
      `匯出日：${reportExportDate}`,
      '',
      `這份通知會整理目前所有 IP 的進度，包含目前手上的客戶：${clientNames || '本週尚無更新'}。`,
      '',
      '內容會包含：',
      '',
      '1. 目前每個客戶的狀態，並附上相關日期',
      '2. 下週預計推進的事項',
      '3. 是否有需要外部或公司協助推進的事項',
      '4. 是否有需要公司判斷的紅燈案子，如無則不添加',
      '',
      '先給你這周的第一版，如有增減項再跟我說：',
      '',
      clientBlocks,
      '',
      '平常我會自己每天收工前檢查追蹤表，確認每個業主的發片進度、庫存量、卡點與下次推進時間。',
      '',
      '如果只是一般進度，我會統一放到週報裡整理給你。',
      '',
      '但如果遇到客戶拖時間、拍攝日期不確認、方向沒有明確回覆，或可能影響公司排程，我會先評估後當天回報，不等到週報。',
      '',
      '這類紅燈案子，我會提供處理建議，例如：',
      '',
      '1. 繼續追蹤',
      '2. 改成小規模測試',
      '3. 先列為待客戶確認',
      '4. 暫緩，不占用公司排程',
      '5. 由公司評估是否重新排期、調整合作條件，必要時依合約處理，如消耗成本過大則討論停止合約。',
      '',
      '這樣平常進度可以固定整理，不用一直打擾你；但如果有客戶拖時間、嚴重影響溝通或排程，我也會提早回報，讓公司可以一起判斷後續處理方式。',
    ].join('\n');
  }, [clients, notes, reportExportDate]);

  const recordReportExport = (action: BossReportExportRecord['action']) => {
    const next = [
      {
        exportDate: reportExportDate,
        exportedAt: new Date().toISOString(),
        action,
      },
      ...reportExportHistory,
    ];
    setReportExportHistory(next.slice(0, 12));
    saveBossReportExports(next);
  };

  const copyWeeklyReport = async () => {
    await navigator.clipboard.writeText(weeklyBossReport);
    recordReportExport('copy');
    setReportCopied(true);
    window.setTimeout(() => setReportCopied(false), 1800);
  };

  const downloadWeeklyReport = () => {
    const blob = new Blob([weeklyBossReport], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MeetingFlow-老闆週報-${reportExportDate}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    recordReportExport('download');
  };

  const buildAssistantFallback = (prompt: string) => {
    const alertClients = clients
      .map((client) => ({
        name: client.name,
        light: (notes[client.name]?.trafficLight || 'green') as TrafficLight,
      }))
      .filter((client) => client.light !== 'green');

    if (/紅燈|黃燈|追|協辦|緊急/.test(prompt)) {
      if (alertClients.length === 0) return '目前沒有紅黃燈客戶。若你把某個客戶切成黃燈或紅燈，我會優先幫你列入追蹤。';
      return `目前要優先追：${alertClients.map((client) => `${client.name}（${TRAFFIC_LIGHTS[client.light].label}）`).join('、')}。`;
    }

    if (/毛片|成片|排程|未拍|片量/.test(prompt)) {
      return `目前總毛片 ${productionTotals.footage}、成片 ${productionTotals.finished}、已排程 ${productionTotals.scheduled}、本月未拍 ${productionTotals.monthlyUnshot}。`;
    }

    const nextReminder = assistantReminders[0];
    if (nextReminder) {
      return `我先把這段當成追蹤線索。最近要注意的是 ${nextReminder.client} 的「${nextReminder.label}」，日期是 ${nextReminder.date}。`;
    }

    return '我先把這段當成追蹤線索。你可以框選重點接日期，或把客戶切成黃燈/紅燈，我就會在右側提醒你。';
  };

  const sendChatMessage = async (message?: string, meta?: string) => {
    const text = (message || chatInput).trim();
    if (!text || chatPending) return;
    const messageContext = meta || selectedClient || undefined;
    const scopedPrompt = selectedClient
      ? `請只針對客戶「${selectedClient}」回答，若資料不足請直接指出缺少什麼：${text}`
      : text;
    const timestamp = Date.now();
    setChatMessages((current) => ([
      ...current,
      { id: `${timestamp}-user-${current.length}`, role: 'user', text, meta: messageContext },
    ]));
    if (!message) setChatInput('');
    setAssistantOpen(true);
    setChatPending(true);
    try {
      const answer = await askClientAssistant(scopedPrompt, weekKey);
      setChatMessages((current) => ([
        ...current,
        { id: `${timestamp}-assistant-${current.length}`, role: 'assistant', text: answer, meta: messageContext },
      ]));
    } catch {
      setChatMessages((current) => ([
        ...current,
        {
          id: `${timestamp}-assistant-${current.length}`,
          role: 'assistant',
          meta: messageContext,
          text: `目前無法連到 AI。先依本機資料整理：${buildAssistantFallback(text)}`,
        },
      ]));
    } finally {
      setChatPending(false);
    }
  };

  const updateNote = (clientName: string, patch: Partial<ClientNote>) => {
    const current = notesRef.current;
    const currentNote = {
      ...DEFAULT_NOTE,
      ...(current[clientName] || {}),
    };
    const changed = (Object.keys(patch) as Array<keyof ClientNote>).some((key) => {
      if (key === 'dateLinks') {
        return JSON.stringify(currentNote.dateLinks) !== JSON.stringify(patch.dateLinks || []);
      }
      return currentNote[key] !== patch[key];
    });
    if (!changed) return;

    const nextNote = {
      ...currentNote,
      ...patch,
      savedAt: new Date().toISOString(),
    };
    const next = {
      ...current,
      [clientName]: nextNote,
    };
    notesRef.current = next;
    setNotes(next);
    saveNotesToLocal(weekKey, next);
    setHistoryWeeks((weeks) => [weekKey, ...weeks.filter((item) => item !== weekKey)].slice(0, 24));
    syncNoteToBackend(clientName, nextNote);
  };

  const retryBackendSync = async () => {
    const payloads = Object.entries(notesRef.current)
      .map(([clientName, note]) => mapNoteToPayload(clientName, weekKey, note));
    if (!payloads.length) {
      setSyncState('saved');
      setSyncError('');
      return;
    }

    setSyncState('saving');
    setSyncError('');
    try {
      await batchSaveClientNotes(weekKey, payloads);
      [...syncFailuresRef.current]
        .filter((key) => key.startsWith(`${weekKey}:`))
        .forEach((key) => syncFailuresRef.current.delete(key));
      setSyncState('saved');
    } catch (error) {
      setSyncState('local-only');
      setSyncError(error instanceof Error ? error.message : String(error));
    }
  };

  const cycleTrafficLight = (clientName: string) => {
    const current = notes[clientName]?.trafficLight || DEFAULT_NOTE.trafficLight;
    const next = TRAFFIC_ORDER[(TRAFFIC_ORDER.indexOf(current) + 1) % TRAFFIC_ORDER.length];
    updateNote(clientName, { trafficLight: next });
  };

  const captureSelection = (
    clientName: string,
    field: TextFieldKey,
    selection: RichNoteSelection | null,
  ) => {
    if (!selection) {
      setSelectionDraft((current) => (
        current?.clientName === clientName && current.field === field ? null : current
      ));
      return;
    }
    setSelectionDraft({ clientName, field, ...selection });
  };

  const updateNoteText = (
    clientName: string,
    field: TextFieldKey,
    value: string,
    retainedLinkIds?: string[],
  ) => {
    const current = notes[clientName] || DEFAULT_NOTE;
    const retainedIds = retainedLinkIds ? new Set(retainedLinkIds) : null;
    const occupied: Array<{ start: number; end: number }> = [];
    const dateLinks = (current.dateLinks || []).flatMap((link) => {
      if (link.field !== field && link.source !== FIELD_LABELS[field]) return [link];
      if (retainedIds && !retainedIds.has(link.id)) return [];
      const candidates: number[] = [];
      let searchFrom = 0;
      while (searchFrom <= value.length - link.label.length) {
        const found = value.indexOf(link.label, searchFrom);
        if (found < 0) break;
        candidates.push(found);
        searchFrom = found + Math.max(1, link.label.length);
      }
      candidates.sort((a, b) => Math.abs(a - (link.start || 0)) - Math.abs(b - (link.start || 0)));
      const start = candidates.find((candidate) => !occupied.some((range) => (
        candidate < range.end && candidate + link.label.length > range.start
      )));
      if (start === undefined) return [];
      occupied.push({ start, end: start + link.label.length });
      return [{ ...link, start }];
    });
    const fieldPatch: Record<TextFieldKey, Partial<ClientNote>> = {
      currentStatus: { currentStatus: value },
      progress: { progress: value },
      nextPush: { nextPush: value },
      shootingNote: { shootingNote: value },
      companyHelp: { companyHelp: value },
    };
    updateNote(clientName, { ...fieldPatch[field], dateLinks });
  };

  const getNoteText = (note: ClientNote, field: TextFieldKey) => {
    if (field === 'currentStatus') return note.currentStatus;
    if (field === 'progress') return note.progress;
    if (field === 'nextPush') return note.nextPush;
    if (field === 'shootingNote') return note.shootingNote;
    return note.companyHelp;
  };

  const getNotePlaceholder = (field: TextFieldKey) => {
    if (field === 'currentStatus') return '例如：執行中、被動等待中，或目前可發至哪一天…';
    if (field === 'progress') return '記下本週完成內容、客戶回覆或卡點…';
    if (field === 'nextPush') return '記下下週要推進的拍攝、交付或確認事項…';
    if (field === 'shootingNote') return '逐行記下待拍攝主題、口播或腳本內容…';
    return '需要立即處理、公司協助或主管判斷的內容…';
  };

  const addDateLink = (clientName: string, source?: string, dateOverride?: string) => {
    const activeSelection = selectionDraft?.clientName === clientName ? selectionDraft : null;
    const label = (activeSelection?.text || '').trim();
    const date = dateOverride || newDateValue[clientName];
    if (!activeSelection || !label || !date) return;
    const current = notes[clientName] || DEFAULT_NOTE;
    const patch: Partial<ClientNote> = {
      dateLinks: [
        ...(current.dateLinks || []),
        {
          id: createDateLinkId(),
          label,
          date,
          source: source || (activeSelection ? FIELD_LABELS[activeSelection.field] : '手動日期'),
          field: activeSelection?.field,
          start: activeSelection.start,
        },
      ],
    };
    updateNote(clientName, patch);
    setNewDateValue((value) => ({ ...value, [clientName]: '' }));
    setSelectionDraft(null);
  };

  const updateDateLink = (clientName: string, id: string, date: string) => {
    if (!date) return;
    const current = notes[clientName] || DEFAULT_NOTE;
    updateNote(clientName, {
      dateLinks: (current.dateLinks || []).map((link) => link.id === id ? { ...link, date } : link),
    });
  };

  const removeDateLink = (clientName: string, id: string) => {
    const current = notes[clientName] || DEFAULT_NOTE;
    updateNote(clientName, {
      dateLinks: (current.dateLinks || []).filter((link) => link.id !== id),
    });
  };

  const visibleClients = clientMap
    .filter((client) => {
      const note = notes[client.name] || DEFAULT_NOTE;
      const query = clientQuery.trim();
      const matchesQuery = !query
        || client.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
        || cleanReportText(note.currentStatus).includes(query)
        || cleanReportText(note.nextPush).includes(query);
      const matchesAttention = !attentionOnly || note.trafficLight !== 'green';
      return matchesQuery && matchesAttention;
    })
    .sort((left, right) => {
      const severity: Record<TrafficLight, number> = { red: 0, yellow: 1, green: 2 };
      return severity[notes[left.name]?.trafficLight || 'green']
        - severity[notes[right.name]?.trafficLight || 'green'];
    });

  const selectedRecord = selectedClient
    ? clientMap.find((client) => client.name === selectedClient)
    : undefined;
  const selectedNote = selectedClient
    ? notes[selectedClient] || DEFAULT_NOTE
    : DEFAULT_NOTE;
  const selectedClientItems = selectedClient
    ? calendarItems
      .filter((item) => item.client === selectedClient)
      .sort((left, right) => left.date.localeCompare(right.date))
    : [];
  const visibleChatMessages = selectedClient
    ? chatMessages.filter((message) => (
      message.id === 'welcome' || !message.meta || message.meta === selectedClient
    ))
    : chatMessages;

  const nearestClientItem = (clientName: string) => calendarItems
    .filter((item) => item.client === clientName && daysUntil(item.date) >= 0)
    .sort((left, right) => left.date.localeCompare(right.date))[0];

  const openClientWorkspace = (clientName: string) => {
    setSelectedClient(clientName);
    setClientWorkspaceTab('report');
    setSelectionDraft(null);
    setAssistantOpen(false);
  };

  const closeClientWorkspace = () => {
    setSelectedClient(null);
    setSelectionDraft(null);
    setAssistantOpen(false);
  };

  return (
    <section className="weekly-client-board meetingflow-workspace">
      <div className="weekly-board-toolbar">
        <div className="weekly-board-title">
          <span className="section-kicker">Weekly control</span>
          <div>
            <h2>客戶週控</h2>
            <span className="client-count">{clientMap.length} 位客戶 · {weekKey}</span>
          </div>
        </div>
        <div className="weekly-board-actions">
          <div
            className={'client-sync-indicator is-' + syncState}
            role="status"
            title={syncError || '客戶週進度雲端同步狀態'}
          >
            {syncState === 'loading' || syncState === 'saving'
              ? <LoaderCircle className="spin" size={15} />
              : syncState === 'local-only'
                ? <CloudOff size={15} />
                : <CheckCircle2 size={15} />}
            <span>
              {syncState === 'loading'
                ? '讀取中'
                : syncState === 'saving'
                  ? '同步中'
                  : syncState === 'local-only'
                    ? '僅存本機'
                    : '已同步'}
            </span>
            {syncState === 'local-only' && (
              <button
                type="button"
                className="ghost client-sync-retry"
                onClick={retryBackendSync}
                aria-label="重新同步週進度"
              >
                <RefreshCw size={13} />
                重試
              </button>
            )}
          </div>
          <label className="add-client-control">
            <Plus size={15} />
            <input
              value={newClientName}
              onChange={(event) => setNewClientName(event.target.value)}
              onKeyDown={handleCreateClient}
              placeholder="新增客戶"
              aria-label="新增客戶，輸入後按 Enter"
            />
          </label>
          <button className="ghost" onClick={() => setReportOpen(true)}>
            <Download size={15} />
            匯出週報
          </button>
          <button className="ghost" onClick={() => setHistoryOpen(true)}>
            <History size={15} />
            週版本
          </button>
        </div>
      </div>

      <div className="production-summary-strip" aria-label="片量總覽">
        <div className="production-summary-primary">
          <span>總毛片</span>
          <strong>{productionTotals.footage}</strong>
        </div>
        <div>
          <span>成片</span>
          <strong>{productionTotals.finished}</strong>
        </div>
        <div>
          <span>已排程</span>
          <strong>{productionTotals.scheduled}</strong>
        </div>
        <div>
          <span>本月未拍</span>
          <strong>{productionTotals.monthlyUnshot}</strong>
        </div>
        <div className="production-summary-alert">
          <span>紅黃燈</span>
          <strong>{clientMap.filter((client) => (notes[client.name]?.trafficLight || 'green') !== 'green').length}</strong>
        </div>
      </div>

      <div className="week-overview">
        <div className="week-strip">
          {weekDays.map((day) => {
            const dayItems = calendarItems.filter((item) => item.date === day.key);
            const isToday = day.key === todayKey();
            const isFocused = day.key === focusDate;
            return (
              <button
                type="button"
                key={day.key}
                className={'week-strip-day '
                  + (isToday ? 'is-today ' : '')
                  + (dayItems.length > 0 ? 'has-items ' : '')
                  + (isFocused ? 'is-focused' : '')}
                onClick={() => setFocusDate(day.key)}
                aria-pressed={isFocused}
              >
                <span className="week-day-head">
                  <strong>{day.label}</strong>
                  <b>{day.day}</b>
                </span>
                <span className="week-day-preview">
                  {dayItems.slice(0, 2).map((item) => (
                    <span key={item.id} className={'week-date-pill ' + item.type}>
                      <small>{item.client}</small>
                      <strong>{item.label}</strong>
                    </span>
                  ))}
                  {dayItems.length > 2 && <small className="week-more-count">+{dayItems.length - 2}</small>}
                  {dayItems.length === 0 && <small className="empty-day-label">無安排</small>}
                </span>
              </button>
            );
          })}
        </div>

        {focusedItems.length > 0 && (
          <div className="week-focus-line" aria-label={(focusedDay?.label || focusDate) + '的安排'}>
            <span className="week-focus-date">
              <strong>{focusedDay ? focusedDay.label + ' ' + focusedDay.day : focusDate}</strong>
              <small>{focusDate}</small>
            </span>
            <div className="week-focus-items">
              {focusedItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    if (item.client && clientMap.some((client) => client.name === item.client)) {
                      openClientWorkspace(item.client);
                    } else if (item.type === 'task' && item.item) {
                      onEditTask(item.item as TaskRow);
                    } else if (item.type === 'event' && item.item) {
                      onEditEvent(item.item as CalendarIntentRow);
                    }
                  }}
                >
                  <span>{item.client}</span>
                  <strong>{item.label}</strong>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!selectedRecord ? (
        <div className="client-index-view">
          <div className="client-index-controls">
            <div>
              <h3>全部客戶</h3>
              <span>{visibleClients.length} 筆</span>
            </div>
            <label className="client-search">
              <Search size={16} />
              <input
                type="search"
                value={clientQuery}
                onChange={(event) => setClientQuery(event.target.value)}
                placeholder="搜尋客戶或進度"
                aria-label="搜尋客戶或進度"
              />
            </label>
            <button
              type="button"
              className={'attention-filter ' + (attentionOnly ? 'is-active' : '')}
              onClick={() => setAttentionOnly((value) => !value)}
              aria-pressed={attentionOnly}
            >
              只看紅黃燈
            </button>
          </div>

          <div className="client-quick-list">
            {visibleClients.length === 0 ? (
              <div className="client-empty-state">
                <Building2 size={24} />
                <strong>沒有符合條件的客戶</strong>
                <button type="button" className="ghost" onClick={() => {
                  setClientQuery('');
                  setAttentionOnly(false);
                }}>
                  清除篩選
                </button>
              </div>
            ) : visibleClients.map((client) => {
              const note = notes[client.name] || DEFAULT_NOTE;
              const trafficLight = note.trafficLight || 'green';
              const traffic = TRAFFIC_LIGHTS[trafficLight];
              const nearest = nearestClientItem(client.name);
              return (
                <article
                  key={client.name}
                  className={'client-quick-row light-' + trafficLight}
                >
                  <header className="client-quick-identity">
                    <div>
                      <button
                        type="button"
                        className={'traffic-light-button ' + trafficLight}
                        onClick={() => cycleTrafficLight(client.name)}
                        title={traffic.label + '：' + traffic.description}
                        aria-label={client.name + ' ' + traffic.label}
                      >
                        <span />
                      </button>
                      <div>
                        <h3>{client.name}</h3>
                        <small>{traffic.label} · {traffic.short}</small>
                      </div>
                    </div>
                    <div className="client-quick-inventory" aria-label={client.name + '片量摘要'}>
                      <span>毛 {toCount(note.footage)}</span>
                      <span>成 {toCount(note.finished)}</span>
                      <span>排 {toCount(note.editing)}</span>
                      <span>未拍 {toCount(note.planning)}</span>
                    </div>
                    <div className="client-quick-nearest">
                    {nearest ? (
                      <>
                        <strong>{formatReportDate(nearest.date)}</strong>
                        <span>{nearest.label}</span>
                      </>
                    ) : <span>尚無日期</span>}
                    </div>
                    <div className="client-quick-flags">
                      {cleanReportText(note.shootingNote) && <span>待拍攝</span>}
                      {cleanReportText(note.companyHelp) && <span className="is-alert">需協辦</span>}
                    </div>
                    <button
                      type="button"
                      className="client-quick-open"
                      onClick={() => openClientWorkspace(client.name)}
                    >
                      完整資料
                      <ChevronRight size={15} />
                    </button>
                  </header>

                  <div className="client-quick-editors">
                    {(['currentStatus', 'progress', 'nextPush'] as TextFieldKey[]).map((field) => (
                      <section key={field} className={'client-quick-field quick-' + field}>
                        <h4>{FIELD_LABELS[field]}</h4>
                        <InlineDateNote
                          clientName={client.name}
                          value={getNoteText(note, field)}
                          links={note.dateLinks || []}
                          field={field}
                          placeholder={getNotePlaceholder(field)}
                          draft={selectionDraft}
                          dateValue={newDateValue[client.name] || ''}
                          onChange={(value, retainedLinkIds) => updateNoteText(
                            client.name,
                            field,
                            value,
                            retainedLinkIds,
                          )}
                          onSelectText={(selection) => captureSelection(client.name, field, selection)}
                          onOpenDate={setFocusDate}
                          onDateChange={(value) => setNewDateValue((current) => ({
                            ...current,
                            [client.name]: value,
                          }))}
                          onCreateLink={() => addDateLink(client.name)}
                          onCreateLinkForDate={(date) => addDateLink(client.name, undefined, date)}
                          onUpdateLink={(id, date) => updateDateLink(client.name, id, date)}
                          onRemoveLink={(id) => removeDateLink(client.name, id)}
                          onCancelLink={() => setSelectionDraft(null)}
                        />
                      </section>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="client-workspace">
          <header className="client-workspace-header">
            <button type="button" className="client-back-button" onClick={closeClientWorkspace}>
              <ArrowLeft size={17} />
              全部客戶
            </button>
            <div className="client-workspace-identity">
              <button
                type="button"
                className={'traffic-light-button ' + selectedNote.trafficLight}
                onClick={() => cycleTrafficLight(selectedRecord.name)}
                title={TRAFFIC_LIGHTS[selectedNote.trafficLight].description}
                aria-label={selectedRecord.name + ' ' + TRAFFIC_LIGHTS[selectedNote.trafficLight].label}
              >
                <span />
              </button>
              <div>
                <h3>{selectedRecord.name}</h3>
                <span>
                  {TRAFFIC_LIGHTS[selectedNote.trafficLight].label}
                  {selectedNote.savedAt ? ' · 已保存 ' + formatDateOnly(selectedNote.savedAt) : ' · 本週新紀錄'}
                </span>
              </div>
            </div>
            <div className="client-inventory-editor" aria-label={selectedRecord.name + '片量'}>
              <label>
                <span><Film size={13} />毛片</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={selectedNote.footage}
                  onChange={(event) => updateNote(selectedRecord.name, { footage: event.target.value })}
                  placeholder="0"
                />
              </label>
              <label>
                <span><Sparkles size={13} />成片</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={selectedNote.finished}
                  onChange={(event) => updateNote(selectedRecord.name, { finished: event.target.value })}
                  placeholder="0"
                />
              </label>
              <label>
                <span><CalendarClock size={13} />已排程</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={selectedNote.editing}
                  onChange={(event) => updateNote(selectedRecord.name, { editing: event.target.value })}
                  placeholder="0"
                />
              </label>
              <label>
                <span>本月未拍</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={selectedNote.planning}
                  onChange={(event) => updateNote(selectedRecord.name, { planning: event.target.value })}
                  placeholder="0"
                />
              </label>
            </div>
          </header>

          <nav className="client-workspace-tabs" aria-label="客戶資料檢視">
            <button
              type="button"
              className={clientWorkspaceTab === 'report' ? 'is-active' : ''}
              onClick={() => setClientWorkspaceTab('report')}
            >
              週報
            </button>
            <button
              type="button"
              className={clientWorkspaceTab === 'dates' ? 'is-active' : ''}
              onClick={() => setClientWorkspaceTab('dates')}
            >
              日期 <span>{selectedClientItems.length}</span>
            </button>
            <button
              type="button"
              className={clientWorkspaceTab === 'history' ? 'is-active' : ''}
              onClick={() => setClientWorkspaceTab('history')}
            >
              歷史
            </button>
          </nav>

          {clientWorkspaceTab === 'report' && (
            <main className="client-document" aria-label={selectedRecord.name + '週報'}>
              {REPORT_FIELD_ORDER.map((field) => (
                <section key={field} className={'client-document-section document-' + field}>
                  <h4>{FIELD_LABELS[field]}</h4>
                  <InlineDateNote
                    clientName={selectedRecord.name}
                    value={getNoteText(selectedNote, field)}
                    links={selectedNote.dateLinks || []}
                    field={field}
                    placeholder={getNotePlaceholder(field)}
                    draft={selectionDraft}
                    dateValue={newDateValue[selectedRecord.name] || ''}
                    onChange={(value, retainedLinkIds) => updateNoteText(
                      selectedRecord.name,
                      field,
                      value,
                      retainedLinkIds,
                    )}
                    onSelectText={(selection) => captureSelection(selectedRecord.name, field, selection)}
                    onOpenDate={setFocusDate}
                    onDateChange={(value) => setNewDateValue((current) => ({
                      ...current,
                      [selectedRecord.name]: value,
                    }))}
                    onCreateLink={() => addDateLink(selectedRecord.name)}
                    onCreateLinkForDate={(date) => addDateLink(selectedRecord.name, undefined, date)}
                    onUpdateLink={(id, date) => updateDateLink(selectedRecord.name, id, date)}
                    onRemoveLink={(id) => removeDateLink(selectedRecord.name, id)}
                    onCancelLink={() => setSelectionDraft(null)}
                  />
                </section>
              ))}
            </main>
          )}

          {clientWorkspaceTab === 'dates' && (
            <div className="client-date-view">
              <div className="client-view-heading">
                <div>
                  <span className="section-kicker">Linked dates</span>
                  <h4>所有日期</h4>
                </div>
                <CalendarDays size={19} />
              </div>
              {selectedClientItems.length === 0 ? (
                <div className="client-view-empty">
                  <Link2 size={20} />
                  <strong>目前沒有日期</strong>
                </div>
              ) : (
                <div className="client-date-list">
                  {selectedClientItems.map((item) => (
                    <article key={item.id}>
                      <time dateTime={item.date}>
                        <strong>{formatReportDate(item.date)}</strong>
                        <span>{item.date}</span>
                      </time>
                      <div>
                        <span>{item.source || (item.type === 'task' ? '待辦' : item.type === 'event' ? '行程' : '週報')}</span>
                        <strong>{item.label}</strong>
                      </div>
                      <button
                        type="button"
                        className="ghost compact"
                        onClick={() => {
                          setFocusDate(item.date);
                          if (item.type === 'task' && item.item) onEditTask(item.item as TaskRow);
                          if (item.type === 'event' && item.item) onEditEvent(item.item as CalendarIntentRow);
                        }}
                      >
                        {item.type === 'date-link' ? '查看週曆' : '編輯來源'}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {clientWorkspaceTab === 'history' && (
            <div className="client-history-view">
              <div className="client-view-heading">
                <div>
                  <span className="section-kicker">Weekly snapshots</span>
                  <h4>週版本</h4>
                </div>
                <History size={19} />
              </div>
              <p>每週版本獨立保存。開啟舊版本不會覆蓋目前這一週。</p>
              <div className="client-history-list">
                {historyWeeks.length === 0 ? (
                  <div className="client-view-empty">
                    <History size={20} />
                    <strong>尚無歷史週版本</strong>
                  </div>
                ) : historyWeeks.map((week) => (
                  <button
                    type="button"
                    key={week}
                    className={week === weekKey ? 'is-active' : ''}
                    onClick={() => onSelectWeek(week)}
                  >
                    <span>{week}</span>
                    <small>{week === currentWeekKey ? '本週' : '歷史版本'}</small>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <aside className={'client-assistant-dock ' + (assistantOpen ? 'is-open' : '')}>
            {assistantOpen && (
              <div className="client-assistant-conversation" aria-live="polite">
                <div className="client-assistant-head">
                  <div>
                    <Bot size={18} />
                    <strong>{selectedRecord.name} 的 AI 助理</strong>
                  </div>
                  <button type="button" onClick={() => setAssistantOpen(false)} aria-label="收合 AI 對話">
                    <X size={16} />
                  </button>
                </div>
                <div className="client-assistant-messages">
                  {visibleChatMessages.map((message) => (
                    <div key={message.id} className={'ai-chat-message ' + message.role}>
                      <span>{message.text}</span>
                    </div>
                  ))}
                  {chatPending && (
                    <div className="ai-chat-message assistant is-thinking">
                      <LoaderCircle className="spin" size={14} />
                      <span>正在讀取 {selectedRecord.name} 的本週資料...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <form
              className="client-assistant-form"
              onSubmit={(event) => {
                event.preventDefault();
                void sendChatMessage();
              }}
            >
              <button
                type="button"
                className="client-assistant-toggle"
                onClick={() => setAssistantOpen((value) => !value)}
                aria-expanded={assistantOpen}
                aria-label="開啟 AI 助理"
              >
                <Bot size={18} />
              </button>
              <input
                value={chatInput}
                onFocus={() => setAssistantOpen(true)}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={'詢問 AI 關於 ' + selectedRecord.name}
                aria-label={'詢問 AI 關於 ' + selectedRecord.name}
              />
              <button type="submit" aria-label="送出問題" disabled={chatPending || !chatInput.trim()}>
                {chatPending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
              </button>
            </form>
          </aside>
        </div>
      )}

      {reportOpen && (
        <div
          className="workspace-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReportOpen(false);
          }}
        >
          <section className="boss-report-modal" role="dialog" aria-modal="true" aria-label="匯出週報">
            <header>
              <div>
                <span className="section-kicker">Boss weekly report</span>
                <h3>匯出給老闆</h3>
              </div>
              <button type="button" className="modal-close-button" onClick={() => setReportOpen(false)} aria-label="關閉匯出視窗">
                <X size={18} />
              </button>
            </header>
            <div className="boss-report-controls">
              <label>
                <span>匯出日</span>
                <input
                  type="date"
                  value={reportExportDate}
                  onChange={(event) => setReportExportDate(event.target.value || todayKey())}
                />
              </label>
              {reportExportHistory.length > 0 && (
                <div className="boss-report-history">
                  <span>最近匯出</span>
                  {reportExportHistory.slice(0, 4).map((record) => (
                    <small key={record.exportedAt + '-' + record.action}>
                      {record.exportDate} · {record.action === 'copy' ? '複製' : '下載'}
                    </small>
                  ))}
                </div>
              )}
            </div>
            <textarea
              className="boss-report-textarea"
              value={weeklyBossReport}
              readOnly
              aria-label="給老闆的週進度通知"
            />
            <footer>
              <button className="ghost" onClick={copyWeeklyReport}>
                <Clipboard size={15} />
                {reportCopied ? '已複製' : '複製全文'}
              </button>
              <button className="primary-action" onClick={downloadWeeklyReport}>
                <Download size={15} />
                下載 TXT
              </button>
            </footer>
          </section>
        </div>
      )}

      {historyOpen && (
        <div
          className="workspace-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryOpen(false);
          }}
        >
          <section className="week-history-modal" role="dialog" aria-modal="true" aria-label="週版本">
            <header>
              <div>
                <span className="section-kicker">Weekly snapshots</span>
                <h3>週版本</h3>
              </div>
              <button type="button" className="modal-close-button" onClick={() => setHistoryOpen(false)} aria-label="關閉週版本">
                <X size={18} />
              </button>
            </header>
            <p>每一週都獨立保存，查看舊週不會取代本週資料。</p>
            <div className="week-history-modal-list">
              {historyWeeks.length === 0 ? (
                <span>尚無歷史週版本。</span>
              ) : historyWeeks.map((week) => (
                <button
                  type="button"
                  className={week === weekKey ? 'is-active' : ''}
                  key={week}
                  onClick={() => {
                    onSelectWeek(week);
                    setHistoryOpen(false);
                  }}
                >
                  <span>{week}</span>
                  <small>{week === currentWeekKey ? '本週' : '歷史版本'}</small>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
