interface SourceLinkProps {
  source: string
  url: string
}

function shorten(url: string, source: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return source
  }
}

export default function SourceLink({ source, url }: SourceLinkProps) {
  return (
    <a
      className="source-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
    >
      {shorten(url, source)}
    </a>
  )
}
