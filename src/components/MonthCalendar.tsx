import { memo, useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import type { CalendarIntentRow, TaskRow } from '../types';

type MonthCalendarProps = {
  tasks: TaskRow[];
  events: CalendarIntentRow[];
  selectedDate: string;
  onEditTask: (task: TaskRow) => void;
  onEditEvent: (event: CalendarIntentRow) => void;
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
  selectedDate,
  onEditTask,
  onEditEvent,
}: MonthCalendarProps) {
  const monthBase = selectedDate ? new Date(selectedDate) : new Date();
  const monthStart = new Date(monthBase.getFullYear(), monthBase.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

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
      };
    });
  }, [events, gridStart, monthBase, tasks]);

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
            <div className="month-cell-day">{cell.day}</div>
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
              {cell.tasks.length + cell.events.length > 5 && (
                <span className="month-more">+{cell.tasks.length + cell.events.length - 5}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});
