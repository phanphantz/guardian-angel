import { useEffect, useState } from 'react'
import { useGame } from '../state/store'

export function Toast() {
  const message = useGame((s) => s.message)
  const [dismissedId, setDismissedId] = useState<number | null>(null)

  useEffect(() => {
    if (!message) return
    const id = setTimeout(() => setDismissedId(message.id), 2200)
    return () => clearTimeout(id)
  }, [message])

  return message && message.id !== dismissedId ? <div className="toast">{message.text}</div> : null
}
