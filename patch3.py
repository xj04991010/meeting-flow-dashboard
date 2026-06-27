import re
import sys

filepath = 'src/components/WeeklyClientBoard.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    "import type { CalendarIntentRow, ClientWeeklyNoteRow, TaskRow } from '../types';",
    "import type { CalendarIntentRow, ClientRow, ClientWeeklyNoteRow, TaskRow } from '../types';"
)
content = content.replace(
    "import { Building2, CalendarClock, ChevronDown, Clipboard, Download, Film, Link2, MessageCircle, ScrollText, Send, Sparkles } from 'lucide-react';",
    "import { Building2, CalendarClock, ChevronDown, Clipboard, Download, Film, LayoutDashboard, Link2, MessageCircle, ScrollText, Send, Sparkles } from 'lucide-react';"
)

# 2. Update props interface
content = content.replace(
    "  events: CalendarIntentRow[];\n  selectedDate: string;\n  onEditTask: (task: TaskRow) => void;\n  onEditEvent: (event: CalendarIntentRow) => void;\n};",
    "  events: CalendarIntentRow[];\n  clients: ClientRow[];\n  selectedDate?: string;\n  onEditTask: (task: TaskRow) => void;\n  onEditEvent: (event: CalendarIntentRow) => void;\n  onCreateClient: (name: string) => Promise<void>;\n};"
)

# 3. Update component declaration
content = content.replace(
    "export const WeeklyClientBoard = memo(function WeeklyClientBoard({\n  tasks,\n  events,\n  selectedDate,\n  onEditTask,\n  onEditEvent,\n}: WeeklyClientBoardProps) {",
    "export function WeeklyClientBoard({\n  tasks,\n  events,\n  clients,\n  selectedDate,\n  onEditTask,\n  onEditEvent,\n  onCreateClient,\n}: WeeklyClientBoardProps) {"
)
# Fix end of file
if content.endswith("});\n"):
    content = content[:-4] + "}\n"

# 4. Helper functions
content = content.replace(
    "function getWeekStartKey(selectedDate: string) {",
    "function getWeekStartKey(selectedDate?: string) {"
)
content = content.replace(
    "function getRollingStartKey(selectedDate: string) {",
    "function getRollingStartKey(selectedDate?: string) {"
)

# 5. Remove DEMO_CLIENTS constant definition
demo_clients_pattern = re.compile(r'const DEMO_CLIENTS: ClientWeek\[\] = \[.*?\];\n\n', re.DOTALL)
content = demo_clients_pattern.sub('', content)

# 6. Rewrite useMemo
old_memo = r'  const clients = useMemo\(\(\) => \{\n    const map = new Map<string, ClientWeek>\(\);\n    const ensure = \(name: string\) => \{\n      if \(!map\.has\(name\)\) map\.set\(name, \{ name, tasks: \[\], events: \[\] \}\);\n      return map\.get\(name\)!\;\n    \};\n    tasks\n      \.filter\(\(task\) => task\.status !== \'cancelled\'\)\n      \.forEach\(\(task\) => ensure\(task\.client \|\| task\.category \|\| \'未分類業主\'\)\.tasks\.push\(task\)\);\n    events\n      \.filter\(\(event\) => event\.status !== \'cancelled\'\)\n      \.forEach\(\(event\) => ensure\(event\.client \|\| \'未分類業主\'\)\.events\.push\(event\)\);\n\n    const list = Array\.from\(map\.values\(\)\);\n    return list\.length > 0 \? list : DEMO_CLIENTS;\n  \}, \[events, tasks\]\);'
new_memo = """  const clientMap = useMemo(() => {
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
content = re.sub(old_memo, new_memo, content)

# 7. Update calendarItems
content = content.replace(
    "const sourceTasks = tasks.length > 0 ? tasks : DEMO_CLIENTS.flatMap((client) => client.tasks);",
    "const sourceTasks = tasks;"
)
content = content.replace(
    "const sourceEvents = events.length > 0 ? events : DEMO_CLIENTS.flatMap((client) => client.events);",
    "const sourceEvents = events;"
)

# 8. Update rendering loop
old_render = r'        <div className="client-row-list">\n          \{clients\.map\(\(client\) => \{'
new_render = """        <div className="client-row-list">
          {clientMap.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-100 text-gray-500 gap-4">
              <LayoutDashboard className="w-12 h-12 text-gray-300" />
              <p>尚未建立客戶，請透過下方輸入框新增。</p>
            </div>
          ) : clientMap.map((client) => {"""
content = re.sub(old_render, new_render, content)

# 9. Add input after client-row-list
old_end_list = r'              </article>\n            \);\n          \}\)\}\n        </div>'
new_end_list = """              </article>
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
        </div>"""
content = re.sub(old_end_list, new_end_list, content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done patching WeeklyClientBoard.tsx")
