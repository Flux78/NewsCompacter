import { useEffect, useState, useRef, useMemo } from 'react'
import { api, type Topic, type TopicGroup, type NewsItem, type TagPref } from '../services/api'
import { useLoadOnMount } from '../useLoadOnMount'
import Tag from '../components/Tag'
import LoadingState from '../components/LoadingState'

export default function TopicManager(): JSX.Element {
  const [topics, setTopics] = useState<Topic[]>([])
  const [groups, setGroups] = useState<TopicGroup[]>([])
  const [tagPrefs, setTagPrefs] = useState<TagPref[]>([])
  const [allNews, setAllNews] = useState<NewsItem[]>([])
  const [newName, setNewName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editGroupValue, setEditGroupValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const groupEditRef = useRef<HTMLInputElement>(null)

  const { loading, reload } = useLoadOnMount(async () => {
    const [t, prefs, news, g] = await Promise.all([
      api.topics.list().catch(() => [] as Topic[]),
      api.tagPrefs.list().catch(() => [] as TagPref[]),
      api.news.list().catch(() => [] as NewsItem[]),
      api.topicGroups.list().catch(() => [] as TopicGroup[]),
    ])
    setTopics(t)
    setTagPrefs(prefs)
    setAllNews(news)
    setGroups(g)
  })

  useEffect(() => {
    if (editingId) editRef.current?.focus()
  }, [editingId])

  useEffect(() => {
    if (editingGroupId) groupEditRef.current?.focus()
  }, [editingGroupId])

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

  const handleSetGroup = async (topicId: number, groupId: number | null) => {
    await api.topics.update(topicId, { group_id: groupId })
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

  const handleCreateGroup = async () => {
    const name = newGroupName.trim()
    if (!name) return
    await api.topicGroups.create(name, groups.length)
    setNewGroupName('')
    await reload()
  }

  const startGroupEdit = (group: TopicGroup) => {
    setEditingGroupId(group.id)
    setEditGroupValue(group.name)
  }

  const saveGroupEdit = async () => {
    const id = editingGroupId
    if (id === null) return
    const name = editGroupValue.trim()
    if (!name || name === groups.find((g) => g.id === id)?.name) {
      setEditingGroupId(null)
      return
    }
    try {
      await api.topicGroups.update(id, { name })
    } catch (e) {
      console.error('Group rename failed', e)
    }
    setEditingGroupId(null)
    await reload()
  }

  const cancelGroupEdit = () => setEditingGroupId(null)

  const handleDeleteGroup = async (id: number) => {
    await api.topicGroups.delete(id)
    await reload()
  }

  const handleGroupMove = async (id: number, dir: -1 | 1) => {
    const idx = groups.findIndex((g) => g.id === id)
    if (idx === -1) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= groups.length) return
    const swapped = [...groups]
    const tmp = swapped[idx].displayOrder
    swapped[idx] = { ...swapped[idx], displayOrder: swapped[newIdx].displayOrder }
    swapped[newIdx] = { ...swapped[newIdx], displayOrder: tmp }
    await Promise.all([
      api.topicGroups.update(swapped[idx].id, { display_order: swapped[idx].displayOrder }),
      api.topicGroups.update(swapped[newIdx].id, { display_order: swapped[newIdx].displayOrder }),
    ])
    await reload()
  }

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

  const groupedTopics = useMemo(() => {
    const entries: { key: string; label: string; topics: Topic[] }[] = []
    for (const group of groups) {
      const gt = topics
        .filter((t) => t.groupId === group.id)
        .sort((a, b) => a.name.localeCompare(b.name))
      if (gt.length > 0) {
        entries.push({ key: `g${group.id}`, label: group.name, topics: gt })
      }
    }
    const ungrouped = [...topics]
      .filter((t) => !t.groupId)
      .sort((a, b) => {
        if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    if (ungrouped.length > 0) {
      entries.push({ key: '_nogroup', label: 'Ohne Gruppe', topics: ungrouped })
    }
    return entries
  }, [topics, groups])

  const sortedPrefs = [...tagPrefs].sort((a, b) => {
    if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1
    return a.tagName.localeCompare(b.tagName)
  })

  if (loading) {
    return <div className="container"><LoadingState /></div>
  }

  return (
    <div className="container container-narrow">
      <h2>Themengruppen</h2>

      <div className="topic-add" style={{ marginBottom: '0.75rem' }}>
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
          placeholder="Neue Gruppe, z.B. Ukraine-Konflikt"
          style={{ marginBottom: 0 }}
        />
        <button className="btn btn-sm" onClick={handleCreateGroup}>+</button>
      </div>

      {groups.length > 0 && (
        <div className="topic-list" style={{ marginBottom: '1.5rem' }}>
          {groups.map((group, idx) => (
            <div key={group.id} className="topic-row" style={{ paddingLeft: '0.5rem' }}>
              <div className="topic-row-move">
                <button className="btn btn-sm btn-outline" disabled={idx === 0} onClick={() => handleGroupMove(group.id, -1)} title="Nach oben">↑</button>
                <button className="btn btn-sm btn-outline" disabled={idx === groups.length - 1} onClick={() => handleGroupMove(group.id, 1)} title="Nach unten">↓</button>
              </div>
              {editingGroupId === group.id ? (
                <input
                  ref={groupEditRef}
                  className="topic-edit-input"
                  value={editGroupValue}
                  onChange={(e) => setEditGroupValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveGroupEdit()
                    else if (e.key === 'Escape') cancelGroupEdit()
                  }}
                  onBlur={saveGroupEdit}
                />
              ) : (
                <span className="topic-name topic-name-clickable" onClick={() => startGroupEdit(group)} title="Klicken zum Bearbeiten">
                  {group.name}
                </span>
              )}
              <button className="btn btn-sm btn-outline topic-del" onClick={() => handleDeleteGroup(group.id)} aria-label="Gruppe löschen">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

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
          {groupedTopics.map((entry) => (
            <div key={entry.key}>
              {entry.key !== '_nogroup' && (
                <div className="group-section-header">{entry.label}</div>
              )}
              {entry.topics.map((topic) => {
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
                      <select
                        className="topic-group-select"
                        value={topic.groupId ?? ''}
                        onChange={(e) => handleSetGroup(topic.id, e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">Keine Gruppe</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
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
          ))}
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
