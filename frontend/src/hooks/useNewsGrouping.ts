import { useMemo } from 'react'
import type { NewsItem, Topic, TopicGroup, TagPref } from '../services/api'

const OTHER_GROUP = 'other'

export function groupId(name: string) {
  return 'group-' + name.toLowerCase().replace(/\s+/g, '-')
}

export function useNewsGrouping(
  keywordFilteredNews: NewsItem[],
  topics: Topic[],
  topicGroups: TopicGroup[],
  tagPrefs: TagPref[],
) {
  const { importantTags, unimportantTags } = useMemo(() => {
    const important = new Set<string>()
    const unimportant = new Set<string>()
    for (const t of tagPrefs) {
      const lower = t.tagName.toLowerCase()
      if (t.isImportant) important.add(lower)
      else unimportant.add(lower)
    }
    return { importantTags: important, unimportantTags: unimportant }
  }, [tagPrefs])

  const importantTopics = useMemo(
    () => topics.filter((t) => t.isImportant),
    [topics],
  )

  const sortedGroups = useMemo(
    () => [...topicGroups].sort((a, b) => a.displayOrder - b.displayOrder),
    [topicGroups],
  )

  const groupTopicMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const group of sortedGroups) {
      const names = importantTopics
        .filter((t) => t.groupId === group.id)
        .map((t) => t.name)
      if (names.length > 0) {
        map.set(group.name, names)
      }
    }
    return map
  }, [sortedGroups, importantTopics])

  function itemMatchesTopic(item: NewsItem, topicLower: string): boolean {
    const escaped = topicLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp('\\b' + escaped + '\\b')
    if (item.tags.some((t) => pattern.test(t.toLowerCase()))) return true
    if (pattern.test(item.title.toLowerCase())) return true
    if (pattern.test((item.summary ?? '').toLowerCase())) return true
    if (pattern.test((item.content ?? '').toLowerCase())) return true
    return false
  }

  function itemScore(item: NewsItem): number {
    let score = 0
    for (const tag of item.tags) {
      const lower = tag.toLowerCase()
      if (importantTags.has(lower)) score += 1
      else if (unimportantTags.has(lower)) score -= 1
    }
    return score
  }

  const entries = useMemo(() => {
    const grouped: Record<string, NewsItem[]> = {}

    for (const item of keywordFilteredNews) {
      let matched = false

      for (const group of sortedGroups) {
        const groupTopics = importantTopics.filter((t) => t.groupId === group.id)
        if (groupTopics.length === 0) continue
        const groupName = group.name
        for (const topic of groupTopics) {
          if (itemMatchesTopic(item, topic.name.toLowerCase())) {
            if (!grouped[groupName]) grouped[groupName] = []
            grouped[groupName].push(item)
            matched = true
            break
          }
        }
        if (matched) break
      }

      if (!matched) {
        for (const topic of importantTopics) {
          if (topic.groupId) continue
          if (itemMatchesTopic(item, topic.name.toLowerCase())) {
            if (!grouped[topic.name]) grouped[topic.name] = []
            grouped[topic.name].push(item)
            matched = true
            break
          }
        }
      }

      if (!matched) {
        if (!grouped[OTHER_GROUP]) grouped[OTHER_GROUP] = []
        grouped[OTHER_GROUP].push(item)
      }
    }

    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => itemScore(b) - itemScore(a))
    }

    const orderedKeys = [
      ...sortedGroups
        .filter((g) => grouped[g.name]?.length > 0)
        .map((g) => g.name),
      ...importantTopics
        .filter((t) => !t.groupId && grouped[t.name]?.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => t.name),
    ]
    if (grouped[OTHER_GROUP]?.length > 0) orderedKeys.push(OTHER_GROUP)

    const orderMap = new Map(orderedKeys.map((name, idx) => [name, idx]))
    return Object.entries(grouped)
      .filter(([, items]) => items.length > 0)
      .sort(([a], [b]) => {
        const ai = orderMap.get(a); const bi = orderMap.get(b)
        if (ai === undefined && bi === undefined) return 0
        if (ai === undefined) return 1
        if (bi === undefined) return -1
        return ai - bi
      })
  }, [keywordFilteredNews, importantTopics, sortedGroups, importantTags, unimportantTags])

  return {
    importantTags,
    unimportantTags,
    importantTopics,
    sortedGroups,
    groupTopicMap,
    itemMatchesTopic,
    itemScore,
    entries,
    OTHER_GROUP,
  }
}
