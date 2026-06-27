import { useEffect, useState, useCallback } from 'react'
import { api, type LlmConfig as LlmConfigType } from '../services/api'
import ModelSelect from '../components/ModelSelect'

const DEFAULT_CONFIG: LlmConfigType = {
  provider: 'openrouter',
  api_key: '',
  has_api_key: false,
  model: 'meta-llama/llama-3.2-3b-instruct',
  base_url: 'https://openrouter.ai/api/v1',
}

export default function LlmConfig() {
  const [config, setConfig] = useState<LlmConfigType>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [intervalVal, setIntervalVal] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [cfg, intv] = await Promise.all([
      api.llmConfig.get().catch(() => null),
      api.fetch.getInterval().catch(() => ({ minutes: null })),
    ])
    if (cfg) setConfig(cfg)
    setIntervalVal(intv.minutes)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      await api.llmConfig.update(config)
      setMessage('Gespeichert')
    } catch {
      setMessage('Fehler beim Speichern')
    }
    setSaving(false)
  }

  const handleIntervalSave = async () => {
    try {
      await api.fetch.setInterval(intervalVal)
      setMessage('Intervall gespeichert')
    } catch {
      setMessage('Fehler beim Speichern')
    }
  }

  if (loading) {
    return <div className="container"><div className="empty-state"><span className="spinner" /></div></div>
  }

  return (
    <div className="container">
      <h2>LLM-Konfiguration</h2>

      <div className="card">
        <label>Provider</label>
        <input value={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value })} />

        <label>API-Key</label>
        <input
          type="password"
          value={config.api_key}
          onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
          placeholder={config.has_api_key ? '•••••••• (bereits gesetzt)' : 'sk-or-...'}
        />

        <label>Model</label>
        <ModelSelect
          value={config.model}
          onChange={(model) => setConfig({ ...config, model })}
        />

        <label>Base URL</label>
        <input
          value={config.base_url}
          onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
          placeholder="https://openrouter.ai/api/v1"
        />

        <button className="btn" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Speichern'}
        </button>
      </div>

      <h2 style={{ marginTop: '1.5rem' }}>Zyklischer Abruf</h2>
      <div className="card">
        <label>Intervall</label>
        <select
          value={intervalVal ?? ''}
          onChange={(e) => setIntervalVal(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Aus (nur manuell)</option>
          <option value="60">Stündlich</option>
          <option value="360">Alle 6 Stunden</option>
          <option value="1440">Alle 24 Stunden</option>
        </select>
        <button className="btn" onClick={handleIntervalSave}>Speichern</button>
      </div>

      {message && (
        <p style={{ fontSize: '0.85rem', marginTop: '0.75rem' }} className="msg">{message}</p>
      )}
    </div>
  )
}
