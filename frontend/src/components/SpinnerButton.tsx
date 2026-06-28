import type { ReactNode } from 'react'

interface Props {
  loading: boolean
  onClick: () => void
  disabled?: boolean
  className?: string
  children: ReactNode
}

export default function SpinnerButton({ loading, onClick, disabled, className, children }: Props) {
  return (
    <button className={className} onClick={onClick} disabled={disabled || loading}>
      {loading ? <span className="spinner" /> : children}
    </button>
  )
}
