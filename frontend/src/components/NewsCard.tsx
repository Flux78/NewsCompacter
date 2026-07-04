import { useState, useEffect, useMemo, type ReactNode } from 'react'
import type { NewsItem } from '../services/api'
import SourceLink from './SourceLink'
import Tag from './Tag'

const TRUNCATE_LENGTH = 200
const LOCALE = 'de-DE'

function highlightText(text: string, keywords: string[]): ReactNode {
  if (!keywords.length || !text) return text
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(pattern)
  return parts.map((part, i) => {
    if (part && pattern.test(part)) {
      return <mark key={i}>{part}</mark>
    }
    return part
  })
}

interface NewsCardProps {
  item: NewsItem
  keywordFilter?: string
  onTagImportant?: (tag: string) => void
  onTagUnimportant?: (tag: string) => void
  importantTags?: Set<string>
  unimportantTags?: Set<string>
  onSaveToggle?: (id: number, saved: boolean) => void
}

export default function NewsCard({ item, keywordFilter, onTagImportant, onTagUnimportant, importantTags, unimportantTags, onSaveToggle }: NewsCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [showImg, setShowImg] = useState(false)
  const [saved, setSaved] = useState(item.isSaved)

  useEffect(() => {
    setSaved(item.isSaved)
  }, [item.isSaved])

  const highlightKeywords = useMemo(
    () => (keywordFilter ? keywordFilter.split(/[,\s]+/).filter(Boolean) : []),
    [keywordFilter],
  )

  const sourceLinks = useMemo(() => {
    const urls = item.sourceUrl.split(' | ')
    const names = item.source.split(' + ')
    return urls.map((url, i) => {
      const name = names[i]?.trim()
      return name ? { url: url.trim(), source: name } : null
    }).filter(Boolean) as { url: string; source: string }[]
  }, [item.sourceUrl, item.source])

  return (
    <div className={`card${saved ? ' card-saved' : ''}`}>
      <div className="news-header">
        <h3
          className="news-title-img"
          onMouseEnter={() => item.imageUrl && setShowImg(true)}
          onMouseLeave={() => setShowImg(false)}
          onClick={() => item.imageUrl && setShowImg(!showImg)}
        >
          {highlightText(item.title, highlightKeywords)}
          {showImg && item.imageUrl && (
            <span className="news-img-popup">
              <img src={item.imageUrl} alt="" loading="lazy" />
            </span>
          )}
        </h3>
        <button
          className={`btn-save${saved ? ' saved' : ''}`}
          onClick={async () => {
            const next = !saved
            setSaved(next)
            try {
              onSaveToggle?.(item.id, next)
            } catch {
              setSaved(!next)
            }
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

        {sourceLinks.map((link) => (
          <SourceLink key={link.url} source={link.source} url={link.url} />
        ))}

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
          {new Date(item.fetchedAt).toLocaleDateString(LOCALE, {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}
