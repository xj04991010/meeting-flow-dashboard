import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Building2, CalendarClock, ChevronDown, Clipboard, Download, Film, LayoutDashboard, Link2, MessageCircle, ScrollText, Send, Sparkles } from 'lucide-react';
import type { CalendarIntentRow, ClientRow, ClientWeeklyNoteRow, TaskRow } from '../types';
import { formatDateOnly } from '../utils';
import { fetchClientNotes, saveClientNote } from '../api';

type WeeklyClientBoardProps = {
  tasks: TaskRow[];
  events: CalendarIntentRow[];
  clients: ClientRow[];
  selectedDate?: string;
  onEditTask: (task: TaskRow) => void;
  onEditEvent: (event: CalendarIntentRow) => void;
  onCreateTask: (clientName: string, taskType: string, title: string) => Promise<void>;
  onCreateClient: (name: string) => Promise<void>;
};

type ClientNote = {
  trafficLight: TrafficLight;
  progress: string;
  nextPush: string;
  companyHelp: string;
  footage: string;
  finished: string;
  editing: string;
  planning: string;
  dateLinks: Array<{ id: string; label: string; date: string; source?: string; field?: TextFieldKey }>;
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

type TextFieldKey = 'progress' | 'nextPush' | 'companyHelp';
type TrafficLight = 'green' | 'yellow' | 'red';

type SelectionDraft = {
  clientName: string;
  field: TextFieldKey;
  text: string;
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
  progress: '本週進度',
  nextPush: '下週進度',
  companyHelp: '緊急事項或協辦',
};

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
  progress: '',
  nextPush: '',
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
  return (value || '').replace(/\s+/g, ' ').trim();
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
    ))
    .sort((a, b) => b.label.length - a.label.length);

  let index = 0;
  let html = '';
  while (index < value.length) {
    const matched = fieldLinks.find((link) => value.startsWith(link.label, index));
    if (matched) {
      html += `<span class="inline-date-link" contenteditable="false" role="button" tabindex="0" data-date="${escapeHtml(matched.date)}" data-label="${escapeHtml(matched.label)}" data-source="${escapeHtml(matched.source || '')}"><span class="inline-date-link-label">${escapeHtml(matched.label)}</span><span class="inline-date-link-date">${escapeHtml(matched.date.slice(5).replace('-', '/'))}</span></span>`;
      index += matched.label.length;
      continue;
    }

    const char = value[index];
    html += char === '\n' ? '<br>' : escapeHtml(char);
    index += 1;
  }
  return html;
}

function getEditorPlainText(target: HTMLElement) {
  const clone = target.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLElement>('.inline-date-link').forEach((link) => {
    link.replaceWith(document.createTextNode(link.dataset.label || link.textContent || ''));
  });
  return clone.innerText;
}

type InlineDateNoteProps = {
  clientName: string;
  label: string;
  value: string;
  links: ClientNote['dateLinks'];
  field: TextFieldKey;
  placeholder: string;
  draft: SelectionDraft | null;
  dateValue: string;
  onChange: (value: string) => void;
  onSelectText: (target: HTMLElement) => void;
  onOpenDate: (date: string) => void;
  onDateChange: (value: string) => void;
  onCreateLink: () => void;
  onCreateLinkForDate: (date: string) => void;
  onAddToChat: () => void;
  onAskAI: () => void;
  onInlineDateTrigger: (value: string, target: HTMLElement, selectedText?: string) => void;
};

function InlineDateNote({
  clientName,
  label,
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
  onAddToChat,
  onAskAI,
  onInlineDateTrigger,
}: InlineDateNoteProps) {
  const isActiveDraft = draft?.clientName === clientName && draft.field === field;
  const [viewLink, setViewLink] = useState<{ label: string; date: string; source?: string } | null>(null);
  const plainTextRef = useRef(value);
  useEffect(() => {
    plainTextRef.current = value;
  }, [value]);
  const quickDate = (offsetDays: number) => {
    const date = new Date(`${todayKey()}T00:00:00+08:00`);
    date.setDate(date.getDate() + offsetDays);
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  };
  const deleteAdjacentChip = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const editor = event.currentTarget;
    const findChip = (node: Node | null) => (
      node instanceof HTMLElement && node.classList.contains('inline-date-link') ? node : null
    );
    let candidate: Node | null = null;
    if (range.startContainer === editor) {
      candidate = editor.childNodes[range.startOffset + (event.key === 'Delete' ? 0 : -1)] || null;
    } else if (range.startContainer.nodeType === Node.TEXT_NODE) {
      if (event.key === 'Backspace' && range.startOffset === 0) candidate = range.startContainer.previousSibling;
      if (event.key === 'Delete' && range.startOffset === range.startContainer.textContent?.length) candidate = range.startContainer.nextSibling;
    }
    const chip = findChip(candidate);
    if (!chip) return;
    event.preventDefault();
    chip.remove();
    const text = getEditorPlainText(editor);
    editor.classList.toggle('is-empty', !text.trim());
    onChange(text);
  };

  return (
    <label className="row-note-field rich-note-field">
      <span>{label}</span>
      <small className="rich-note-hint">{placeholder}</small>
      <div
        className={`rich-note-editor ${value.trim() ? '' : 'is-empty'}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={label}
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: renderLinkedNoteHtml(value, links, field) }}
        onFocus={(event) => event.currentTarget.classList.remove('is-empty')}
        onBeforeInput={(event) => {
          const data = (event.nativeEvent as InputEvent).data;
          if (data !== '@' && data !== '＠') return;
          event.preventDefault();
          const selected = window.getSelection()?.toString().trim();
          const currentText = plainTextRef.current || getEditorPlainText(event.currentTarget);
          onInlineDateTrigger(`${currentText}@`, event.currentTarget, selected);
        }}
        onKeyDown={deleteAdjacentChip}
        onInput={(event) => {
          const text = getEditorPlainText(event.currentTarget);
          plainTextRef.current = text;
          event.currentTarget.classList.toggle('is-empty', !text.trim());
        }}
        onBlur={(event) => {
          const text = getEditorPlainText(event.currentTarget);
          plainTextRef.current = text;
          event.currentTarget.classList.toggle('is-empty', !text.trim());
          onChange(text);
        }}
        onPointerUp={(event) => onSelectText(event.currentTarget)}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          const link = target.closest<HTMLElement>('.inline-date-link');
          const date = link?.dataset.date;
          if (date && link) {
            setViewLink({
              date,
              label: link.dataset.label || link.textContent || '',
              source: link.dataset.source || label,
            });
          }
        }}
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
            <button type="button" onClick={() => onOpenDate(viewLink.date)}>
              查看當日
            </button>
            <button type="button" className="ghost mini" onClick={() => setViewLink(null)}>
              關閉
            </button>
          </div>
        </div>
      )}
      {isActiveDraft && (
        <div className="inline-date-popover" onMouseDown={(event) => {
          if ((event.target as HTMLElement).tagName !== 'INPUT') event.preventDefault();
        }}>
          <div className="inline-date-selection">
            <span>連結日期</span>
            <strong>{draft.text}</strong>
          </div>
          <div className="inline-ai-actions">
            <button type="button" className="ghost mini" onClick={onAddToChat}>
              加入聊天
            </button>
            <button type="button" className="ghost mini" onClick={onAskAI}>
              問 AI
            </button>
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
            連到日期
          </button>
        </div>
      )}
    </label>
  );
}

function loadNotesFromLocal(weekKey: string): Record<string, ClientNote> {
  try {
    const raw = localStorage.getItem(`MF_WEEKLY_CLIENT_NOTES_${weekKey}`);
    return raw ? JSON.parse(raw) : {};
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
  return {
    trafficLight: row.traffic_light as TrafficLight,
    progress: row.progress_note || '',
    nextPush: row.next_week_note || '',
    companyHelp: row.urgent_note || '',
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
    next_week_note: note.nextPush || '',
    urgent_note: note.companyHelp || '',
    date_links: (note.dateLinks || []).map((dl) => ({
      id: dl.id,
      label: dl.label,
      date: dl.date,
      source: dl.source,
      field: dl.field,
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
  onCreateTask,
  onCreateClient,
}: WeeklyClientBoardProps) {
  const weekKey = useMemo(() => getWeekStartKey(selectedDate), [selectedDate]);
  const rollingStartKey = useMemo(() => getRollingStartKey(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => buildWeekDays(rollingStartKey), [rollingStartKey]);
  const [notes, setNotes] = useState<Record<string, ClientNote>>(() => loadNotesFromLocal(weekKey));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newDateLabel, setNewDateLabel] = useState<Record<string, string>>({});
  const [newDateValue, setNewDateValue] = useState<Record<string, string>>({});
  const [focusDate, setFocusDate] = useState(() => selectedDate || todayKey());
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(null);
  const [activeNoteTabs, setActiveNoteTabs] = useState<Record<string, TextFieldKey>>({});
  const [chatInput, setChatInput] = useState('');
  const [aiChatOpen, setAiChatOpen] = useState(false);
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
  const pendingDateTextRef = useRef<Record<string, string>>({});

  // Debounce timer for Supabase sync
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSyncRef = useRef<{ clientName: string; note: ClientNote } | null>(null);

  // Debounced sync to Supabase
  const syncNoteToBackend = useCallback((clientName: string, note: ClientNote) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    pendingSyncRef.current = { clientName, note };
    syncTimerRef.current = setTimeout(() => {
      const pending = pendingSyncRef.current;
      if (!pending) return;
      const payload = mapNoteToPayload(pending.clientName, weekKey, pending.note);
      saveClientNote(payload as any).catch((err) => {
        console.warn('[MF] Supabase sync failed, localStorage is still saved:', err);
      });
      pendingSyncRef.current = null;
    }, 800);
  }, [weekKey]);

  // Load from Supabase on week change, fallback to localStorage
  useEffect(() => {
    const localNotes = loadNotesFromLocal(weekKey);
    setNotes(localNotes);

    fetchClientNotes(weekKey)
      .then((rows) => {
        if (rows.length > 0) {
          const merged: Record<string, ClientNote> = { ...localNotes };
          for (const row of rows) {
            const remoteNote = mapRowToNote(row);
            const localNote = localNotes[row.client_name];
            // Remote wins if local has no savedAt or remote is newer
            if (!localNote?.savedAt || (remoteNote.savedAt && remoteNote.savedAt > localNote.savedAt)) {
              merged[row.client_name] = remoteNote;
            }
          }
          setNotes(merged);
          saveNotesToLocal(weekKey, merged);
        }
      })
      .catch((err) => {
        console.warn('[MF] Failed to load notes from Supabase, using localStorage:', err);
      });
  }, [weekKey]);

  useEffect(() => {
    if (selectedDate) {
      setFocusDate(selectedDate);
      return;
    }

    const today = todayKey();
    const isTodayInWeek = weekDays.some((day) => day.key === today);
    setFocusDate(isTodayInWeek ? today : weekDays[0]?.key || today);
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
    const clientNames = clients.map((client) => client.name).join('、');
    const reportDate = formatReportDate(reportExportDate);
    const clientBlocks = clients.map((client) => {
      const note = notes[client.name] || DEFAULT_NOTE;
      const traffic = note.trafficLight || 'green';
      const linkedDates = (note.dateLinks || [])
        .map((link) => `${formatReportDate(link.date)} ${link.label}`)
        .join('、');
      const statusParts = [
        toCount(note.footage) ? `毛片 ${toCount(note.footage)}` : '',
        toCount(note.finished) ? `成片 ${toCount(note.finished)}` : '',
        toCount(note.editing) ? `已排程 ${toCount(note.editing)}` : '',
        toCount(note.planning) ? `本月未拍 ${toCount(note.planning)}` : '',
      ].filter(Boolean);
      const status = [
        statusParts.length > 0 ? statusParts.join('，') : '依本週紀錄追蹤中',
        linkedDates ? `相關日期：${linkedDates}` : '',
      ].filter(Boolean).join('。');

      const lines = [
        `【${client.name}】`,
        `目前狀態：${status}。`,
        `本週進度：${cleanReportText(note.progress) || '本週尚未補充進度。'}`,
        `下週推進：${cleanReportText(note.nextPush) || '下週推進事項待確認。'}`,
      ];

      if (traffic !== 'green') {
        lines.push(
          `需公司判斷：此案目前屬於${TRAFFIC_LIGHTS[traffic].label}，${cleanReportText(note.companyHelp) || TRAFFIC_LIGHTS[traffic].description}`,
        );
      } else if (cleanReportText(note.companyHelp)) {
        lines.push(`需公司協助：${cleanReportText(note.companyHelp)}`);
      }

      return lines.join('\n');
    }).join('\n\n');

    return [
      `這是 ${reportDate} 給老闆的 IP 進度通知。`,
      `匯出日：${reportExportDate}`,
      '',
      `這份通知會整理目前所有 IP 的進度，包含目前手上的客戶：${clientNames || '尚未建立客戶'}。`,
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

  const buildAssistantReply = (prompt: string) => {
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

  const sendChatMessage = (message?: string, meta?: string) => {
    const text = (message || chatInput).trim();
    if (!text) return;
    const timestamp = Date.now();
    setChatMessages((current) => ([
      ...current,
      { id: `${timestamp}-user-${current.length}`, role: 'user', text, meta },
      { id: `${timestamp}-assistant-${current.length}`, role: 'assistant', text: buildAssistantReply(text) },
    ]));
    if (!message) setChatInput('');
  };

  const sendSelectionToChat = (mode: 'add' | 'ask') => {
    if (!selectionDraft) return;
    const meta = `${selectionDraft.clientName} · ${FIELD_LABELS[selectionDraft.field]}`;
    const text = mode === 'add'
      ? `請幫我追這段：「${selectionDraft.text}」`
      : `請根據這段判斷下一步：「${selectionDraft.text}」`;
    sendChatMessage(text, meta);
  };

  const historyWeeks = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('MF_WEEKLY_CLIENT_NOTE_WEEKS') || '[]') as string[];
    } catch {
      return [];
    }
  }, [notes]);

  const updateNote = (clientName: string, patch: Partial<ClientNote>) => {
    setNotes((current) => {
      const next = {
        ...current,
        [clientName]: {
          ...DEFAULT_NOTE,
          ...(current[clientName] || {}),
          ...patch,
          savedAt: new Date().toISOString(),
        },
      };
      saveNotesToLocal(weekKey, next);
      syncNoteToBackend(clientName, next[clientName]);
      return next;
    });
  };

  const cycleTrafficLight = (clientName: string) => {
    const current = notes[clientName]?.trafficLight || DEFAULT_NOTE.trafficLight;
    const next = TRAFFIC_ORDER[(TRAFFIC_ORDER.indexOf(current) + 1) % TRAFFIC_ORDER.length];
    updateNote(clientName, { trafficLight: next });
  };

  const captureSelection = (clientName: string, field: TextFieldKey, target: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !target.contains(selection.anchorNode)) return;
    const selected = selection.toString().trim();
    if (selected.length < 2) return;
    const label = selected.length > 30 ? `${selected.slice(0, 30)}...` : selected;
    setSelectionDraft({ clientName, field, text: label });
    setNewDateLabel((value) => ({ ...value, [clientName]: label }));
  };

  const openInlineDateDraft = (clientName: string, field: TextFieldKey, value: string, target: HTMLElement, selectedText?: string) => {
    const triggerIndex = Math.max(value.lastIndexOf('@'), value.lastIndexOf('＠'));
    if (triggerIndex < 0) return;
    if (value.slice(triggerIndex + 1).trim()) return;
    const beforeTrigger = value.slice(0, triggerIndex).trim();
    const segments = beforeTrigger.split(/[，,。；;\n]/).map((segment) => segment.trim()).filter(Boolean);
    const rawLabel = segments[segments.length - 1] || beforeTrigger;
    const activeSelection = selectionDraft?.clientName === clientName && selectionDraft.field === field ? selectionDraft.text : '';
    const safeSelectedText = selectedText && !/^[@＠]+$/.test(selectedText) ? selectedText : '';
    const safeActiveSelection = activeSelection && !/^[@＠]+$/.test(activeSelection) ? activeSelection : '';
    const safeRawLabel = rawLabel && !/^[@＠]+$/.test(rawLabel) ? rawLabel : '';
    const labelSource = safeSelectedText || safeActiveSelection || (safeRawLabel.length >= 2 ? safeRawLabel : '新增日期連結');
    const label = labelSource.length > 30 ? `${labelSource.slice(0, 30)}...` : labelSource;
    const nextValue = `${value.slice(0, triggerIndex)}${value.slice(triggerIndex + 1)}`;
    target.innerText = nextValue;
    target.classList.toggle('is-empty', !nextValue.trim());
    pendingDateTextRef.current[`${clientName}::${field}`] = nextValue;
    setSelectionDraft({ clientName, field, text: label });
    setNewDateLabel((current) => ({ ...current, [clientName]: label }));
  };

  const updateNoteText = (clientName: string, field: TextFieldKey, value: string) => {
    const current = notes[clientName] || DEFAULT_NOTE;
    const dateLinks = (current.dateLinks || []).filter((link) => (
      link.field !== field || value.includes(link.label)
    ));
    if (field === 'progress') {
      updateNote(clientName, { progress: value, dateLinks });
      return;
    }
    if (field === 'nextPush') {
      updateNote(clientName, { nextPush: value, dateLinks });
      return;
    }
    updateNote(clientName, { companyHelp: value, dateLinks });
  };

  const getNoteText = (note: ClientNote, field: TextFieldKey) => {
    if (field === 'progress') return note.progress;
    if (field === 'nextPush') return note.nextPush;
    return note.companyHelp;
  };

  const getNotePlaceholder = (field: TextFieldKey) => {
    if (field === 'progress') return '本週進度。打完一句後按 @ 選日期';
    if (field === 'nextPush') return '下週要推進的事。打完一句後按 @ 選日期';
    return '緊急事項或公司協辦。打完一句後按 @ 選日期';
  };

  const addDateLink = (clientName: string, source?: string, dateOverride?: string) => {
    const activeSelection = selectionDraft?.clientName === clientName ? selectionDraft : null;
    const label = (newDateLabel[clientName] || activeSelection?.text || '').trim();
    const date = dateOverride || newDateValue[clientName];
    if (!label || !date) return;
    const current = notes[clientName] || DEFAULT_NOTE;
    const pendingField = activeSelection?.field;
    const pendingKey = pendingField ? `${clientName}::${pendingField}` : '';
    const pendingText = pendingKey ? pendingDateTextRef.current[pendingKey] : '';
    const patch: Partial<ClientNote> = {
      dateLinks: [
        ...(current.dateLinks || []),
        {
          id: `${Date.now()}`,
          label,
          date,
          source: source || (activeSelection ? FIELD_LABELS[activeSelection.field] : '手動日期'),
          field: activeSelection?.field,
        },
      ],
    };
    if (pendingField === 'progress') patch.progress = pendingText;
    if (pendingField === 'nextPush') patch.nextPush = pendingText;
    if (pendingField === 'companyHelp') patch.companyHelp = pendingText;
    updateNote(clientName, patch);
    if (pendingKey) delete pendingDateTextRef.current[pendingKey];
    setNewDateLabel((value) => ({ ...value, [clientName]: '' }));
    setNewDateValue((value) => ({ ...value, [clientName]: '' }));
    if (activeSelection) setSelectionDraft(null);
  };

  return (
    <section className="weekly-client-board">
      <div className="production-summary-strip">
        <div className="production-summary-primary">
          <span>目前總毛片數</span>
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
      </div>

      <div className="week-strip">
        {weekDays.map((day) => {
          const dayItems = calendarItems.filter((item) => item.date === day.key);
          const isToday = day.key === todayKey();
          const isFocused = day.key === focusDate;
          return (
            <div
              key={day.key}
              className={`week-strip-day ${isToday ? 'is-today' : ''} ${dayItems.length > 0 ? 'has-items' : ''} ${isFocused ? 'is-focused' : ''}`}
            >
              <button className="week-day-head week-day-select" onClick={() => setFocusDate(day.key)}>
                <strong>{day.label}</strong>
                <span>{day.day}</span>
              </button>
              <div className="week-day-items">
                {dayItems.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    className={`week-date-pill ${item.type}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setFocusDate(item.date);
                    }}
                  >
                    <span>{item.client}</span>
                    <strong>{item.label}</strong>
                  </button>
                ))}
                {dayItems.length > 4 && <small>+{dayItems.length - 4} 項</small>}
                {dayItems.length === 0 && <small className="empty-day-label">無連結</small>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="weekly-board-toolbar">
        <div>
          <span className="modal-eyebrow">Weekly Client Cards</span>
          <h2>本週業主便利貼</h2>
        </div>
        <div className="weekly-board-actions">
          <button className="ghost" onClick={() => setReportOpen((value) => !value)}>
            <Download size={15} />
            匯出週報
          </button>
          <button className="ghost" onClick={() => setHistoryOpen((value) => !value)}>
            <ChevronDown size={15} />
            查詢週版本
          </button>
        </div>
      </div>

      {reportOpen && (
        <div className="boss-report-panel">
          <div className="boss-report-head">
            <div>
              <span className="modal-eyebrow">Boss Weekly Report</span>
              <h3>給老闆的週進度通知</h3>
              <p>可隨時匯出。匯出日會寫進週報，也會留下最近匯出紀錄。</p>
            </div>
            <div className="boss-report-actions">
              <button className="ghost" onClick={copyWeeklyReport}>
                <Clipboard size={15} />
                {reportCopied ? '已複製' : '複製全文'}
              </button>
              <button className="ghost" onClick={downloadWeeklyReport}>
                <Download size={15} />
                下載 TXT
              </button>
            </div>
          </div>
          <div className="boss-report-controls">
            <label>
              匯出日
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
                  <small key={`${record.exportedAt}-${record.action}`}>
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
        </div>
      )}

      {historyOpen && (
        <div className="week-history">
          {historyWeeks.length === 0 ? (
            <span>尚無歷史週版本。修改便利貼後會自動保存。</span>
          ) : (
            historyWeeks.map((week) => <span key={week}>{week}</span>)
          )}
        </div>
      )}

      <div className="weekly-board-split">
        <div className="client-row-list">
          {clientMap.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-100 text-gray-500 gap-4">
              <LayoutDashboard className="w-12 h-12 text-gray-300" />
              <p>尚未建立客戶，請透過下方輸入框新增。</p>
            </div>
          ) : clientMap.map((client) => {
            const note = notes[client.name] || DEFAULT_NOTE;
            const trafficLight = note.trafficLight || 'green';
            const traffic = TRAFFIC_LIGHTS[trafficLight];
            const activeField = activeNoteTabs[client.name] || 'progress';
            return (
              <article key={client.name} className={`weekly-client-row light-${trafficLight}`}>
                <div className="client-row-main">
                  <button
                    className={`traffic-light-button ${trafficLight}`}
                    onClick={() => cycleTrafficLight(client.name)}
                    title={`${traffic.label}：${traffic.description}`}
                    aria-label={`${client.name} ${traffic.label}`}
                  >
                    <span />
                  </button>
                  <div>
                    <Building2 size={17} />
                    <strong>{client.name}</strong>
                  </div>
                  <span>{traffic.label} · {traffic.short}</span>
                  <small>{note.savedAt ? `已保存 ${formatDateOnly(note.savedAt)}` : '本週新卡'}</small>
                </div>

                <div className="client-row-stats">
                  <label><Film size={14} />毛片<input value={note.footage} onChange={(event) => updateNote(client.name, { footage: event.target.value })} placeholder="3" /></label>
                  <label><Sparkles size={14} />成片<input value={note.finished} onChange={(event) => updateNote(client.name, { finished: event.target.value })} placeholder="1" /></label>
                  <label><CalendarClock size={14} />已排程<input value={note.editing} onChange={(event) => updateNote(client.name, { editing: event.target.value })} placeholder="2" /></label>
                  <label><ScrollText size={14} />本月未拍<input value={note.planning} onChange={(event) => updateNote(client.name, { planning: event.target.value })} placeholder="1" /></label>
                </div>

                <div className="client-note-cell">
                  <div className="client-note-tabs" role="tablist" aria-label={`${client.name} 週便利貼分類`}>
                    {(Object.keys(FIELD_LABELS) as TextFieldKey[]).map((field) => (
                      <button
                        key={field}
                        type="button"
                        className={`client-note-tab ${activeField === field ? 'active' : ''}`}
                        onClick={() => setActiveNoteTabs((current) => ({ ...current, [client.name]: field }))}
                        role="tab"
                        aria-selected={activeField === field}
                      >
                        {FIELD_LABELS[field]}
                      </button>
                    ))}
                  </div>
                  <InlineDateNote
                    clientName={client.name}
                    label={FIELD_LABELS[activeField]}
                    value={getNoteText(note, activeField)}
                    links={note.dateLinks || []}
                    field={activeField}
                    placeholder={getNotePlaceholder(activeField)}
                    draft={selectionDraft}
                    dateValue={newDateValue[client.name] || ''}
                    onChange={(value) => updateNoteText(client.name, activeField, value)}
                    onInlineDateTrigger={(value, target, selectedText) => openInlineDateDraft(client.name, activeField, value, target, selectedText)}
                    onSelectText={(target) => captureSelection(client.name, activeField, target)}
                    onOpenDate={setFocusDate}
                    onDateChange={(value) => setNewDateValue((current) => ({ ...current, [client.name]: value }))}
                    onCreateLink={() => addDateLink(client.name)}
                    onCreateLinkForDate={(date) => addDateLink(client.name, undefined, date)}
                    onAddToChat={() => sendSelectionToChat('add')}
                    onAskAI={() => sendSelectionToChat('ask')}
                  />
                </div>

                <div className="client-task-lists">
                  {(['待拍攝', '待確認事項'] as const).map(type => (
                    <div key={type} className="client-task-list">
                      <strong>{type}</strong>
                      <div className="client-task-items">
                        {client.tasks.filter(t => t.task_type === type || (type === '待確認事項' && t.category === '待確認事項') || (type === '待拍攝' && t.category === '待拍攝')).map(t => (
                          <div key={t.id} className="client-task-item" onClick={() => onEditTask(t)}>
                            <span className="status-dot" data-status={t.status} />
                            <span>{t.title}</span>
                            {t.deadline && <small className="task-deadline">{formatDateOnly(t.deadline)}</small>}
                          </div>
                        ))}
                      </div>
                      {onCreateTask && (
                        <input 
                          type="text" 
                          placeholder={`+ 新增${type}... (按 Enter 儲存)`}
                          className="compact-task-input"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                              onCreateTask(client.name, type, e.currentTarget.value.trim());
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>

              </article>
            );
          })}
        </div>

        {/* 新增客戶輸入框 */}
        <div className="mt-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <input
            type="text"
            className="w-full bg-gray-50 border-none outline-none text-gray-700 placeholder-gray-400 py-2 px-3 rounded text-sm focus:ring-1 focus:ring-emerald-500"
            placeholder="+ 輸入新客戶名稱並按下 Enter 建立"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            onKeyDown={handleCreateClient}
          />
        </div>

        <aside className="week-focus-panel">
          <div className="focus-panel-head">
            <span className="modal-eyebrow">Selected Date</span>
            <h3>{focusedDay ? `${focusedDay.label} ${focusedDay.day}` : focusDate}</h3>
            <p>{focusDate}</p>
          </div>

          <div className="focus-item-list">
            {focusedItems.length === 0 ? (
              <div className="focus-empty">
                <Link2 size={18} />
                <strong>這天還沒有日期連結</strong>
                <span>在便利貼裡反白「21號收款」這種文字並指定日期後，它會出現在這裡和上方週曆。</span>
              </div>
            ) : (
              focusedItems.map((item) => (
                <div key={item.id} className={`focus-item ${item.type}`}>
                  <span>{item.client}{item.source ? ` · ${item.source}` : ''}</span>
                  <strong>{item.label}</strong>
                  {item.type !== 'date-link' && item.item && (
                    <button
                      className="ghost compact"
                      onClick={() => item.type === 'task' ? onEditTask(item.item as TaskRow) : onEditEvent(item.item as CalendarIntentRow)}
                    >
                      編輯來源
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="assistant-reminder-box">
            <div>
              <span className="modal-eyebrow">AI Assistant</span>
              <h4>接下來會追你</h4>
            </div>
            {clients
              .map((client) => ({
                name: client.name,
                light: (notes[client.name]?.trafficLight || 'green') as TrafficLight,
              }))
              .filter((client) => client.light !== 'green')
              .map((client) => (
                <div key={`light-${client.name}`} className={`assistant-light-alert ${client.light}`}>
                  <strong>{client.name} · {TRAFFIC_LIGHTS[client.light].label}</strong>
                  <span>{TRAFFIC_LIGHTS[client.light].description}</span>
                </div>
              ))}
            {assistantReminders.length === 0 ? (
              <p>目前 14 天內沒有日期連結。你框選文字並指定日期後，助理會把它列入追蹤。</p>
            ) : (
              assistantReminders.map((item) => {
                const urgency = item.days === 0 ? 'is-today' : item.days <= 3 ? 'is-soon' : 'is-normal';
                return (
                <button
                  key={`assistant-${item.id}`}
                  className={`assistant-reminder-card ${urgency}`}
                  onClick={() => setFocusDate(item.date)}
                >
                  <strong>{item.client}</strong>
                  <span>{item.label}</span>
                  <small>{item.days === 0 ? '今天' : `${item.days} 天後`} · {item.date}</small>
                </button>
                );
              })
            )}
          </div>

          <div className={`ai-chat-panel ${aiChatOpen ? 'open' : 'collapsed'}`}>
            <button
              type="button"
              className="ai-chat-toggle"
              onClick={() => setAiChatOpen((value) => !value)}
              aria-expanded={aiChatOpen}
            >
              <span>
                <MessageCircle size={17} />
                AI 助理
              </span>
              <ChevronDown size={15} />
            </button>
            {aiChatOpen && (
              <div className="ai-chat-body">
                <div className="ai-chat-head">
              <div>
                <span className="modal-eyebrow">Chat With AI</span>
                <h4>側邊助理</h4>
              </div>
              <MessageCircle size={18} />
            </div>
            <div className="ai-chat-messages" aria-live="polite">
              {chatMessages.map((message) => (
                <div key={message.id} className={`ai-chat-message ${message.role}`}>
                  {message.meta && <small>{message.meta}</small>}
                  <span>{message.text}</span>
                </div>
              ))}
            </div>
            <form
              className="ai-chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                sendChatMessage();
              }}
            >
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="問 AI：這週誰需要追？"
                aria-label="問 AI"
              />
              <button type="submit" aria-label="送出問題">
                <Send size={15} />
              </button>
            </form>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
