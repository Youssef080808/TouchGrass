import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useUser } from '../user'

// Fill in anything missing, so the screen never crashes on a partial answer. A server still running code from
// before team switching (it wasn't restarted after a pull) answers without "requests": flag that as outdated.
function normalize(d) {
  return {
    team: d?.team ?? null,
    members: d?.members ?? [],
    requests: d?.requests ?? [],
    my_request: d?.my_request ?? null,
    outdated: !d || !('requests' in d),
  }
}

/**
 * Your team, its members, join requests waiting for your team's answer, and your own pending request.
 * Pass { poll: ms } to keep checking (so new join requests show up without a reload).
 */
export function useMyTeam({ poll = 0 } = {}) {
  const { user, refresh } = useUser()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const teamId = user.team?.id ?? null

  // Use every /me/team answer; if your team changed (say someone just accepted you), refresh the signed-in user.
  const apply = useCallback(
    (raw) => {
      const d = normalize(raw)
      setData(d)
      setError(null)
      if ((d.team?.id ?? null) !== teamId) refresh()
      return d
    },
    [teamId, refresh],
  )

  const load = useCallback(
    () =>
      api('/me/team')
        .then((d) => {
          setError(null)
          return apply(d)
        })
        .catch((e) => {
          setError(e.message || "Couldn't load your team")
          return null
        }),
    [apply],
  )

  useEffect(() => {
    load()
    if (!poll) return undefined
    const t = setInterval(load, poll)
    return () => clearInterval(t)
  }, [load, poll])

  return { data, apply, load, error }
}
