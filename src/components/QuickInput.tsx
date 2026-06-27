import { useMemo, useState } from 'react';
import { CalendarDays, Link2, Loader2, Plus } from 'lucide-react';
import { createManualEntry } from '../api';

type QuickInputProps = {
  onSuccess: () => void;
};

function todayDateInput() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

export function QuickInput({ onSuccess }: QuickInputProps) {
  const [text, setText] = useState('');
  const [client, setClient] = useState('');
  const [linkedDate, setLinkedDate] = useState(todayDateInput);
  const [loading, setLoading] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const linkedDateTime = useMemo(() => {
    if (!linkedDate) return null;
    return `${linkedDate}T12:00:00+08:00`;
  }, [linkedDate]);

  const handleSubmit = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setLastSaved(null);

    try {
      await createManualEntry({
        text: text.trim(),
        client: client.trim() || undefined,
        category: client.trim() || '專案紀錄',
        linked_date: linkedDateTime,
      });
      setLastSaved(linkedDate || '未排程');
      setText('');
      onSuccess();
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : '建立紀錄失敗，請稍後重試。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel quick-input-panel">
      <div className="panel-title">
        <div className="panel-title-main">
          <Link2 size={18} />
          <h2>新增專案紀錄</h2>
        </div>
      </div>

      <div className="quick-input-body">
        <div className="manual-entry-grid">
          <label>
            <span>客戶 / 專案</span>
            <input
              value={client}
              onChange={(event) => setClient(event.target.value)}
              placeholder="例如：水果王、茶好玩、NINI"
              disabled={loading}
            />
          </label>
          <label>
            <span>連結日期</span>
            <input
              type="date"
              value={linkedDate}
              onChange={(event) => setLinkedDate(event.target.value)}
              disabled={loading}
            />
          </label>
        </div>

        <label className="manual-entry-text">
          <span>一句紀錄</span>
          <textarea
            placeholder="例如：5/20 要去找水果王拍片，先確認場地與腳本。這句會成為可點擊紀錄，並出現在週曆/月曆。"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={loading}
          />
        </label>

        <div className="manual-entry-meta">
          <span>{text.trim().length} 字</span>
          <span>
            <CalendarDays size={13} />
            {linkedDate || '未排程'}
          </span>
        </div>

        {lastSaved && (
          <div className="quick-result all-clear">
            <Link2 size={16} />
            <span>已建立紀錄並連結到 {lastSaved}</span>
          </div>
        )}

        <button className="primary-action full-width" onClick={handleSubmit} disabled={loading || !text.trim()}>
          {loading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
          {loading ? '建立中' : '建立紀錄'}
        </button>
      </div>
    </section>
  );
}
