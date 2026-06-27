import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Calendar, CheckSquare, LayoutDashboard, RefreshCcw, Settings } from 'lucide-react';
import './App.css';

import type { CalendarIntentRow, SourceBatchRow, TaskRow, UserRow, WeekBucket } from './types';
import {
  confirmCalendarIntent,
  fetchWeeklyDashboard,
  getGoogleAuthUrl,
  updateCalendarIntent,
  updateTask,
  updateTaskStatus,
} from './api';

import { BatchList } from './components/BatchList';
import { EditModal } from './components/EditModal';
import { ReviewPanel } from './components/ReviewPanel';
import { SettingsModal, TAIWAN_CITIES } from './components/SettingsModal';
import { WeeklyClientBoard } from './components/WeeklyClientBoard';

const WEATHER_LABELS: Record<number, string> = {
  0: '晴',
  1: '晴時多雲',
  2: '多雲',
  3: '陰',
  45: '霧',
  48: '霧',
  51: '毛雨',
  53: '毛雨',
  55: '毛雨',
  56: '凍雨',
  57: '凍雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '凍雨',
  67: '凍雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '陣雨',
  81: '陣雨',
  82: '強陣雨',
  85: '陣雪',
  86: '強陣雪',
  95: '雷雨',
  96: '雷雨',
  99: '雷雨',
};

function App() {
  const [user, setUser] = useState<UserRow | null>(null);
  const [, setWeekView] = useState<WeekBucket[]>([]);
  const [batches, setBatches] = useState<SourceBatchRow[]>([]);
  const [allTasks, setAllTasks] = useState<TaskRow[]>([]);
  const [allEvents, setAllEvents] = useState<CalendarIntentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ type: 'task'; item: TaskRow } | { type: 'event'; item: CalendarIntentRow } | null>(null);
  const [saving, setSaving] = useState(false);
  const [, setWeatherMap] = useState<Record<string, { label: string; max: number; min: number }>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [preferredCity, setPreferredCity] = useState(localStorage.getItem('preferredCity') || '自動定位');
  const [selectedDate, setSelectedDate] = useState('');
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid');
    if (!uid) return;

    localStorage.setItem('MF_USER_ID', uid);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      setDashboardError(null);
      const payload = await fetchWeeklyDashboard(selectedDate);
      setUser(payload.user || null);
      setWeekView(payload.week_view || []);
      setBatches(payload.batches || []);
      setAllTasks(payload.tasks || []);
      setAllEvents(payload.calendarIntents || []);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : '資料同步失敗');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  const fetchWeather = async (forceCity?: string) => {
    const targetCity = forceCity || preferredCity;
    const todayStr = new Date().toLocaleString('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const cachedDate = localStorage.getItem('weatherCacheDate');
    const cachedCity = localStorage.getItem('weatherCacheCity');
    const cachedData = localStorage.getItem('weatherCacheData');

    if (!forceCity && cachedDate === todayStr && cachedCity === targetCity && cachedData) {
      try {
        setWeatherMap(JSON.parse(cachedData));
        return;
      } catch (error) {
        console.error('Failed to parse cached weather', error);
      }
    }

    const getWeather = async (lat: number, lon: number) => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTaipei`);
        const data = await res.json();
        const nextWeatherMap: Record<string, { label: string; max: number; min: number }> = {};

        if (data.daily) {
          for (let i = 0; i < data.daily.time.length; i += 1) {
            nextWeatherMap[data.daily.time[i]] = {
              label: WEATHER_LABELS[data.daily.weathercode[i]] || '天氣',
              max: Math.round(data.daily.temperature_2m_max[i]),
              min: Math.round(data.daily.temperature_2m_min[i]),
            };
          }
        }

        setWeatherMap(nextWeatherMap);
        localStorage.setItem('weatherCacheDate', todayStr);
        localStorage.setItem('weatherCacheCity', targetCity);
        localStorage.setItem('weatherCacheData', JSON.stringify(nextWeatherMap));
      } catch (error) {
        console.error('Failed to fetch weather', error);
      }
    };

    if (targetCity !== '自動定位') {
      const cityConfig = TAIWAN_CITIES.find((city) => city.name === targetCity);
      if (cityConfig) {
        await getWeather(cityConfig.lat, cityConfig.lon);
        return;
      }
    }

    if (!navigator.geolocation) {
      await getWeather(25.0478, 121.5319);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void getWeather(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.log('Geolocation denied or failed, defaulting to Taipei.', error);
        void getWeather(25.0478, 121.5319);
      },
    );
  };

  useEffect(() => {
    void fetchData();
    void fetchWeather();
    const intervalId = window.setInterval(fetchData, 60_000);
    return () => window.clearInterval(intervalId);
  }, [fetchData]);

  const handleSaveSettings = (city: string, aiSettings: { provider: string; model: string; apiKey: string }) => {
    void aiSettings;
    setPreferredCity(city);
    localStorage.setItem('preferredCity', city);
    setShowSettings(false);
    void fetchWeather(city);
  };

  const handleConfirmTask = async (taskId: string) => {
    await updateTaskStatus(taskId, 'pending');
    await fetchData();
  };

  const handleConfirmEvent = async (eventId: string) => {
    await confirmCalendarIntent(eventId);
    await fetchData();
  };

  const closeEditor = () => {
    if (!saving) setEditing(null);
  };

  const saveEdit = async (data: Record<string, unknown>) => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      if (editing.type === 'task') {
        await updateTask(editing.item.id, data);
      } else {
        await updateCalendarIntent(editing.item.id, data);
      }
      await fetchData();
      setEditing(null);
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('確定要移除此任務？')) return;
    try {
      await updateTaskStatus(taskId, 'cancelled');
      await fetchData();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm('確定要移除此行程？')) return;
    try {
      await updateCalendarIntent(eventId, { status: 'cancelled' });
      await fetchData();
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const reviewTasks = useMemo(() => allTasks.filter((task) => task.needs_review || task.status === 'needs_review'), [allTasks]);
  const reviewEvents = useMemo(() => allEvents.filter((event) => event.needs_review || event.status === 'needs_review'), [allEvents]);
  const activeTaskCount = useMemo(() => allTasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled').length, [allTasks]);
  const completedTaskCount = useMemo(() => allTasks.filter((task) => task.status === 'completed').length, [allTasks]);
  const activeEventCount = useMemo(() => allEvents.filter((event) => event.status !== 'cancelled').length, [allEvents]);
  const syncedEventCount = useMemo(() => allEvents.filter((event) => event.sync_status === 'synced').length, [allEvents]);
  const reviewCount = reviewTasks.length + reviewEvents.length;

  if (loading) {
    return (
      <div className="loading">
        <Activity className="spin" />
        <span>載入儀表板</span>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark">
            <LayoutDashboard size={22} />
          </div>
          <div>
            <h1>MeetingFlow</h1>
            <p>客戶專案管理、日期連結與秘書追蹤</p>
          </div>
        </div>

        <div className="header-actions">
          {selectedDate && (
            <button className="ghost subtle" onClick={() => setSelectedDate('')}>
              回到本週
            </button>
          )}
          <input
            type="date"
            className="date-selector-input"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            title="選擇週視圖日期"
          />
          {user?.is_calendar_authorized ? (
            <span className="connection-pill connected">
              <Calendar size={15} />
              Google Calendar 已連接
            </span>
          ) : (
            <button className="primary-action" onClick={() => { window.location.href = getGoogleAuthUrl(user?.id || ''); }}>
              <Calendar size={16} />
              連接 Google Calendar
            </button>
          )}
          <button className="icon-button" onClick={() => setShowSettings(true)} title="設定">
            <Settings size={19} />
          </button>
          <button className="icon-button" onClick={() => { void fetchData(); }} title="重新整理">
            <RefreshCcw size={19} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {dashboardError && (
        <div className="system-notice dashboard-alert" role="status">
          <AlertTriangle size={16} />
          <span>資料同步失敗：{dashboardError}</span>
          <button className="ghost compact" onClick={() => { void fetchData(); }}>
            重新整理
          </button>
        </div>
      )}

      <section className="calendar-priority" aria-label="週曆主工作區">
        <div className="calendar-section-header">
          <div>
            <span className="modal-eyebrow">Weekly Control Board</span>
            <h2>本週業主控管</h2>
          </div>
          <div className="calendar-inline-stats">
            <span>需補充 {reviewCount}</span>
            <span>客戶 {new Set(allTasks.map((task) => task.client || task.category).filter(Boolean)).size}</span>
            <span>追蹤 {activeTaskCount}</span>
            <span>行程 {activeEventCount}</span>
          </div>
        </div>

        <WeeklyClientBoard
          tasks={allTasks}
          events={allEvents}
          selectedDate={selectedDate}
          onEditTask={(task) => setEditing({ type: 'task', item: task })}
          onEditEvent={(event) => setEditing({ type: 'event', item: event })}
        />
      </section>

      <main className="operations-layout">
        <section className="secondary-workspace">
          <section className="panel secretary-panel">
            <div className="panel-title">
              <div className="panel-title-main">
                <Calendar size={18} />
                <h2>秘書追蹤提示</h2>
              </div>
            </div>
            <div className="secretary-note">
              前三天提醒、發片快到期、毛片/待剪/企劃狀態，之後會從每週便利貼和 Google Calendar 事件一起判斷。
            </div>
          </section>
        </section>

        <aside className="sidebar support-sidebar">
          <ReviewPanel
            tasks={reviewTasks}
            events={reviewEvents}
            onConfirmTask={handleConfirmTask}
            onConfirmEvent={handleConfirmEvent}
            onEditTask={(task) => setEditing({ type: 'task', item: task })}
            onEditEvent={(event) => setEditing({ type: 'event', item: event })}
            onDeleteTask={handleDeleteTask}
            onDeleteEvent={handleDeleteEvent}
          />
          <section className="summary-strip compact" aria-label="本週摘要">
            <div className="metric-card attention">
              <AlertTriangle size={18} />
              <div>
                <span>需補充</span>
                <strong>{reviewCount}</strong>
              </div>
            </div>
            <div className="metric-card">
              <CheckSquare size={18} />
              <div>
                <span>未完成任務</span>
                <strong>{activeTaskCount}</strong>
              </div>
            </div>
            <div className="metric-card">
              <Calendar size={18} />
              <div>
                <span>有效行程</span>
                <strong>{activeEventCount}</strong>
              </div>
            </div>
            <div className="metric-card success">
              <Activity size={18} />
              <div>
                <span>完成 / 同步</span>
                <strong>{completedTaskCount} / {syncedEventCount}</strong>
              </div>
            </div>
          </section>
          <BatchList batches={batches} />
        </aside>
      </main>

      {editing && (
        <EditModal
          editing={editing}
          onSave={saveEdit}
          onClose={closeEditor}
          saving={saving}
        />
      )}

      {showSettings && (
        <SettingsModal
          initialCity={preferredCity}
          user={user}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default App;
