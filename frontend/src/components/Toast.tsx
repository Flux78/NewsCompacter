import { useEffect, useState, useCallback } from 'react'

interface ToastItem {
  id: number
  message: string
  onUndo?: () => void
}

let _nextId = 0
const _listeners: Set<(toasts: ToastItem[]) => void> = new Set()
let _toasts: ToastItem[] = []

function notify() {
  for (const fn of _listeners) fn([..._toasts])
}

export function showToast(message: string, onUndo?: () => void) {
  const id = ++_nextId
  _toasts = [..._toasts, { id, message, onUndo }]
  notify()
  setTimeout(() => {
    _toasts = _toasts.filter((t) => t.id !== id)
    notify()
  }, 5000)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const handler = (t: ToastItem[]) => setToasts(t)
    _listeners.add(handler)
    return () => { _listeners.delete(handler) }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: '1rem', right: '1rem', zIndex: 200,
      display: 'flex', flexDirection: 'column', gap: '0.5rem',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: 'var(--surface)', color: 'var(--text)',
          padding: '0.5rem 1rem', borderRadius: '8px',
          boxShadow: '0 2px 8px var(--shadow)',
          fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <span>{t.message}</span>
          {t.onUndo && (
            <button
              className="btn btn-sm btn-outline"
              onClick={t.onUndo}
              style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
            >
              Rückgängig
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
