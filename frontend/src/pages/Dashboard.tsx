import { useEffect, useState, useMemo, useRef } from 'react'
import { api, type NewsItem, type Topic, type LlmConfig, type TagPref } from '../services/api'
import NewsCard from '../components/NewsCard'
import SpinnerButton from '../components/SpinnerButton'
import LoadingState from '../components/LoadingState'
import { useLoadOnMount } from '../useLoadOnMount'
import { useNavigate, useSearchParams } from 'react-router-dom'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const OTHER_GROUP = 'other'

function groupId(name: string) { return 'group-' + name.toLowerCase().replace(/\s+/g, '-') }

export default function Dashboard(): JSX.Element {
  const nowRef = useRef(Date.now())
  const [allNews, setAllNews] = useState<NewsItem[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [tagPrefs, setTagPrefs] = useState<TagPref[]>([])
  const [fetching, setFetching] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null)
  const [showLlmWarning, setShowLlmWarning] = useState(true)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const ageFilter = searchParams.get('age')
  const keywordFilter = searchParams.get('keyword') || ''
  const keywordMode = (searchParams.get('kmode') || 'OR').toUpperCase() === 'AND' ? 'AND' : 'OR'

  function itemAge(item: NewsItem): number {
    const date = item.publishedAt ?? item.fetchedAt
    if (!date) return Infinity
    const diff = nowRef.current - new Date(date).getTime()
    return diff / MS_PER_DAY
  }

  const filteredNews = useMemo(
    () => (ageFilter ? allNews.filter((item) => itemAge(item) <= Number(ageFilter)) : allNews),
    [allNews, ageFilter],
  )

  const keywordFilteredNews = useMemo(() => {
    if (!keywordFilter) return filteredNews
    const keywords = keywordFilter.split(/[,\s]+/).filter(Boolean).map((k) => k.toLowerCase())
    if (keywords.length === 0) return filteredNews
    return filteredNews.filter((item) => {
      const searchText = [item.title, item.summary || '', item.content || '', ...item.tags].join(' ').toLowerCase()
      return keywordMode === 'AND'
        ? keywords.every((k) => searchText.includes(k))
        : keywords.some((k) => searchText.includes(k))
    })
  }, [filteredNews, keywordFilter, keywordMode])

  const importantTopics = useMemo(
    () => topics.filter((t) => t.isImportant).map((t) => t.name.toLowerCase()),
    [topics],
  )

  const { importantTags, unimportantTags } = useMemo(() => {
    const important = new Set<string>()
    const unimportant = new Set<string>()
    for (const t of tagPrefs) {
      const lower = t.tagName.toLowerCase()
      if (t.isImportant) important.add(lower)
      else unimportant.add(lower)
    }
    return { importantTags: important, unimportantTags: unimportant }
  }, [tagPrefs])

  function itemMatchesTopic(item: NewsItem, topicLower: string): boolean {
    const escaped = topicLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp('\\b' + escaped + '\\b')
    if (item.tags.some((t) => pattern.test(t.toLowerCase()))) return true
    if (pattern.test(item.title.toLowerCase())) return true
    if (pattern.test((item.summary ?? '').toLowerCase())) return true
    if (pattern.test((item.content ?? '').toLowerCase())) return true
    return false
  }

  function itemScore(item: NewsItem): number {
    let score = 0
    for (const tag of item.tags) {
      const lower = tag.toLowerCase()
      if (importantTags.has(lower)) score += 1
      else if (unimportantTags.has(lower)) score -= 1
    }
    return score
  }

  const entries = useMemo(() => {
    const grouped: Record<string, NewsItem[]> = {}
    for (const item of keywordFilteredNews) {
      let matched = false
      for (const topic of importantTopics) {
        if (itemMatchesTopic(item, topic)) {
          if (!grouped[topic]) grouped[topic] = []
          grouped[topic].push(item)
          matched = true
        }
      }
      if (!matched) {
        if (!grouped[OTHER_GROUP]) grouped[OTHER_GROUP] = []
        grouped[OTHER_GROUP].push(item)
      }
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => itemScore(b) - itemScore(a))
    }
    return Object.entries(grouped)
      .filter(([, items]) => items.length > 0)
      .sort(([a], [b]) => {
        if (a === OTHER_GROUP) return 1
        if (b === OTHER_GROUP) return -1
        return 0
      })
  }, [keywordFilteredNews, importantTopics, importantTags, unimportantTags])

  const { loading, reload } = useLoadOnMount(async () => {
    const [items, t, prefs, llm] = await Promise.all([
      api.news.list().catch(() => [] as NewsItem[]),
      api.topics.list().catch(() => [] as Topic[]),
      api.tagPrefs.list().catch(() => [] as TagPref[]),
      api.llmConfig.get().catch(() => null),
    ])
    setAllNews(items)
    setTopics(t)
    setTagPrefs(prefs)
    setLlmConfig(llm)
  })

  useEffect(() => {
    const handler = () => reload()
    window.addEventListener('enrich-done', handler)
    window.addEventListener('fetch-done', handler)
    return () => {
      window.removeEventListener('enrich-done', handler)
      window.removeEventListener('fetch-done', handler)
    }
  }, [reload])

  const handleFetchNow = async () => {
    setFetching(true)
    setFetchMsg('')
    try {
      const res = await api.fetch.now()
      const parts: string[] = []
      if (res.fetched > 0) parts.push(`${res.fetched} Nachrichten geladen`)
      if (res.enriched > 0) parts.push(`${res.enriched} getaggt`)
      setFetchMsg(parts.length > 0 ? parts.join(', ') + '.' : 'Keine neuen Nachrichten')
      await reload()
    } catch {
      setFetchMsg('Fehler beim Abruf')
    }
    setFetching(false)
  }

  const handleEnrich = async () => {
    setEnriching(true)
    setFetchMsg('')
    try {
      const res = await api.fetch.enrich()
      setFetchMsg(res.enriched > 0 ? `${res.enriched} Nachrichten getaggt` : 'Keine Nachrichten zu taggen')
      await reload()
    } catch {
      setFetchMsg('Fehler bei der Tag-Analyse')
    }
    setEnriching(false)
  }

  const handleSaveToggle = async (id: number, saved: boolean) => {
    await api.news.update(id, { is_saved: saved })
  }

  const handleTagImportant = async (tag: string) => {
    await api.tagPrefs.set(tag, true)
    await reload()
  }

  const handleTagUnimportant = async (tag: string) => {
    await api.tagPrefs.set(tag, false)
    await reload()
  }

  const scrollToGroup = (name: string) => {
    setActiveGroup(name)
    const el = document.getElementById(groupId(name))
    el?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="dash-layout">
      <aside className="dash-sidebar">
        <h3>Kapitel</h3>
        {entries.length === 0 ? (
          <p className="dash-sidebar-empty">Keine</p>
        ) : (
          <ul>
            {entries.map(([group]) => (
              <li key={group}>
                <button
                  className={`dash-sidebar-link${activeGroup === group ? ' active' : ''}`}
                  onClick={() => scrollToGroup(group)}
                >
{group === OTHER_GROUP ? 'Allgemein' : group}

                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main className="dash-main">
        <div className="page-header">
          <h2>Nachrichten</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <SpinnerButton className="btn btn-outline btn-sm" onClick={handleEnrich} loading={enriching}>
              Tag-Analyse
            </SpinnerButton>
            <SpinnerButton className="btn" onClick={handleFetchNow} loading={fetching}>
              Jetzt aktualisieren
            </SpinnerButton>
          </div>
        </div>

        {llmConfig && !llmConfig.hasApiKey && showLlmWarning && (
          <div className="llm-warning">
            <span>⚠️ Kein LLM-API-Key konfiguriert – Tags, Zusammenfassungen und intelligente Gruppierung sind nicht verfügbar.</span>
            <button className="btn btn-sm" onClick={() => navigate('/llm-config')}>Konfigurieren</button>
            <button className="btn btn-sm btn-outline llm-warning-dismiss" onClick={() => setShowLlmWarning(false)} aria-label="Schließen">✕</button>
          </div>
        )}

        {fetchMsg && <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>{fetchMsg}</p>}

        <div className="filter-bar">
          <div className="filter-bar-row">
            <div className="filter-input-wrap">
              <input
                type="text"
                placeholder="Nach Schlagworten filtern... (Komma-getrennt)"
                value={keywordFilter}
                onChange={(e) => {
                  const v = e.target.value
                  const params = new URLSearchParams(searchParams.toString())
                  if (v) params.set('keyword', v)
                  else params.delete('keyword')
                  setSearchParams(params, { replace: true })
                }}
              />
              {keywordFilter && (
                <button className="clear-btn" onClick={() => {
                  const params = new URLSearchParams(searchParams.toString())
                  params.delete('keyword')
                  setSearchParams(params, { replace: true })
                }}>×</button>
              )}
            </div>
            <div className="filter-mode">
              <button
                className={`filter-mode-btn${keywordMode === 'OR' ? ' active' : ''}`}
                onClick={() => {
                  const p = new URLSearchParams(searchParams.toString())
                  p.set('kmode', 'OR')
                  setSearchParams(p, { replace: true })
                }}
              >OR</button>
              <button
                className={`filter-mode-btn${keywordMode === 'AND' ? ' active' : ''}`}
                onClick={() => {
                  const p = new URLSearchParams(searchParams.toString())
                  p.set('kmode', 'AND')
                  setSearchParams(p, { replace: true })
                }}
              >AND</button>
            </div>
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <p>{keywordFilter ? 'Keine Nachrichten mit diesen Schlagworten.' : ageFilter ? 'Keine Nachrichten für diesen Zeitraum.' : 'Keine Nachrichten vorhanden.'}</p>
            {!keywordFilter && !ageFilter && (
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Klicke auf "Jetzt aktualisieren" um die ersten Nachrichten zu laden.
              </p>
            )}
          </div>
        ) : (
          entries.map(([group, items]) => (
            <div key={group} id={groupId(group)}>
              <div className="group-title">
                {group === OTHER_GROUP ? 'Allgemein' : group}
              </div>
              {items.map((item) => (
                <NewsCard
                  key={`${group}-${item.id}`}
                  item={item}
                  keywordFilter={keywordFilter}
                  onTagImportant={handleTagImportant}
                  onTagUnimportant={handleTagUnimportant}
                  importantTags={importantTags}
                  unimportantTags={unimportantTags}
                  onSaveToggle={handleSaveToggle}
                />
              ))}
            </div>
          ))
        )}
      </main>
    </div>
  )
}
