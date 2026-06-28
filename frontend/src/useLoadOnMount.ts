import { useEffect, useState, useCallback, useRef } from 'react'

export function useLoadOnMount(fn: () => Promise<void>) {
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const load = useCallback(async () => {
    setLoading(true)
    try {
      await fnRef.current()
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { loading, reload: load }
}
