import { memo } from 'react';
import { AlertTriangle, CheckCircle2, SquarePen, Trash2 } from 'lucide-react';
import type { ReviewPanelProps } from '../types';
import { confidencePercent, formatDateOnly, formatTimeOnly } from '../utils';

export const ReviewPanel = memo(function ReviewPanel({
  tasks,
  events,
  onConfirmTask,
  onConfirmEvent,
  onEditTask,
  onEditEvent,
  onDeleteTask,
  onDeleteEvent,
}: ReviewPanelProps) {
  const total = tasks.length + events.length;

  return (
    <section className="panel review-panel">
      <div className="panel-title warning-title">
        <div className="panel-title-main">
          <AlertTriangle size={18} />
          <h2>需要補充</h2>
        </div>
        <span className="badge">{total}</span>
      </div>
      {total > 0 && (
        <p className="review-panel-hint">AI 已自動處理高信心項目，這裡只留下低信心、缺時間或語意不明的項目。</p>
      )}

      <div className="review-list">
        {tasks.map((task) => (
          <article key={task.id} className="review-card task-type" onClick={() => onEditTask(task)}>
            <div className="review-card-body">
              <span className="card-type-badge task-badge">任務</span>
              <strong>
                {task.priority === 'high' && <span className="priority-dot">高</span>}
                {task.title}
              </strong>
              <p>{task.client || task.category || '未分類'} · AI 信心 {confidencePercent(task.confidence)} · 補完後自動進待辦</p>
            </div>
            <div className="review-quick-actions" onClick={(event) => event.stopPropagation()}>
              <button className="icon-btn success-btn" onClick={() => onConfirmTask(task.id)} title="補充完成，加入待辦">
                <CheckCircle2 size={16} />
              </button>
              <button className="icon-btn neutral-btn" onClick={() => onEditTask(task)} title="編輯">
                <SquarePen size={15} />
              </button>
              {onDeleteTask && (
                <button className="icon-btn danger-btn" onClick={() => onDeleteTask(task.id)} title="忽略">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </article>
        ))}

        {events.map((event) => (
          <article key={event.id} className="review-card event-type" onClick={() => onEditEvent(event)}>
            <div className="review-card-body">
              <span className="card-type-badge event-badge">行程</span>
              <strong>{event.title}</strong>
              <p>{formatDateOnly(event.start_time)} {formatTimeOnly(event.start_time)} · AI 信心 {confidencePercent(event.confidence)} · 補完後可同步</p>
            </div>
            <div className="review-quick-actions" onClick={(clickEvent) => clickEvent.stopPropagation()}>
              <button className="icon-btn success-btn" onClick={() => onConfirmEvent(event.id)} title="補充完成，加入行程">
                <CheckCircle2 size={16} />
              </button>
              <button className="icon-btn neutral-btn" onClick={() => onEditEvent(event)} title="編輯">
                <SquarePen size={15} />
              </button>
              {onDeleteEvent && (
                <button className="icon-btn danger-btn" onClick={() => onDeleteEvent(event.id)} title="忽略">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </article>
        ))}

        {total === 0 && <div className="empty-state">沒有需要補充的項目。高信心結果已自動整理。</div>}
      </div>
    </section>
  );
});
