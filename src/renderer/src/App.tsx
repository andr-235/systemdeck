import { useEffect, useState } from 'react'
import type { PingResponse, IpcError } from '@shared/ipc'
import { toIpcError } from '@shared/ipc'

function App(): React.JSX.Element {
  const [ping, setPing] = useState<PingResponse | null>(null)
  const [error, setError] = useState<IpcError | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function runPing(): Promise<void> {
      try {
        const result = await window.api.ping()
        if (cancelled) return
        if (result.ok) {
          setPing(result.data)
        } else {
          setError(result.error)
        }
      } catch (e) {
        if (cancelled) return
        setError(toIpcError(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    runPing()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', gap: 12 }}>
      <h1>SystemDeck</h1>
      <p>Bootstrap OK — edit src/renderer/src/App.tsx and save to test HMR</p>
      <div style={{ marginTop: 16, padding: 12, border: '1px solid #ccc', borderRadius: 8, minWidth: 320, textAlign: 'center' }}>
        <strong>IPC ping</strong>
        {loading && <p>Loading...</p>}
        {!loading && ping && (
          <p style={{ color: 'green' }}>
            pong: {String(ping.pong)} / version: {ping.contractVersion} / ts: {ping.timestamp}
          </p>
        )}
        {!loading && error && <p style={{ color: 'red' }}>error: {error.code} — {error.message}</p>}
      </div>
    </div>
  )
}

export default App
