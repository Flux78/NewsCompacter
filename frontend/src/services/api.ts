const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

function _toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function _toSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
}

function _transformKeys<T>(obj: unknown, keyTransform: (s: string) => string): T {
  if (obj === null || obj === undefined) return obj as T
  if (Array.isArray(obj)) return obj.map((v) => _transformKeys(v, keyTransform)) as any
  if (typeof obj === 'object' && obj.constructor === Object) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [keyTransform(k), _transformKeys(v, keyTransform)])
    ) as T
  }
  return obj as T
}

async function requestCamel<T>(path: string, options?: RequestInit): Promise<T> {
  const data = await request<unknown>(path, options)
  return _transformKeys<T>(data, _toCamel)
}

export interface Topic {
  id: number
  name: string
  isImportant: boolean
  groupId: number | null
}

export interface TopicGroup {
  id: number
  name: string
  displayOrder: number
}

export interface NewsItem {
  id: number
  title: string
  source: string
  sourceUrl: string
  summary: string | null
  content: string | null
  imageUrl: string | null
  publishedAt: string | null
  fetchedAt: string
  isSaved: boolean
  topicName: string | null
  tags: string[]
}

export interface SourceItem {
  id: number
  name: string
  url: string
  sourceType: string
  enabled: boolean
}

export interface TagPref {
  tagName: string
  isImportant: boolean
}

export interface LlmConfig {
  provider: string
  apiKey: string
  hasApiKey: boolean
  model: string
  baseUrl: string
}

export const api = {
  topics: {
    list: () => requestCamel<Topic[]>('/topics'),
    create: (name: string, isImportant = true) =>
      requestCamel<Topic>('/topics', { method: 'POST', body: JSON.stringify({ name, is_important: isImportant }) }),
    update: (id: number, data: { name?: string; is_important?: boolean; group_id?: number | null }) =>
      requestCamel<Topic>(`/topics/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<{ ok: boolean }>(`/topics/${id}`, { method: 'DELETE' }),
  },

  topicGroups: {
    list: () => requestCamel<TopicGroup[]>('/topic-groups'),
    create: (name: string, displayOrder = 0) =>
      requestCamel<TopicGroup>('/topic-groups', {
        method: 'POST',
        body: JSON.stringify({ name, display_order: displayOrder }),
      }),
    update: (id: number, data: { name?: string; display_order?: number }) =>
      requestCamel<TopicGroup>(`/topic-groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<{ ok: boolean }>(`/topic-groups/${id}`, { method: 'DELETE' }),
  },

  news: {
    list: (topicId?: number) =>
      requestCamel<NewsItem[]>(`/news${topicId ? `?topic_id=${topicId}` : ''}`),
    update: (id: number, data: { is_saved: boolean }) =>
      requestCamel<NewsItem>(`/news/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  tagPrefs: {
    list: () => requestCamel<TagPref[]>('/tag-prefs'),
    set: (tagName: string, isImportant: boolean) =>
      requestCamel<TagPref>('/tag-prefs', {
        method: 'PUT',
        body: JSON.stringify({ tag_name: tagName, is_important: isImportant }),
      }),
    delete: (tagName: string) =>
      request<{ ok: boolean }>(`/tag-prefs/${encodeURIComponent(tagName)}`, { method: 'DELETE' }),
  },

  llmConfig: {
    get: () => requestCamel<LlmConfig | null>('/llm-config'),
    update: async (cfg: LlmConfig & { clearApiKey?: boolean }) => {
      const raw = _transformKeys<Record<string, unknown>>(cfg, _toSnake)
      return requestCamel<LlmConfig>('/llm-config', { method: 'PUT', body: JSON.stringify(raw) })
    },
    models: (baseUrl: string) =>
      requestCamel<{ models: { id: string }[] }>(`/llm-config/models?base_url=${encodeURIComponent(baseUrl)}`),
  },

  sources: {
    list: () => requestCamel<SourceItem[]>('/sources'),
    create: (name: string, url: string, sourceType = 'rss') =>
      requestCamel<SourceItem>('/sources', { method: 'POST', body: JSON.stringify({ name, url, source_type: sourceType }) }),
    update: (id: number, data: { name?: string; url?: string; source_type?: string; enabled?: boolean }) =>
      requestCamel<SourceItem>(`/sources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<{ ok: boolean }>(`/sources/${id}`, { method: 'DELETE' }),
    suggest: () => requestCamel<{ suggestions: { name: string; url: string; sourceType: string }[] }>('/sources/suggest'),
  },

  settings: {
    language: () => request<{ language: string }>('/settings/language'),
    setLanguage: (language: string) =>
      request<{ language: string }>('/settings/language', {
        method: 'PUT',
        body: JSON.stringify({ language }),
      }),
  },

  fetch: {
    now: () => request<{ fetched: number; enriched: number }>('/fetch/now', { method: 'POST' }),
    enrich: () => request<{ enriched: number }>('/fetch/enrich', { method: 'POST' }),
    enrichStatus: () => request<{ enriching: boolean; fetching: boolean }>('/fetch/enrich-status'),
    getInterval: () => request<{ minutes: number | null }>('/fetch/interval'),
    setInterval: (minutes: number | null) =>
      request<{ minutes: number | null }>('/fetch/interval', {
        method: 'POST',
        body: JSON.stringify({ minutes }),
      }),
  },
}
