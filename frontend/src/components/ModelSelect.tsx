import { useState, useRef, useEffect } from 'react'

interface ModelOption {
  id: string
  label: string
  free: boolean
}

const MODELS: ModelOption[] = [
  { id: 'meta-llama/llama-3.2-3b-instruct', label: 'Llama 3.2 3B', free: true },
  { id: 'meta-llama/llama-3.2-1b-instruct', label: 'Llama 3.2 1B', free: true },
  { id: 'google/gemma-2-2b-it', label: 'Gemma 2 2B', free: true },
  { id: 'google/gemma-2-9b-it', label: 'Gemma 2 9B', free: true },
  { id: 'microsoft/phi-3-mini-128k-instruct', label: 'Phi-3 Mini 128K', free: true },
  { id: 'mistralai/mistral-7b-instruct', label: 'Mistral 7B', free: true },
  { id: 'cognitivecomputations/dolphin-2.9-llama3-8b', label: 'Dolphin 2.9 Llama 8B', free: true },
  { id: 'gryphe/mythomax-l2-13b', label: 'MythoMax L2 13B', free: true },

  { id: 'openai/gpt-4o', label: 'GPT-4o', free: false },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', free: false },
  { id: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo', free: false },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', free: false },
  { id: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku', free: false },
  { id: 'google/gemini-pro', label: 'Gemini Pro', free: false },
  { id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5', free: false },
  { id: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B', free: false },
  { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', free: false },
  { id: 'meta-llama/llama-3.1-405b-instruct', label: 'Llama 3.1 405B', free: false },
  { id: 'mistralai/mixtral-8x7b-instruct', label: 'Mixtral 8x7B', free: false },
  { id: 'mistralai/mistral-large', label: 'Mistral Large', free: false },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', free: false },
  { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B', free: false },
  { id: 'cohere/command-r-plus', label: 'Command R+', free: false },
  { id: 'nousresearch/hermes-3-llama-3.1-405b', label: 'Hermes 3 405B', free: false },
].sort((a, b) => {
  if (a.free !== b.free) return a.free ? -1 : 1
  return a.label.localeCompare(b.label)
})

interface ModelSelectProps {
  value: string
  onChange: (value: string) => void
}

export default function ModelSelect({ value, onChange }: ModelSelectProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState(value)
  const [highlight, setHighlight] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const showAll = open && !dirty
  const filter = showAll ? '' : input.toLowerCase()
  const filtered = MODELS.filter(
    (m) => m.id.toLowerCase().includes(filter) || m.label.toLowerCase().includes(filter),
  )

  useEffect(() => {
    if (!focused) {
      setInput(value)
      setDirty(false)
    }
  }, [value, focused])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="model-select" style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={input}
        placeholder="meta-llama/llama-3.2-3b-instruct"
        onChange={(e) => {
          setInput(e.target.value)
          onChange(e.target.value)
          setDirty(true)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => {
          setOpen(true)
          setDirty(false)
          setFocused(true)
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && open && filtered[highlight]) {
            e.preventDefault()
            setInput(filtered[highlight].id)
            onChange(filtered[highlight].id)
            setOpen(false)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />

      {open && (
        <div className="model-dropdown">
          {filtered.length === 0 ? (
            <div className="model-option model-option-empty">
              Eigene Eingabe: <strong>{input}</strong>
            </div>
          ) : (
            filtered.map((m, i) => (
              <div
                key={m.id}
                className={`model-option ${i === highlight ? 'model-option-active' : ''} ${m.free ? 'model-option-free' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setInput(m.id)
                  onChange(m.id)
                  setOpen(false)
                  inputRef.current?.blur()
                }}
              >
                <span className="model-option-label">{m.label}</span>
                <span className="model-option-id">{m.id}</span>
                {m.free && <span className="model-option-badge">Free</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
