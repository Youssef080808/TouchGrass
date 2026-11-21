import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useUser } from '../user'

/**
 * Your team, its members, join requests waiting for your team's answer, and your own pending request.
 * Pass { poll: ms } to keep checking (so new join requests show up without a reload).
 */
export function useMyTeam({ poll = 0 } = {}) {
  const { user, refresh } = useUser()
  const [data, setData] = useState(null)
  const teamId = user.team?.id ?? null

  // Use every /me/team answer; if your team changed (say someone just accepted you), refresh the signed-in user.
  const apply = useCallback(
    (d) => {
      setData(d)
      if ((d.team?.id ?? null) !== teamId) refresh()
      return d
    },
    [teamId, refresh],
  )

  const load = useCallback(() => api('/me/team').then(apply).catch(() => {}), [apply])

  useEffect(() => {
    load()
    if (!poll) return undefined
    const t = setInterval(load, poll)
    return () => clearInterval(t)
  }, [load, poll])

  return { data, apply, load }
}
