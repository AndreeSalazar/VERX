'use client'
import { signal } from '@veloz/ui'
export default function Clicker({ start }) {
  const n = signal(start)
  return <button onClick={() => n.set(n() + 1)}>{n}</button>
}
