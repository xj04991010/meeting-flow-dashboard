import { memo, useMemo, useState } from 'react';
import { CalendarClock, Film, Scissors, ScrollText, Users } from 'lucide-react';
import type { TaskRow } from '../types';
import { formatDateOnly } from '../utils';

type CustomerOverviewProps = {
  tasks: TaskRow[];
  onEditTask: (task: TaskRow) => void;
};

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export const CustomerOverview = memo(function CustomerOverview({ tasks, onEditTask }: CustomerOverviewProps) {
  const activeTasks = useMemo(() => (
    tasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled')
  ), [tasks]);

  const customers = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    activeTasks.forEach((task) => {
      const key = task.client || task.category || '未分類客戶';
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(task);
    });

    return Array.from(map.entries()).map(([name, items]) => {
      const sorted = [...items].sort((a, b) => {
        const aTime = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
      const joined = items.map((item) => item.title).join(' ');
      return {
        name,
        items: sorted,
        next: sorted.find((item) => item.deadline) || null,
        publishCount: items.filter((item) => includesAny(item.title, ['發片', '上片', '發布'])).length,
        footageCount: items.filter((item) => includesAny(item.title, ['毛片', '素材', '拍片', '拍攝'])).length,
        editCount: items.filter((item) => includesAny(item.title, ['剪輯', '初剪', '精剪', '完稿'])).length,
        planCount: items.filter((item) => includesAny(item.title, ['企劃', '腳本', '提案'])).length,
        statusText: joined.slice(0, 68) || '尚無近期紀錄',
      };
    }).sort((a, b) => {
      const aTime = a.next?.deadline ? new Date(a.next.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.next?.deadline ? new Date(b.next.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [activeTasks]);

  const [activeCustomer, setActiveCustomer] = useState('');
  const selectedCustomer = customers.find((customer) => customer.name === activeCustomer) || customers[0];

  return (
    <section className="panel customer-overview-panel">
      <div className="panel-title">
        <div className="panel-title-main">
          <Users size={18} />
          <h2>客戶管理表</h2>
        </div>
        <span className="badge">{customers.length}</span>
      </div>

      {customers.length === 0 ? (
        <div className="empty-state">還沒有客戶紀錄。先新增一句紀錄，再連結日期。</div>
      ) : (
        <div className="customer-overview-body">
          <div className="customer-table">
            {customers.map((customer) => (
              <button
                key={customer.name}
                className={`customer-row ${selectedCustomer?.name === customer.name ? 'active' : ''}`}
                onClick={() => setActiveCustomer(customer.name)}
              >
                <span className="customer-name">{customer.name}</span>
                <span className="customer-next">
                  <CalendarClock size={13} />
                  {customer.next?.deadline ? formatDateOnly(customer.next.deadline) : '未排程'}
                </span>
                <span className="customer-summary">{customer.statusText}</span>
                <span className="customer-mini-metrics">
                  <span><Film size={12} />{customer.footageCount}</span>
                  <span><Scissors size={12} />{customer.editCount}</span>
                  <span><ScrollText size={12} />{customer.planCount}</span>
                </span>
              </button>
            ))}
          </div>

          {selectedCustomer && (
            <div className="customer-detail">
              <div className="customer-detail-header">
                <strong>{selectedCustomer.name}</strong>
                <span>{selectedCustomer.items.length} 則追蹤</span>
              </div>
              <div className="customer-detail-metrics">
                <span>發片 {selectedCustomer.publishCount}</span>
                <span>毛片/拍攝 {selectedCustomer.footageCount}</span>
                <span>待剪輯 {selectedCustomer.editCount}</span>
                <span>企劃 {selectedCustomer.planCount}</span>
              </div>
              <div className="customer-item-list">
                {selectedCustomer.items.slice(0, 5).map((item) => (
                  <button key={item.id} className="customer-item" onClick={() => onEditTask(item)}>
                    <span>{item.title}</span>
                    <strong>{item.deadline ? formatDateOnly(item.deadline) : '未排程'}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
});
