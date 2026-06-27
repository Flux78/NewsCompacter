const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export interface Topic {
  id: number
  name: string
  is_important: boolean
}

export interface NewsItem {
  id: number
  title: string
  source: string
  source_url: string
  summary: string | null
  content: string | null
  image_url: string | null
  published_at: string | null
  fetched_at: string
  is_saved: boolean
  topic_name: string | null
  tags: string[]
}

export interface SourceItem {
  id: number
  name: string
  url: string
  source_type: string
  enabled: boolean
}

export interface TagPref {
  tag_name: string
  is_important: boolean
}

export interface LlmConfig {
  provider: string
  api_key: string
  has_api_key: boolean
  model: string
  base_url: string
}

export const api = {
  topics: {
    list: () => request<Topic[]>('/topics'),
    create: (name: string, is_important = true) =>
      request<Topic>('/topics', { method: 'POST', body: JSON.stringify({ name, is_important }) }),
    update: (id: number, data: { name?: string; is_important?: boolean }) =>
      request<Topic>(`/topics/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<{ ok: boolean }>(`/topics/${id}`, { method: 'DELETE' }),
  },

  news: {
    list: (topicId?: number) =>
      request<NewsItem[]>(`/news${topicId ? `?topic_id=${topicId}` : ''}`),
    update: (id: number, data: { is_saved: boolean }) =>
      request<NewsItem>(`/news/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  tagPrefs: {
    list: () => request<{ tag_name: string; is_important: boolean }[]>('/tag-prefs'),
    set: (tag_name: string, is_important: boolean) =>
      request<{ tag_name: string; is_important: boolean }>('/tag-prefs', {
        method: 'PUT',
        body: JSON.stringify({ tag_name, is_important }),
      }),
    delete: (tag_name: string) =>
      request<{ ok: boolean }>(`/tag-prefs/${encodeURIComponent(tag_name)}`, { method: 'DELETE' }),
  },

  llmConfig: {
    get: () => request<LlmConfig | null>('/llm-config'),
    update: (cfg: LlmConfig) =>
      request<LlmConfig>('/llm-config', { method: 'PUT', body: JSON.stringify(cfg) }),
  },

  sources: {
    list: () => request<SourceItem[]>('/sources'),
    create: (name: string, url: string, source_type = 'rss') =>
      request<SourceItem>('/sources', { method: 'POST', body: JSON.stringify({ name, url, source_type }) }),
    update: (id: number, data: { name?: string; url?: string; source_type?: string; enabled?: boolean }) =>
      request<SourceItem>(`/sources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<{ ok: boolean }>(`/sources/${id}`, { method: 'DELETE' }),
    suggest: () => request<{ suggestions: { name: string; url: string; source_type: string }[] }>('/sources/suggest'),
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
