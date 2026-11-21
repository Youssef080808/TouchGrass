import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Button, ErrorText, Spinner } from '../components/ui'
import { getPosition } from '../lib/location'

/** Opened from a friend's QR code (/join/ABC123): checks your location and joins their Hang. */
export default function JoinPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  const join = useCallback(async () => {
    setError(null)
    try {
      const pos = await getPosition()
      const hang = await api('/hangs/join', { method: 'POST', body: { code, ...pos } })
      navigate(`/hang/${hang.id}`, { replace: true })
    } catch (e) {
      setError(e.message)
    }
  }, [code, navigate])

  useEffect(() => {
    join()
  }, [join])

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-canvas px-6">
      {!error ? (
        <Spinner label={`Joining Hang ${code}...`} />
      ) : (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">Couldn't join {code}</h1>
          <ErrorText>{error}</ErrorText>
          <Button className="w-full" onClick={join}>
            Try again
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate('/', { replace: true })}>
            Back home
          </Button>
        </div>
      )}
    </div>
  )
}
