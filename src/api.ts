/**
 * MeetingFlow API Hooks — 唯一的資料存取層
 * ============================================
 * ⛔ 禁止在元件中直接寫 fetch()
 * ⛔ 禁止新增 API 端點（除非後端先新增了對應的 route）
 * ⛔ 禁止直連 Supabase
 * ✅ 所有元件必須透過此檔案的函式存取後端
 */

import type { WeeklyDashboardResponse, ClientWeeklyNoteRow, ClientRow, DocumentRow, ClientCalendarDateLink } from './types';



export type ManualEntryInput = {
  text: string;
  client?: string;
  category?: string;
  linked_date?: string | null;
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3000';
const DEFAULT_DEV_USER_ID = '6578915a-d33e-4eed-8d22-a3e334480f56';

export class DashboardAuthError extends Error {
  readonly status = 401;

  constructor() {
    super('登入連結已失效，請回到 Telegram 重新開啟 MeetingFlow Dashboard。');
    this.name = 'DashboardAuthError';
  }
}

function getUrlParam(...names: string[]): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  for (const name of names) {
    const value = params.get(name);
    if (value) return value;
  }
  return null;
}

function primeDashboardCredentialsFromUrl() {
  if (typeof window === 'undefined') return;

  const uid = getUrlParam('uid', 'user_id');
  const token = getUrlParam('token', 'dashboard_token', 'access_token');

  if (uid) window.localStorage.setItem('MF_USER_ID', uid);
  if (token) window.localStorage.setItem('MF_DASHBOARD_TOKEN', token);
}

primeDashboardCredentialsFromUrl();

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const telegramWindow = typeof window !== 'undefined'
    ? window as Window & { Telegram?: { WebApp?: { initData?: string } } }
    : undefined;
  const telegramInitData = telegramWindow?.Telegram?.WebApp?.initData;

  if (telegramInitData) {
    headers['Authorization'] = `tma ${telegramInitData}`;
  } else {
    const userId = localStorage.getItem('dev_auth_token') || localStorage.getItem('MF_USER_ID') || DEFAULT_DEV_USER_ID;
    const dashboardToken = localStorage.getItem('MF_DASHBOARD_TOKEN');

    if (dashboardToken) {
      headers['Authorization'] = `dashboard ${dashboardToken}`;
      headers['X-Dashboard-User-Id'] = userId;
    } else if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(BACKEND_URL)) {
      headers['Authorization'] = `tma ${userId}`;
    } else {
      throw new DashboardAuthError();
    }
  }
  return headers;
}

async function throwApiError(response: Response, fallbackMessage: string): Promise<never> {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  const detail = body?.error || body?.message;
  if (response.status === 401) {
    if (typeof window !== 'undefined') window.localStorage.removeItem('MF_DASHBOARD_TOKEN');
    throw new DashboardAuthError();
  }
  throw new Error(detail ? `${fallbackMessage}: ${detail}` : `${fallbackMessage}: ${response.status}`);
}

// ─── 讀取 ─────────────────────────────────

/** 取得周曆視圖資料（含所有 tasks, events, batches） */
export async function fetchWeeklyDashboard(dateStr?: string): Promise<WeeklyDashboardResponse> {
  const url = new URL(`${BACKEND_URL}/api/dashboard/weekly`);
  if (dateStr) {
    url.searchParams.append('date', dateStr);
  }
  
  const res = await fetch(url.toString(), {
    headers: getAuthHeaders()
  });
  if (!res.ok) await throwApiError(res, '讀取儀表板失敗');
  return res.json();
}

/** 取得深度研究報告列表 */
export async function fetchDocuments(): Promise<{ documents: DocumentRow[] }> {
  const res = await fetch(`${BACKEND_URL}/api/documents`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) await throwApiError(res, '讀取文件失敗');
  return res.json();
}

// ─── 任務操作 ───────────────────────────────

/** 更新任務狀態（Kanban 用） */
export async function updateTaskStatus(taskId: string, status: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/tasks/${taskId}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) await throwApiError(res, '更新任務狀態失敗');
}

/** 編輯任務（title, client, owner, deadline, status, needs_review） */
export async function updateTask(taskId: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, '更新任務失敗');
}

// ─── 行程操作 ───────────────────────────────

/** 編輯行程（title, client, location, start_time, end_time, status, sync_status, needs_review） */
export async function updateCalendarIntent(intentId: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/calendar-intents/${intentId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, '更新行程失敗');
}

export async function updateCalendarIntentStatus(id: string, status: string, sync_status: string) {
  const res = await fetch(`${BACKEND_URL}/api/calendar-intents/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status, sync_status })
  });
  if (!res.ok) await throwApiError(res, '更新行程狀態失敗');
}



export async function createManualEntry(input: ManualEntryInput) {
  const res = await fetch(`${BACKEND_URL}/api/manual-entry`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to create manual entry');
  }
  return res.json();
}

export async function getUserSettings() {
  const res = await fetch(`${BACKEND_URL}/api/user-settings`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) await throwApiError(res, '讀取設定失敗');
  return res.json();
}

export async function saveUserSettings(settings: Record<string, unknown>) {
  const res = await fetch(`${BACKEND_URL}/api/user-settings`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(settings)
  });
  if (!res.ok) await throwApiError(res, '儲存設定失敗');
  return res.json();
}

/** 確認行程（將 status 設為 ready，needs_review 設為 false） */
export async function confirmCalendarIntent(intentId: string): Promise<void> {
  await updateCalendarIntent(intentId, { status: 'ready', needs_review: false });
}

// ─── 業主筆記（Client Weekly Notes） ──────────

/** 取得某週所有業主筆記 */
export async function fetchClientNotes(weekKey: string, inherit = true): Promise<ClientWeeklyNoteRow[]> {
  const url = new URL(`${BACKEND_URL}/api/client-notes`);
  url.searchParams.append('week_key', weekKey);
  url.searchParams.append('inherit', inherit ? 'true' : 'false');
  const res = await fetch(url.toString(), { headers: getAuthHeaders() });
  if (!res.ok) {
    await throwApiError(res, 'Failed to fetch client notes');
  }
  const data = await res.json();
  return data.notes || data || [];
}

export async function fetchClientNoteWeeks(): Promise<string[]> {
  const res = await fetch(`${BACKEND_URL}/api/client-note-weeks`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) await throwApiError(res, '讀取週版本失敗');
  const data = await res.json() as { weeks?: string[] };
  return data.weeks || [];
}

export async function fetchClientDateLinks(month: string): Promise<ClientCalendarDateLink[]> {
  const url = new URL(`${BACKEND_URL}/api/client-date-links`);
  url.searchParams.set('month', month);
  const res = await fetch(url.toString(), { headers: getAuthHeaders() });
  if (!res.ok) await throwApiError(res, '讀取月曆日期連結失敗');
  const data = await res.json() as { links?: ClientCalendarDateLink[] };
  return data.links || [];
}

export async function askClientAssistant(message: string, weekKey: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/client-assistant`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message, week_key: weekKey }),
  });
  if (!res.ok) await throwApiError(res, 'AI 助理暫時無法回答');
  const data = await res.json() as { answer?: string };
  if (!data.answer) throw new Error('AI 助理沒有回傳內容');
  return data.answer;
}

/** 儲存單一業主的週筆記（upsert） */
export async function saveClientNote(note: Omit<ClientWeeklyNoteRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/client-notes`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(note),
  });
  if (!res.ok) {
    await throwApiError(res, 'Failed to save client note');
  }
}

/** 批次儲存所有業主的週筆記 */
export async function batchSaveClientNotes(
  weekKey: string,
  notes: Array<Omit<ClientWeeklyNoteRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>,
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/client-notes/batch`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ week_key: weekKey, notes }),
  });
  if (!res.ok) {
    await throwApiError(res, 'Failed to batch save client notes');
  }
}

// ─── 業主管理（Clients） ────────────────────────

/** 取得所有業主 */
export async function fetchClients(): Promise<ClientRow[]> {
  const res = await fetch(`${BACKEND_URL}/api/clients`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    await throwApiError(res, 'Failed to fetch clients');
  }
  const data = await res.json();
  return data.clients || data || [];
}

/** 新增業主 */
export async function createClient(client: Omit<ClientRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<ClientRow> {
  const res = await fetch(`${BACKEND_URL}/api/clients`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(client),
  });
  if (!res.ok) await throwApiError(res, '新增客戶失敗');
  return res.json();
}

/** 更新業主 */
export async function updateClient(clientId: string, data: Partial<ClientRow>): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/clients/${clientId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, '更新客戶失敗');
}

// ─── Google Calendar 同步 ────────────────────

export async function checkGoogleAuthStatus(): Promise<{ hasAuth: boolean }> {
  const res = await fetch(`${BACKEND_URL}/api/auth/google/status`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) await throwApiError(res, '檢查 Google Calendar 連線失敗');
  return res.json();
}

/** 同步單筆行程到 Google Calendar */
export async function syncEventToGoogle(eventId: string): Promise<{ success: boolean; error?: string; code?: string }> {
  const res = await fetch(`${BACKEND_URL}/api/calendar-intents/${eventId}/sync`, { 
    method: 'POST',
    headers: getAuthHeaders()
  });
  return res.json();
}

/** Google OAuth 授權 URL */
export function getGoogleAuthUrl(userId: string): string {
  // 由於這是外跳連結，我們可以直接帶 user_id，或者後端透過 session 處理。
  // 但因為 OAuth flow 需要 user_id state，所以這保留原樣。
  return `${BACKEND_URL}/auth/google?user_id=${userId}`;
}
