interface Props {
  name: string
  variant?: 'default' | 'important' | 'unimportant'
  onImportant?: () => void
  onUnimportant?: () => void
}

export default function Tag({ name, variant = 'default', onImportant, onUnimportant }: Props) {
  return (
    <span className="tag-group">
      {onImportant && (
        <button
          className={`tag-btn tag-btn-plus${variant === 'important' ? ' active' : ''}`}
          onClick={onImportant}
          title="Als relevant markieren"
        >+</button>
      )}
      <span
        className={`tag ${variant}`}
        onClick={variant !== 'important' ? onImportant : undefined}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (variant !== 'important') onImportant?.()
          }
        }}
      >
        {name}
      </span>
      {onUnimportant && (
        <button
          className={`tag-btn tag-btn-minus${variant === 'unimportant' ? ' active' : ''}`}
          onClick={onUnimportant}
          title="Als irrelevant markieren"
        >−</button>
      )}
    </span>
  )
}
