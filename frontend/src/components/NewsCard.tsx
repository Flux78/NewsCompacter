import { useState, useEffect, useMemo, type ReactNode } from 'react'
import type { NewsItem } from '../services/api'
import SourceLink from './SourceLink'
import Tag from './Tag'

const TRUNCATE_LENGTH = 200

function highlightText(text: string, keywords: string[]): ReactNode {
  if (!keywords.length || !text) return text
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(pattern)
  const lowerKeywords = keywords.map((k) => k.toLowerCase())
  return parts.map((part, i) => {
    if (part && lowerKeywords.includes(part.toLowerCase())) {
      return <mark key={i}>{part}</mark>
    }
    return part
  })
}

interface Props {
  item: NewsItem
  keywordFilter?: string
  onTagImportant?: (tag: string) => void
  onTagUnimportant?: (tag: string) => void
  importantTags?: Set<string>
  unimportantTags?: Set<string>
  onSaveToggle?: (id: number, saved: boolean) => void
}

export default function NewsCard({ item, keywordFilter, onTagImportant, onTagUnimportant, importantTags, unimportantTags, onSaveToggle }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [showImg, setShowImg] = useState(false)
  const [saved, setSaved] = useState(item.is_saved)

  useEffect(() => {
    setSaved(item.is_saved)
  }, [item.is_saved])

  const highlightKeywords = useMemo(
    () => (keywordFilter ? keywordFilter.split(/[,\s]+/).filter(Boolean) : []),
    [keywordFilter],
  )

  return (
    <div className={`card${saved ? ' card-saved' : ''}`}>
      <div className="news-header">
        <h3
          className="news-title-img"
          onMouseEnter={() => item.image_url && setShowImg(true)}
          onMouseLeave={() => setShowImg(false)}
        >
          {highlightText(item.title, highlightKeywords)}
          {showImg && item.image_url && (
            <span className="news-img-popup">
              <img src={item.image_url} alt="" loading="lazy" />
            </span>
          )}
        </h3>
        <button
          className={`btn-save${saved ? ' saved' : ''}`}
          onClick={() => {
            const next = !saved
            setSaved(next)
            onSaveToggle?.(item.id, next)
          }}
          title={saved ? 'Nicht mehr speichern' : 'Zum Speichern markieren'}
          aria-label={saved ? 'Nicht mehr speichern' : 'Zum Speichern markieren'}
        >
          {saved ? '★' : '☆'}
        </button>
      </div>

      <div className="summary">
        {highlightText(item.summary ?? item.content?.slice(0, TRUNCATE_LENGTH) ?? 'Keine Zusammenfassung', highlightKeywords)}
      </div>

      {expanded && item.content && (
        <div className="details">{highlightText(item.content, highlightKeywords)}</div>
      )}

      <div className="news-meta">
        <button className="btn btn-sm btn-outline" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Weniger' : 'Mehr'}
        </button>

        {item.source_url.split(' | ').map((url, i) => {
          const sources = item.source.split(' + ')
          return <SourceLink key={i} source={sources[i]?.trim() || sources[0]} url={url.trim()} />
        })}

        {item.tags.map((tag) => {
          const lower = tag.toLowerCase()
          let variant: 'default' | 'important' | 'unimportant' = 'default'
          if (importantTags?.has(lower)) variant = 'important'
          else if (unimportantTags?.has(lower)) variant = 'unimportant'
          return (
            <Tag
              key={tag}
              name={tag}
              variant={variant}
              onImportant={onTagImportant ? () => onTagImportant(tag) : undefined}
              onUnimportant={onTagUnimportant ? () => onTagUnimportant(tag) : undefined}
            />
          )
        })}

        <span className="news-time">
          {new Date(item.fetched_at).toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}
