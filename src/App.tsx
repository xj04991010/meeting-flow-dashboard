import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Calendar, LayoutDashboard, RefreshCcw, Settings } from 'lucide-react';
import './App.css';

import type { CalendarIntentRow, TaskRow, UserRow } from './types';
import {
  fetchWeeklyDashboard,
  getGoogleAuthUrl,
  updateCalendarIntent,
  updateTask,
  createManualEntry,
  fetchClients,
  createClient,
  DashboardAuthError
} from './api';

import { EditModal } from './components/EditModal';
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
  const [clients, setClients] = useState<any[]>([]);
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
  const [authRequired, setAuthRequired] = useState(false);

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
      setAllTasks(payload.tasks || []);
      setAllEvents(payload.calendarIntents || []);
      
      const clientsData = await fetchClients();
      setClients(clientsData || []);
      setAuthRequired(false);
    } catch (error) {
      if (error instanceof DashboardAuthError) setAuthRequired(true);
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
  };  const closeEditor = () => {
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

  const handleCreateTask = async (clientName: string, taskType: string, title: string) => {
    try {
      await createManualEntry({
        text: title,
        client: clientName,
        category: taskType,
      });
      await fetchData();
    } catch (err) {
      console.error('Create task error:', err);
    }
  };

  const handleCreateClient = async (name: string) => {
    try {
      await createClient({ name, status: 'active' });
      await fetchData();
    } catch (err) {
      console.error('Create client error:', err);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <Activity className="spin" />
        <span>載入儀表板</span>
      </div>
    );
  }

  if (authRequired) {
    return (
      <main className="auth-required-page">
        <section className="auth-required-panel" aria-labelledby="auth-required-title">
          <div className="auth-required-icon" aria-hidden="true">
            <AlertTriangle size={24} />
          </div>
          <div>
            <span className="section-kicker">需要重新連線</span>
            <h1 id="auth-required-title">Dashboard 登入連結已失效</h1>
            <p>請回到 Telegram 對 MeetingFlow 輸入 <strong>/start</strong>，再點一次「開啟 Dashboard」。新的連結會自動恢復你的客戶資料與週進度。</p>
          </div>
          <button type="button" onClick={() => window.location.reload()}>
            <RefreshCcw size={16} />
            我已重新開啟，重新檢查
          </button>
        </section>
      </main>
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
            <p>客戶週控與秘書追蹤</p>
          </div>
        </div>

        <div className="header-actions">
          {selectedDate && (
            <button className="ghost subtle" onClick={() => setSelectedDate('')}>
              回到本週
            </button>
          )}
          <label className="date-control">
            <Calendar size={16} />
            <span>查看日期</span>
            <input
              type="date"
              className="date-selector-input"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              aria-label="選擇週視圖日期"
            />
          </label>
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
        <WeeklyClientBoard
          tasks={allTasks}
          events={allEvents}
          clients={clients}
          selectedDate={selectedDate}
          onEditTask={(task) => setEditing({ type: 'task', item: task })}
          onEditEvent={(event) => setEditing({ type: 'event', item: event })}
          onCreateTask={handleCreateTask}
          onCreateClient={handleCreateClient}
        />
      </section>

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
