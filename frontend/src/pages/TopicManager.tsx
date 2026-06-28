import { useEffect, useState, useRef } from 'react'
import { api, type Topic, type NewsItem, type TagPref } from '../services/api'
import { useLoadOnMount } from '../useLoadOnMount'
import Tag from '../components/Tag'
import LoadingState from '../components/LoadingState'

export default function TopicManager(): JSX.Element {
  const [topics, setTopics] = useState<Topic[]>([])
  const [tagPrefs, setTagPrefs] = useState<TagPref[]>([])
  const [allNews, setAllNews] = useState<NewsItem[]>([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

  const { loading, reload } = useLoadOnMount(async () => {
    const [t, prefs, news] = await Promise.all([
      api.topics.list().catch(() => [] as Topic[]),
      api.tagPrefs.list().catch(() => [] as TagPref[]),
      api.news.list().catch(() => [] as NewsItem[]),
    ])
    setTopics(t)
    setTagPrefs(prefs)
    setAllNews(news)
  })

  useEffect(() => {
    if (editingId) editRef.current?.focus()
  }, [editingId])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    await api.topics.create(name)
    setNewName('')
    await reload()
  }

  const handleToggle = async (topic: Topic) => {
    await api.topics.update(topic.id, { is_important: !topic.isImportant })
    await reload()
  }

  const handleDelete = async (id: number) => {
    await api.topics.delete(id)
    await reload()
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
    await reload()
  }

  const cancelEdit = () => setEditingId(null)

  const handlePrefToggle = async (tag: string, important: boolean) => {
    await api.tagPrefs.set(tag, important)
    await reload()
  }

  const handlePrefDelete = async (tag: string) => {
    await api.tagPrefs.delete(tag)
    await reload()
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
      const tag = pref.tagName
      if (tag.toLowerCase().includes(lower) || lower.includes(tag.toLowerCase())) {
        matched.add(tag)
      }
    }
    return [...matched].sort()
  }

  const sorted = [...topics].sort((a, b) => {
    if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const sortedPrefs = [...tagPrefs].sort((a, b) => {
    if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1
    return a.tagName.localeCompare(b.tagName)
  })

  if (loading) {
    return <div className="container"><LoadingState /></div>
  }

  return (
    <div className="container container-narrow">
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
                  <span className={`topic-dot ${topic.isImportant ? 'dot-imp' : 'dot-unimp'}`} />
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
                    {topic.isImportant ? 'Unwichtig' : 'Interessant'}
                  </button>
                  <button className="btn btn-sm btn-outline topic-del" onClick={() => handleDelete(topic.id)} aria-label="Thema löschen">
                    ✕
                  </button>
                </div>
                {matchingTags.length > 0 && (
                  <div className="topic-tags">
                    {matchingTags.map((tag) => {
                      const pref = tagPrefs.find((p) => p.tagName.toLowerCase() === tag.toLowerCase())
                      const variant: 'important' | 'unimportant' | 'default' = pref ? (pref.isImportant ? 'important' : 'unimportant') : 'default'
                      return (
                        <Tag
                          key={tag}
                          className="topic-tag"
                          name={tag}
                          variant={variant}
                          onImportant={() => handlePrefToggle(tag, true)}
                          onUnimportant={() => handlePrefToggle(tag, false)}
                          onDelete={() => handlePrefDelete(tag)}
                        />
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
              <Tag
                key={p.tagName}
                  name={p.tagName}
                  variant={p.isImportant ? 'important' : 'unimportant'}
                  onImportant={() => handlePrefToggle(p.tagName, true)}
                  onUnimportant={() => handlePrefToggle(p.tagName, false)}
                  onDelete={() => handlePrefDelete(p.tagName)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
