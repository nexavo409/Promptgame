// User-defined practice topics, stored in localStorage.
// Lets users practice against real-world tasks (e.g. "明日のプレゼン資料の構成").

const KEY = 'pa.customTopics';

export function loadCustomTopics() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

function persist(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

export function saveCustomTopic({ title, brief, category, difficulty }) {
  const list = loadCustomTopics();
  const topic = {
    id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    title: (title || '').trim().slice(0, 200),
    brief: (brief || '').trim().slice(0, 2000),
    category: category || 'neutral',
    difficulty: difficulty || 'standard',
    createdAt: Date.now(),
  };
  list.unshift(topic);
  persist(list);
  return topic;
}

export function updateCustomTopic(id, updates) {
  const list = loadCustomTopics();
  const idx = list.findIndex(t => t.id === id);
  if (idx < 0) return null;
  list[idx] = {
    ...list[idx],
    ...updates,
    title: (updates.title ?? list[idx].title).slice(0, 200),
    brief: (updates.brief ?? list[idx].brief).slice(0, 2000),
  };
  persist(list);
  return list[idx];
}

export function deleteCustomTopic(id) {
  const list = loadCustomTopics().filter(t => t.id !== id);
  persist(list);
}

export function getCustomTopic(id) {
  return loadCustomTopics().find(t => t.id === id) || null;
}
