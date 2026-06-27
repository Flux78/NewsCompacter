import { useEffect, useState, useCallback } from 'react'
import { api, type SourceItem } from '../services/api'

export default function SourceManager() {
  const [sources, setSources] = useState<SourceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [suggestions, setSuggestions] = useState<{ name: string; url: string; source_type: string }[] | null>(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newType, setNewType] = useState('rss')

  const load = useCallback(async () => {
    setLoading(true)
    const s = await api.sources.list().catch(() => [] as SourceItem[])
    setSources(s)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const name = newName.trim()
    const url = newUrl.trim()
    if (!name || !url) return
    await api.sources.create(name, url, newType)
    setNewName('')
    setNewUrl('')
    await load()
  }

  const handleToggle = async (src: SourceItem) => {
    await api.sources.update(src.id, { enabled: !src.enabled })
    await load()
  }

  const handleDelete = async (id: number) => {
    await api.sources.delete(id)
    await load()
  }

  const handleSuggest = async () => {
    setSuggestLoading(true)
    try {
      const res = await api.sources.suggest()
      setSuggestions(res.suggestions)
    } catch {
      setSuggestions([])
    }
    setSuggestLoading(false)
  }

  const addSuggestion = async (s: { name: string; url: string; source_type: string }) => {
    await api.sources.create(s.name, s.url, s.source_type)
    setSuggestions(null)
    await load()
  }

  if (loading) {
    return <div className="container"><div className="empty-state"><span className="spinner" /></div></div>
  }

  return (
    <div className="container" style={{ maxWidth: '700px' }}>
      <h2>News-Quellen</h2>

      <div className="card">
        <div className="form-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (z.B. Heise)"
          />
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="RSS-URL"
          />
        </div>
        <div className="form-row" style={{ alignItems: 'end' }}>
          <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ marginBottom: 0 }}>
            <option value="rss">RSS</option>
            <option value="google_news">Google News (pro Thema)</option>
          </select>
          <button className="btn" onClick={handleCreate}>Hinzufügen</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button className="btn btn-outline btn-sm" onClick={handleSuggest} disabled={suggestLoading}>
          {suggestLoading ? <span className="spinner" /> : 'Intelligente Vorschläge (LLM)'}
        </button>
        {suggestions && (
          <button className="btn btn-outline btn-sm" onClick={() => setSuggestions(null)}>Vorschläge ausblenden</button>
        )}
      </div>

      {suggestions && suggestions.length > 0 && (
        <div className="card" style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Vorgeschlagene Quellen</h3>
          {suggestions.map((s, i) => (
            <div key={i} className="topic-row" style={{ fontSize: '0.85rem' }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{s.name}</span>
              <span style={{ flex: 2, color: 'var(--text-secondary)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</span>
              <span className="tag" style={{ margin: 0 }}>{s.source_type}</span>
              <button className="btn btn-sm" onClick={() => addSuggestion(s)}>+</button>
            </div>
          ))}
        </div>
      )}

      {sources.length === 0 ? (
        <div className="empty-state"><p>Keine Quellen konfiguriert.</p></div>
      ) : (
        <div className="topic-list">
          {sources.map((src) => (
            <div key={src.id} className="topic-row">
              <span className={`topic-dot ${src.enabled ? 'dot-imp' : 'dot-unimp'}`} />
              <span className="topic-name">{src.name}</span>
              <span className="tag" style={{ margin: 0, fontSize: '0.7rem' }}>{src.source_type}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {src.url}
              </span>
              <button className="btn btn-sm btn-outline" onClick={() => handleToggle(src)}>
                {src.enabled ? 'Deaktivieren' : 'Aktivieren'}
              </button>
              <button className="btn btn-sm btn-outline topic-del" onClick={() => handleDelete(src.id)} aria-label="Quelle löschen">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
