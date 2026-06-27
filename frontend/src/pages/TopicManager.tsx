import { useEffect, useState, useCallback, useRef } from 'react'
import { api, type Topic, type NewsItem, type TagPref } from '../services/api'

export default function TopicManager() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [tagPrefs, setTagPrefs] = useState<TagPref[]>([])
  const [allNews, setAllNews] = useState<NewsItem[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [t, prefs, news] = await Promise.all([
      api.topics.list().catch(() => [] as Topic[]),
      api.tagPrefs.list().catch(() => [] as TagPref[]),
      api.news.list().catch(() => [] as NewsItem[]),
    ])
    setTopics(t)
    setTagPrefs(prefs)
    setAllNews(news)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (editingId) editRef.current?.focus()
  }, [editingId])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    await api.topics.create(name)
    setNewName('')
    await load()
  }

  const handleToggle = async (topic: Topic) => {
    await api.topics.update(topic.id, { is_important: !topic.is_important })
    await load()
  }

  const handleDelete = async (id: number) => {
    await api.topics.delete(id)
    await load()
  }

  const startEdit = (topic: Topic) => {
    setEditingId(topic.id)
    setEditValue(topic.name)
  }

  const saveEdit = async () => {
    const id = editingId
    if (id === null) return
    const name = editValue.trim()
    if (!name || name === topics.find((t) => t.id === id)?.name) {
      setEditingId(null)
      return
    }
    try {
      await api.topics.update(id, { name })
    } catch (e) {
      console.error('Topic rename failed', e)
    }
    setEditingId(null)
    await load()
  }

  const cancelEdit = () => setEditingId(null)

  const handlePrefToggle = async (tag: string, important: boolean) => {
    await api.tagPrefs.set(tag, important)
    await load()
  }

  const handlePrefDelete = async (tag: string) => {
    await api.tagPrefs.delete(tag)
    await load()
  }

  function tagsMatchingTopic(topicName: string): string[] {
    const lower = topicName.toLowerCase()
    const matched = new Set<string>()
    for (const item of allNews) {
      for (const tag of item.tags) {
        if (tag.toLowerCase().includes(lower) || lower.includes(tag.toLowerCase())) {
          matched.add(tag)
        }
      }
    }
    for (const pref of tagPrefs) {
      const tag = pref.tag_name
      if (tag.toLowerCase().includes(lower) || lower.includes(tag.toLowerCase())) {
        matched.add(tag)
      }
    }
    return [...matched].sort()
  }

  const sorted = [...topics].sort((a, b) => {
    if (a.is_important !== b.is_important) return a.is_important ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const sortedPrefs = [...tagPrefs].sort((a, b) => {
    if (a.is_important !== b.is_important) return a.is_important ? -1 : 1
    return a.tag_name.localeCompare(b.tag_name)
  })

  if (loading) {
    return <div className="container"><div className="empty-state"><span className="spinner" /></div></div>
  }

  return (
    <div className="container" style={{ maxWidth: '700px' }}>
      <h2>Themengebiete</h2>

      <div className="topic-add">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Neues Thema, z.B. Künstliche Intelligenz"
          style={{ marginBottom: 0 }}
        />
        <button className="btn btn-sm" onClick={handleCreate}>+</button>
      </div>

      {topics.length === 0 ? (
        <div className="empty-state" style={{ padding: '2rem 1rem' }}>
          <p>Noch keine Themengebiete angelegt.</p>
        </div>
      ) : (
        <div className="topic-list" style={{ marginBottom: '1.5rem' }}>
          {sorted.map((topic) => {
            const matchingTags = tagsMatchingTopic(topic.name)
            return (
              <div key={topic.id}>
                <div className="topic-row">
                  <span className={`topic-dot ${topic.is_important ? 'dot-imp' : 'dot-unimp'}`} />
                  {editingId === topic.id ? (
                    <input
                      ref={editRef}
                      className="topic-edit-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit()
                        else if (e.key === 'Escape') cancelEdit()
                      }}
                      onBlur={saveEdit}
                    />
                  ) : (
                    <span className="topic-name topic-name-clickable" onClick={() => startEdit(topic)} title="Klicken zum Bearbeiten">
                      {topic.name}
                    </span>
                  )}
                  <button className="btn btn-sm btn-outline" onClick={() => handleToggle(topic)}>
                    {topic.is_important ? 'Unwichtig' : 'Interessant'}
                  </button>
                  <button className="btn btn-sm btn-outline topic-del" onClick={() => handleDelete(topic.id)} aria-label="Thema löschen">
                    ✕
                  </button>
                </div>
                {matchingTags.length > 0 && (
                  <div className="topic-tags">
                    {matchingTags.map((tag) => {
                      const pref = tagPrefs.find((p) => p.tag_name.toLowerCase() === tag.toLowerCase())
                      const variant = pref ? (pref.is_important ? 'important' : 'unimportant') : 'default'
                      return (
                        <span key={tag} className={`topic-tag tag ${variant}`}>
                          {tag}
                          <button
                            className={`topic-tag-btn${variant === 'important' ? ' topic-tag-btn-active-plus' : ''}`}
                            onClick={() => handlePrefToggle(tag, true)}
                            title="Als relevant"
                          >+</button>
                          <button
                            className={`topic-tag-btn${variant === 'unimportant' ? ' topic-tag-btn-active-minus' : ''}`}
                            onClick={() => handlePrefToggle(tag, false)}
                            title="Als irrelevant"
                          >−</button>
                          <button className="topic-tag-btn" onClick={() => handlePrefDelete(tag)} title="Bewertung löschen">✕</button>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tagPrefs.length > 0 && (
        <>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Bewertete Tags ({tagPrefs.length})
          </h3>
          <div className="topic-tag-list">
            {sortedPrefs.map((p) => (
              <span key={p.tag_name} className={`tag ${p.is_important ? 'important' : 'unimportant'}`}>
                {p.tag_name}
                <button
                  className={`topic-tag-btn${p.is_important ? ' topic-tag-btn-active-plus' : ''}`}
                  onClick={() => handlePrefToggle(p.tag_name, true)}
                  title="Als relevant"
                >+</button>
                <button
                  className={`topic-tag-btn${!p.is_important ? ' topic-tag-btn-active-minus' : ''}`}
                  onClick={() => handlePrefToggle(p.tag_name, false)}
                  title="Als irrelevant"
                >−</button>
                <button className="topic-tag-btn" onClick={() => handlePrefDelete(p.tag_name)}>✕</button>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
