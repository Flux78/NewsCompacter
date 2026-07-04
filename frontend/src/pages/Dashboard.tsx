import { useEffect, useState, useMemo, useRef } from 'react'
import { api, type NewsItem, type Topic, type TopicGroup, type LlmConfig, type TagPref } from '../services/api'
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
  const [topicGroups, setTopicGroups] = useState<TopicGroup[]>([])
  const [tagPrefs, setTagPrefs] = useState<TagPref[]>([])
  const [fetching, setFetching] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null)
  const [showLlmWarning, setShowLlmWarning] = useState(true)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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

  const importantTopics = useMemo(
    () => topics.filter((t) => t.isImportant),
    [topics],
  )

  const sortedGroups = useMemo(
    () => [...topicGroups].sort((a, b) => a.displayOrder - b.displayOrder),
    [topicGroups],
  )

  const groupTopicMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const group of sortedGroups) {
      const names = importantTopics
        .filter((t) => t.groupId === group.id)
        .map((t) => t.name)
      if (names.length > 0) {
        map.set(group.name, names)
      }
    }
    return map
  }, [sortedGroups, importantTopics])

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
    const groupOrder: string[] = []

    for (const item of keywordFilteredNews) {
      let matched = false

      for (const group of sortedGroups) {
        const groupTopics = importantTopics.filter((t) => t.groupId === group.id)
        if (groupTopics.length === 0) continue
        const groupName = group.name
        for (const topic of groupTopics) {
          if (itemMatchesTopic(item, topic.name.toLowerCase())) {
            if (!grouped[groupName]) {
              grouped[groupName] = []
              groupOrder.push(groupName)
            }
            grouped[groupName].push(item)
            matched = true
            break
          }
        }
        if (matched) break
      }

      if (!matched) {
        for (const topic of importantTopics) {
          if (topic.groupId) continue
          if (itemMatchesTopic(item, topic.name.toLowerCase())) {
            if (!grouped[topic.name]) {
              grouped[topic.name] = []
              groupOrder.push(topic.name)
            }
            grouped[topic.name].push(item)
            matched = true
            break
          }
        }
      }

      if (!matched) {
        if (!grouped[OTHER_GROUP]) {
          grouped[OTHER_GROUP] = []
          groupOrder.push(OTHER_GROUP)
        }
        grouped[OTHER_GROUP].push(item)
      }
    }

    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => itemScore(b) - itemScore(a))
    }

    const orderMap = new Map(groupOrder.map((name, idx) => [name, idx]))
    return Object.entries(grouped)
      .filter(([, items]) => items.length > 0)
      .sort(([a], [b]) => {
        if (a === OTHER_GROUP) return 1
        if (b === OTHER_GROUP) return -1
        return (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0)
      })
  }, [keywordFilteredNews, importantTopics, sortedGroups, importantTags, unimportantTags])

  const { loading, reload } = useLoadOnMount(async () => {
    const [items, t, prefs, llm, tg] = await Promise.all([
      api.news.list().catch(() => [] as NewsItem[]),
      api.topics.list().catch(() => [] as Topic[]),
      api.tagPrefs.list().catch(() => [] as TagPref[]),
      api.llmConfig.get().catch(() => null),
      api.topicGroups.list().catch(() => [] as TopicGroup[]),
    ])
    setAllNews(items)
    setTopics(t)
    setTagPrefs(prefs)
    setLlmConfig(llm)
    setTopicGroups(tg)
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
    setActiveTopic(null)
    const el = document.getElementById(groupId(name))
    el?.scrollIntoView({ behavior: 'smooth' })
  }

  const scrollToTopic = (groupName: string, topicName: string) => {
    setActiveGroup(groupName)
    setActiveTopic(topicName)
    const el = document.getElementById(groupId(groupName))
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
            {entries.map(([group]) => {
              const topics = groupTopicMap.get(group)
              return (
                <li key={group}>
                  <button
                    className={`dash-sidebar-link${activeGroup === group && !activeTopic ? ' active' : ''}`}
                    onClick={() => scrollToGroup(group)}
                  >
{group === OTHER_GROUP ? 'Allgemein' : group}

                  </button>
                  {topics && (
                    <ul className="dash-sidebar-sublist">
                      {topics.map((topic) => (
                        <li key={topic}>
                          <button
                            className={`dash-sidebar-sublink${activeTopic === topic ? ' active' : ''}`}
                            onClick={() => scrollToTopic(group, topic)}
                          >
                            {topic}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
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
          entries.map(([group, items]) => {
            const topics = groupTopicMap.get(group)
            const filtered = activeTopic && topics?.includes(activeTopic)
              ? items.filter((item) => itemMatchesTopic(item, activeTopic.toLowerCase()))
              : items
            if (filtered.length === 0) return null
            return (
              <div key={group} id={groupId(group)}>
                <div className="group-title">
                  {group === OTHER_GROUP ? 'Allgemein' : group}
                </div>
                {activeTopic && topics?.includes(activeTopic) && (
                  <div className="group-subtitle">Thema: {activeTopic}</div>
                )}
                {filtered.map((item) => (
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
            )
          })
        )}
      </main>
    </div>
  )
}
