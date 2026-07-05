import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { api, type NewsItem, type Topic, type TopicGroup, type LlmConfig, type TagPref } from '../services/api'
import NewsCard from '../components/NewsCard'
import SpinnerButton from '../components/SpinnerButton'
import LoadingState from '../components/LoadingState'
import DashboardSidebar from '../components/DashboardSidebar'
import { ToastContainer, showToast } from '../components/Toast'
import { useLoadOnMount } from '../useLoadOnMount'
import { useNewsFiltering } from '../hooks/useNewsFiltering'
import { useNewsGrouping, groupId } from '../hooks/useNewsGrouping'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function Dashboard(): JSX.Element {
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
  const [visibleLimit, setVisibleLimit] = useState(50)
  const [lastSeen, setLastSeen] = useState<number>(0)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ageFilter = searchParams.get('age')
  const keywordFilter = searchParams.get('keyword') || ''
  const keywordMode = (searchParams.get('kmode') || 'OR').toUpperCase() === 'AND' ? 'AND' : 'OR'

  const { filtered: keywordFilteredNews } = useNewsFiltering(allNews, ageFilter, keywordFilter, keywordMode)

  const {
    importantTags,
    unimportantTags,
    importantTopics,
    sortedGroups,
    groupTopicMap,
    itemMatchesTopic,
    entries,
    OTHER_GROUP,
  } = useNewsGrouping(keywordFilteredNews, topics, topicGroups, tagPrefs)

  const topicNewsCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const group of sortedGroups) {
      const groupTopics = importantTopics.filter((t) => t.groupId === group.id)
      for (const topic of groupTopics) {
        counts.set(topic.name, 0)
      }
      const groupEntries = entries.find(([name]) => name === group.name)?.[1] ?? []
      for (const item of groupEntries) {
        for (const topic of groupTopics) {
          if (itemMatchesTopic(item, topic.name.toLowerCase())) {
            counts.set(topic.name, (counts.get(topic.name) ?? 0) + 1)
          }
        }
      }
    }
    return counts
  }, [sortedGroups, importantTopics, entries, itemMatchesTopic])

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
    const stored = localStorage.getItem('news_last_seen')
    setLastSeen(stored ? Number(stored) : 0)
    const saveLastSeen = () => {
      localStorage.setItem('news_last_seen', String(Date.now()))
    }
    window.addEventListener('beforeunload', saveLastSeen)
    return () => window.removeEventListener('beforeunload', saveLastSeen)
  }, [])

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
    try {
      await api.news.update(id, { is_saved: saved })
    } catch {
      showToast('Fehler beim Speichern')
    }
  }

  const handleTagImportant = async (tag: string) => {
    await api.tagPrefs.set(tag, true)
    await reload()
  }

  const handleTagUnimportant = async (tag: string) => {
    await api.tagPrefs.set(tag, false)
    await reload()
  }

  const scrollToGroup = useCallback((name: string) => {
    setActiveGroup(name)
    setActiveTopic(null)
    const el = document.getElementById(groupId(name))
    el?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const scrollToTopic = useCallback((groupName: string, topicName: string) => {
    setActiveGroup(groupName)
    setActiveTopic(topicName)
    const el = document.getElementById(groupId(groupName))
    el?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const groupEntryRef = useRef<(string | null)[]>([])
  groupEntryRef.current = entries.map(([g]) => g)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'j' || e.key === 'J') {
        const groups = groupEntryRef.current
        const idx = activeGroup ? groups.indexOf(activeGroup) : -1
        const next = idx < groups.length - 1 ? groups[idx + 1] : groups[0]
        if (next) scrollToGroup(next)
      } else if (e.key === 'k' || e.key === 'K') {
        const groups = groupEntryRef.current
        const idx = activeGroup ? groups.indexOf(activeGroup) : -1
        const prev = idx > 0 ? groups[idx - 1] : groups[groups.length - 1]
        if (prev) scrollToGroup(prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeGroup, scrollToGroup])

  return (
    <div className="dash-layout">
      <DashboardSidebar
        entries={entries}
        groupTopicMap={groupTopicMap}
        activeGroup={activeGroup}
        activeTopic={activeTopic}
        otherGroup={OTHER_GROUP}
        topicNewsCounts={topicNewsCounts}
        onScrollToGroup={scrollToGroup}
        onScrollToTopic={scrollToTopic}
      />

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
            <span>Kein LLM-API-Key konfiguriert – Tags, Zusammenfassungen und intelligente Gruppierung sind nicht verfügbar.</span>
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
          <>
            {entries.map(([group, items]) => {
              const topics = groupTopicMap.get(group)
              const filtered = activeTopic && topics?.includes(activeTopic)
                ? items.filter((item) => itemMatchesTopic(item, activeTopic.toLowerCase()))
                : items
              if (filtered.length === 0) return null
              const displayItems = filtered.slice(0, visibleLimit)
              return (
                <div key={group} id={groupId(group)}>
                  <div className="group-title">
                    {group === OTHER_GROUP ? 'Allgemein' : group}
                    {filtered.length > visibleLimit && ` (${visibleLimit} von ${filtered.length})`}
                  </div>
                  {activeTopic && topics?.includes(activeTopic) && (
                    <div className="group-subtitle">Thema: {activeTopic}</div>
                  )}
                  {displayItems.map((item) => (
                    <NewsCard
                      key={`${group}-${item.id}`}
                      item={item}
                      isNew={new Date(item.fetchedAt).getTime() > lastSeen}
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
            })}
            {entries.some(([, items]) => items.length > visibleLimit) && (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <button className="btn btn-outline" onClick={() => setVisibleLimit((n) => n + 50)}>
                  Mehr laden
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <ToastContainer />
    </div>
  )
}
