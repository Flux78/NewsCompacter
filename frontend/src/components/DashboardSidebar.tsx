import { groupId, type OTHER_GROUP as OtherGroupType } from '../hooks/useNewsGrouping'

interface DashboardSidebarProps {
  entries: [string, unknown[]][]
  groupTopicMap: Map<string, string[]>
  activeGroup: string | null
  activeTopic: string | null
  otherGroup: string
  topicNewsCounts: Map<string, number>
  onScrollToGroup: (name: string) => void
  onScrollToTopic: (groupName: string, topicName: string) => void
}

export default function DashboardSidebar({
  entries,
  groupTopicMap,
  activeGroup,
  activeTopic,
  otherGroup,
  topicNewsCounts,
  onScrollToGroup,
  onScrollToTopic,
}: DashboardSidebarProps) {
  if (entries.length === 0) {
    return (
      <aside className="dash-sidebar">
        <h3>Kapitel</h3>
        <p className="dash-sidebar-empty">Keine</p>
      </aside>
    )
  }

  return (
    <aside className="dash-sidebar">
      <h3>Kapitel</h3>
      <ul>
        {entries.map(([group]) => {
          const topics = groupTopicMap.get(group)
          return (
            <li key={group}>
              <button
                className={`dash-sidebar-link${activeGroup === group && !activeTopic ? ' active' : ''}`}
                onClick={() => onScrollToGroup(group)}
              >
                {group === otherGroup ? 'Allgemein' : group}
                {topics ? ` (${topics.reduce((sum, t) => sum + (topicNewsCounts.get(t) ?? 0), 0)})` : ''}
              </button>
              {topics && (
                <ul className="dash-sidebar-sublist">
                  {topics.map((topic) => (
                    <li key={topic}>
                      <button
                        className={`dash-sidebar-sublink${activeTopic === topic ? ' active' : ''}`}
                        onClick={() => onScrollToTopic(group, topic)}
                      >
                        {topic} ({topicNewsCounts.get(topic) ?? 0})
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
