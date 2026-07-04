import { useMemo, useRef } from 'react'
import type { NewsItem } from '../services/api'

const MS_PER_DAY = 1000 * 60 * 60 * 24

export function useNewsFiltering(
  allNews: NewsItem[],
  ageFilter: string | null,
  keywordFilter: string,
  keywordMode: 'AND' | 'OR',
) {
  const nowRef = useRef(Date.now())

  function itemAge(item: NewsItem): number {
    const date = item.publishedAt ?? item.fetchedAt
    if (!date) return Infinity
    const diff = nowRef.current - new Date(date).getTime()
    return diff / MS_PER_DAY
  }

  const ageFiltered = useMemo(
    () => (ageFilter ? allNews.filter((item) => itemAge(item) <= Number(ageFilter)) : allNews),
    [allNews, ageFilter],
  )

  const filtered = useMemo(() => {
    if (!keywordFilter) return ageFiltered
    const keywords = keywordFilter.split(/[,\s]+/).filter(Boolean).map((k) => k.toLowerCase())
    if (keywords.length === 0) return ageFiltered
    return ageFiltered.filter((item) => {
      const searchText = [item.title, item.summary || '', item.content || '', ...item.tags].join(' ').toLowerCase()
      return keywordMode === 'AND'
        ? keywords.every((k) => searchText.includes(k))
        : keywords.some((k) => searchText.includes(k))
    })
  }, [ageFiltered, keywordFilter, keywordMode])

  return { filtered, itemAge }
}
