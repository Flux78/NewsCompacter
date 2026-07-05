import { useState, useCallback, useEffect, useMemo } from 'react'
import { api, type LlmConfig as LlmConfigType } from '../services/api'
import ModelSelect, { OPENROUTER_MODELS, DEEPSEEK_MODELS, ALL_MODELS, type ModelOption } from '../components/ModelSelect'
import { useLoadOnMount } from '../useLoadOnMount'
import SpinnerButton from '../components/SpinnerButton'
import LoadingState from '../components/LoadingState'

const INTERVALS: { value: number; label: string }[] = [
  { value: 60, label: 'Stündlich' },
  { value: 360, label: 'Alle 6 Stunden' },
  { value: 1440, label: 'Alle 24 Stunden' },
]

interface ProviderPreset {
  id: string
  label: string
  provider: string
  baseUrl: string
  defaultModel: string
  models: ModelOption[]
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.2-3b-instruct',
    models: OPENROUTER_MODELS,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    models: DEEPSEEK_MODELS,
  },
  {
    id: 'custom',
    label: 'Benutzerdefiniert',
    provider: '',
    baseUrl: '',
    defaultModel: '',
    models: ALL_MODELS,
  },
]

function detectPreset(provider: string, baseUrl: string): string {
  for (const p of PROVIDER_PRESETS) {
    if (p.id === 'custom') continue
    if (p.provider === provider && p.baseUrl === baseUrl) return p.id
  }
  return 'custom'
}

const DEFAULT_CONFIG: LlmConfigType = {
  provider: 'openrouter',
  apiKey: '',
  hasApiKey: false,
  model: 'meta-llama/llama-3.2-3b-instruct',
  baseUrl: 'https://openrouter.ai/api/v1',
}

export default function LlmConfig(): JSX.Element {
  const [config, setConfig] = useState<LlmConfigType>(DEFAULT_CONFIG)
  const [presetId, setPresetId] = useState('openrouter')
  const [keyDirty, setKeyDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [intervalVal, setIntervalVal] = useState<number | null>(null)

  const { loading, reload } = useLoadOnMount(async () => {
    const [cfg, intv] = await Promise.all([
      api.llmConfig.get().catch(() => null),
      api.fetch.getInterval().catch(() => ({ minutes: null })),
    ])
    if (cfg) {
      setConfig({ ...cfg, apiKey: '' })
      setPresetId(detectPreset(cfg.provider, cfg.baseUrl))
    }
    setIntervalVal(intv.minutes)
  })

  const activePreset = PROVIDER_PRESETS.find((p) => p.id === presetId)

  const handlePresetChange = useCallback((newPresetId: string) => {
    setPresetId(newPresetId)
    const preset = PROVIDER_PRESETS.find((p) => p.id === newPresetId)
    if (preset) {
      setConfig((c) => ({
        ...c,
        provider: preset.provider,
        baseUrl: preset.baseUrl,
        model: preset.defaultModel || c.model,
      }))
    }
  }, [])

  const [dynamicModels, setDynamicModels] = useState<ModelOption[] | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)

  useEffect(() => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === presetId)
    if (!preset || !preset.baseUrl) {
      setDynamicModels(null)
      return
    }

    setModelsLoading(true)
    api.llmConfig.models(preset.baseUrl)
      .then((res) => {
        const fetched: ModelOption[] = (res.models || [])
          .filter((m) => m.id)
          .map((m) => ({ id: m.id, label: m.id, free: false }))
        setDynamicModels(fetched.length > 0 ? fetched : null)
      })
      .catch(() => {
        setDynamicModels(null)
      })
      .finally(() => setModelsLoading(false))
  }, [presetId])

  const activeModels = useMemo(() => {
    if (dynamicModels && dynamicModels.length > 0) return dynamicModels
    if (activePreset?.models && activePreset.models.length > 0) return activePreset.models
    return undefined
  }, [dynamicModels, activePreset])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const payload: LlmConfigType & { clearApiKey?: boolean } = { ...config }
      if (!keyDirty) {
        delete payload.apiKey
      }
      await api.llmConfig.update(payload)
      setKeyDirty(false)
      setConfig((c) => ({ ...c, apiKey: '', hasApiKey: !payload.clearApiKey && (c.hasApiKey || keyDirty) }))
      setMessage('Gespeichert')
    } catch {
      setMessage('Fehler beim Speichern')
    }
    setSaving(false)
  }

  const handleClearKey = async () => {
    setSaving(true)
    setMessage('')
    try {
      await api.llmConfig.update({ ...config, apiKey: '', clearApiKey: true } as LlmConfigType & { clearApiKey: boolean })
      setKeyDirty(false)
      setConfig((c) => ({ ...c, apiKey: '', hasApiKey: false }))
      setMessage('API-Key gelöscht')
    } catch {
      setMessage('Fehler beim Löschen')
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
    return <div className="container"><LoadingState /></div>
  }

  return (
    <div className="container">
      <h2>LLM-Konfiguration</h2>

      <div className="card">
        <label>Provider-Preset</label>
        <select
          value={presetId}
          onChange={(e) => handlePresetChange(e.target.value)}
        >
          {PROVIDER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>

        <label>Provider</label>
        <input value={config.provider} onChange={(e) => {
          setConfig({ ...config, provider: e.target.value })
          setPresetId(detectPreset(e.target.value, config.baseUrl))
        }} />

        <label>API-Key</label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => {
              setConfig({ ...config, apiKey: e.target.value })
              setKeyDirty(true)
            }}
            placeholder={!keyDirty && config.hasApiKey ? '•••••••• (bereits gesetzt)' : 'sk-or-...'}
            style={{ marginBottom: 0, flex: 1 }}
          />
          {config.hasApiKey && (
            <button type="button" className="btn btn-sm btn-outline" onClick={handleClearKey} style={{ flexShrink: 0, marginBottom: 0 }}>
              Key löschen
            </button>
          )}
        </div>

        <label>Model{modelsLoading ? ' (lade…)' : ''}</label>
        <ModelSelect
          value={config.model}
          onChange={(model) => setConfig({ ...config, model })}
          models={activeModels}
        />

        <label>Base URL</label>
        <input
          value={config.baseUrl}
          onChange={(e) => {
            setConfig({ ...config, baseUrl: e.target.value })
            setPresetId(detectPreset(config.provider, e.target.value))
          }}
          placeholder="https://openrouter.ai/api/v1"
        />

        <SpinnerButton className="btn" onClick={handleSave} loading={saving}>
          Speichern
        </SpinnerButton>
      </div>

      <h2 style={{ marginTop: '1.5rem' }}>Zyklischer Abruf</h2>
      <div className="card">
        <label>Intervall</label>
        <select
          value={intervalVal ?? ''}
          onChange={(e) => setIntervalVal(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Aus (nur manuell)</option>
          {INTERVALS.map((i) => (
            <option key={i.value} value={i.value}>{i.label}</option>
          ))}
        </select>
        <button className="btn" onClick={handleIntervalSave}>Speichern</button>
      </div>

      {message && (
        <p style={{ fontSize: '0.85rem', marginTop: '0.75rem' }} className="msg">{message}</p>
      )}
    </div>
  )
}
