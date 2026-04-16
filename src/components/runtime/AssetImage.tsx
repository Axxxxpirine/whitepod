import { useState } from 'react'

interface AssetImageProps {
  candidates: readonly string[]
  alt: string
  className?: string
  imageClassName?: string
}

export function AssetImage({ candidates, alt, className = '', imageClassName = '' }: AssetImageProps) {
  const [index, setIndex] = useState(0)
  const src = candidates[index] ?? candidates[0] ?? ''

  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      <img
        src={src}
        alt={alt}
        className={imageClassName}
        onError={() => {
          setIndex(current => (current < candidates.length - 1 ? current + 1 : current))
        }}
      />
    </span>
  )
}
