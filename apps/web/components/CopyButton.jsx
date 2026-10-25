'use client'
import { signal } from '@verx/ui'

export default function CopyButton({ text }) {
  const copied = signal(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    copied.set(true)
    setTimeout(() => copied.set(false), 1500)
  }
  return (
    <button class="copy" type="button" onClick={copy} aria-live="polite">
      {() => (copied() ? 'Copiado' : 'Copiar')}
    </button>
  )
}
