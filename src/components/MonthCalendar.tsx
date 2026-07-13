import { memo, useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import type { CalendarIntentRow, ClientCalendarDateLink, TaskRow } from '../types';

type MonthCalendarProps = {
  tasks: TaskRow[];
  events: CalendarIntentRow[];
  dateLinks: ClientCalendarDateLink[];
  selectedDate: string;
  onEditTask: (task: TaskRow) => void;
  onEditEvent: (event: CalendarIntentRow) => void;
  onOpenDate: (date: string) => void;
};

function toDateKey(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

export const MonthCalendar = memo(function MonthCalendar({
  tasks,
  events,
  dateLinks,
  selectedDate,
  onEditTask,
  onEditEvent,
  onOpenDate,
}: MonthCalendarProps) {
  const monthBase = useMemo(() => selectedDate ? new Date(selectedDate) : new Date(), [selectedDate]);
  const gridStart = useMemo(() => {
    const monthStart = new Date(monthBase.getFullYear(), monthBase.getMonth(), 1);
    const start = new Date(monthStart);
    start.setDate(monthStart.getDate() - monthStart.getDay());
    return start;
  }, [monthBase]);

  const cells = useMemo(() => {
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
      return {
        key,
        day: date.getDate(),
        inMonth: date.getMonth() === monthBase.getMonth(),
        tasks: tasks.filter((task) => task.status !== 'cancelled' && toDateKey(task.deadline) === key),
        events: events.filter((event) => event.status !== 'cancelled' && toDateKey(event.start_time) === key),
        dateLinks: dateLinks.filter((link) => link.date === key),
      };
    });
  }, [dateLinks, events, gridStart, monthBase, tasks]);

  return (
    <section className="panel month-calendar-panel">
      <div className="panel-title">
        <div className="panel-title-main">
          <CalendarDays size={18} />
          <h2>月曆總覽</h2>
        </div>
        <span className="badge">{monthBase.getFullYear()} / {monthBase.getMonth() + 1}</span>
      </div>

      <div className="month-weekdays">
        {['日', '一', '二', '三', '四', '五', '六'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="month-grid">
        {cells.map((cell) => (
          <div key={cell.key} className={`month-cell ${cell.inMonth ? '' : 'muted'}`}>
            <button
              type="button"
              className="month-cell-day"
              onClick={() => onOpenDate(cell.key)}
              aria-label={`查看 ${cell.key}`}
            >
              {cell.day}
            </button>
            <div className="month-cell-items">
              {cell.tasks.slice(0, 3).map((task) => (
                <button key={task.id} className="month-pill task" onClick={() => onEditTask(task)}>
                  {task.client || task.category || '未分類'} · {task.title}
                </button>
              ))}
              {cell.events.slice(0, 2).map((event) => (
                <button key={event.id} className="month-pill event" onClick={() => onEditEvent(event)}>
                  {event.client || '行程'} · {event.title}
                </button>
              ))}
              {cell.dateLinks.slice(0, 3).map((link) => (
                <button key={`${link.client_name}-${link.id}`} className="month-pill date-link" onClick={() => onOpenDate(link.date)}>
                  {link.client_name} · {link.label}
                </button>
              ))}
              {cell.tasks.length + cell.events.length + cell.dateLinks.length > 8 && (
                <span className="month-more">+{cell.tasks.length + cell.events.length + cell.dateLinks.length - 8}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});
