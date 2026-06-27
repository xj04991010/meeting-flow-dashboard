import re
import sys

# 1. Dashboard: WeeklyClientBoard.tsx
filepath = 'src/components/WeeklyClientBoard.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Update imports
content = content.replace(
    "import type { CalendarIntentRow, ClientWeeklyNoteRow, TaskRow } from '../types';",
    "import type { CalendarIntentRow, ClientRow, ClientWeeklyNoteRow, TaskRow } from '../types';"
)
content = content.replace(
    "import { Building2, CalendarClock, ChevronDown, Clipboard, Download, Film, Link2, MessageCircle, ScrollText, Send, Sparkles } from 'lucide-react';",
    "import { Building2, CalendarClock, ChevronDown, Clipboard, Download, Film, LayoutDashboard, Link2, MessageCircle, ScrollText, Send, Sparkles } from 'lucide-react';"
)

# Update props interface
content = content.replace(
    "type WeeklyClientBoardProps = {\n  tasks: TaskRow[];\n  events: CalendarIntentRow[];\n  selectedDate: string;\n  onEditTask: (task: TaskRow) => void;\n  onEditEvent: (event: CalendarIntentRow) => void;\n};",
    "type WeeklyClientBoardProps = {\n  tasks: TaskRow[];\n  events: CalendarIntentRow[];\n  clients: ClientRow[];\n  selectedDate?: string;\n  onEditTask: (task: TaskRow) => void;\n  onEditEvent: (event: CalendarIntentRow) => void;\n  onCreateTask: (clientName: string, taskType: string, title: string) => Promise<void>;\n  onCreateClient: (name: string) => Promise<void>;\n};"
)

content = content.replace(
    "function getWeekStartKey(selectedDate: string) {",
    "function getWeekStartKey(selectedDate?: string) {"
)
content = content.replace(
    "function getRollingStartKey(selectedDate: string) {",
    "function getRollingStartKey(selectedDate?: string) {"
)

# Update component declaration
content = content.replace(
    "export const WeeklyClientBoard = memo(function WeeklyClientBoard({\n  tasks,\n  events,\n  selectedDate,\n  onEditTask,\n  onEditEvent,\n}: WeeklyClientBoardProps) {",
    "export function WeeklyClientBoard({\n  tasks,\n  events,\n  clients,\n  selectedDate,\n  onEditTask,\n  onEditEvent,\n  onCreateTask,\n  onCreateClient,\n}: WeeklyClientBoardProps) {"
)

# Remove DEMO_CLIENTS usage in useMemo
client_memo_pattern = re.compile(r'  const clients = useMemo\(\(\) => \{.*?return list\.length > 0 \? list : DEMO_CLIENTS;\n  \}, \[events, tasks\]\);', re.DOTALL)
new_client_memo = """  const clientMap = useMemo(() => {
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
  };"""
content = client_memo_pattern.sub(new_client_memo, content)

# Remove DEMO_CLIENTS from calendarItems
content = content.replace(
    "const sourceTasks = tasks.length > 0 ? tasks : DEMO_CLIENTS.flatMap((client) => client.tasks);",
    "const sourceTasks = tasks;"
)
content = content.replace(
    "const sourceEvents = events.length > 0 ? events : DEMO_CLIENTS.flatMap((client) => client.events);",
    "const sourceEvents = events;"
)

# Update rendering list
render_pattern = re.compile(r'        <div className="flex flex-col gap-4">\n          \{clients\.map\(\(clientWeek\) => \(\n            <ClientCard\n              key=\{clientWeek\.name\}\n              clientWeek=\{clientWeek\}\n              weekKey=\{weekKey\}\n              onDateLink=\{handleDateLink\}\n              onRemoveDateLink=\{handleRemoveDateLink\}\n              onEditTask=\{onEditTask\}\n              onEditEvent=\{onEditEvent\}\n            />\n          \)\)\}\n        </div>', re.DOTALL)

new_render = """        {clientMap.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-100 text-gray-500 gap-4">
            <LayoutDashboard className="w-12 h-12 text-gray-300" />
            <p>尚未建立客戶，請透過下方輸入框新增。</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {clientMap.map((clientWeek) => (
              <ClientCard
                key={clientWeek.name}
                clientWeek={clientWeek}
                weekKey={weekKey}
                onDateLink={handleDateLink}
                onRemoveDateLink={handleRemoveDateLink}
                onEditTask={onEditTask}
                onEditEvent={onEditEvent}
                onCreateTask={onCreateTask}
              />
            ))}
          </div>
        )}

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
        </div>"""

content = render_pattern.sub(new_render, content)

# Remove DEMO_CLIENTS constant definition
demo_clients_pattern = re.compile(r'const DEMO_CLIENTS: ClientWeek\[\] = \[.*?\];\n\n', re.DOTALL)
content = demo_clients_pattern.sub('', content)

# ClientCard component fixes
content = content.replace("onEditEvent,\n}: {", "onEditEvent,\n  onCreateTask,\n}: {")
content = content.replace("onEditEvent: (event: CalendarIntentRow) => void;", "onEditEvent: (event: CalendarIntentRow) => void;\n  onCreateTask: (clientName: string, taskType: string, title: string) => Promise<void>;")
content = content.replace("onCreateTask && (", "onCreateTask && (\n                        <input \n                          type=\"text\" \n                          placeholder={`+ 新增${type}... (按 Enter 儲存)`}\n                          className=\"compact-task-input\"\n                          onKeyDown={(e) => {\n                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {\n                              onCreateTask(client.name, type, e.currentTarget.value.trim());\n                              e.currentTarget.value = '';\n                            }\n                          }}\n                        />\n                      )")
content = content.replace("""{onCreateTask && (
                        <input """, """{onCreateTask && (
                        <input """)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done updating WeeklyClientBoard.tsx")

# 2. Backend: index.ts
import os
backend_idx = '../meeting-flow-backend/src/index.ts'
with open(backend_idx, 'r', encoding='utf-8') as f:
    be_content = f.read()

# Fix duplicate identifier error
# 找出所有 `createClient` 的 import
be_content = re.sub(r"import\s*\{\s*createClient\s*\}\s*from\s*'@supabase/supabase-js';\n?", "", be_content)
be_content = be_content.replace(
    "import { getClients, createClient, updateClient } from './repositories/clients.repo';",
    "import { getClients, createClient as repoCreateClient, updateClient } from './repositories/clients.repo';"
)
be_content = be_content.replace("await createClient(userId, body)", "await repoCreateClient(userId, body)")

# In `src/utils/db.ts` we should ensure `createClient` is imported if needed, but here `createClient` from supabase is actually used in `index.ts`?
# Wait, `index.ts` line 10 has `import { createClient } from '@supabase/supabase-js';`
# I'll just restore the import and rename my repo import.
be_content = "import { createClient } from '@supabase/supabase-js';\n" + be_content

with open(backend_idx, 'w', encoding='utf-8') as f:
    f.write(be_content)

print("Done updating backend index.ts")
