import { ArrowLeftRight, Check, Flame, Hexagon, Hourglass, LogOut, Plus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { TEAM_COLORS } from '../config'
import { useMyTeam } from '../hooks/useMyTeam'
import { useUser } from '../user'
import { RequestRow } from './TeamRequests'
import { Avatar, Button, Card, ErrorText, SectionTitle } from './ui'

/**
 * Me tab: your team and its members, join requests to answer, leaving, and switching or starting a team.
 * Joining an existing team sends a request; you're in once anyone on that team accepts.
 */
export default function TeamCard() {
  const { user } = useUser()
  const { data, apply, load, error: loadError } = useMyTeam()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [picking, setPicking] = useState(false)
  const [teams, setTeams] = useState(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TEAM_COLORS[0])

  const showPicker = Boolean(data) && (picking || !data.team)

  useEffect(() => {
    if (!showPicker) return
    api('/teams')
      .then((list) => {
        setTeams(list)
        // Suggest a colour nobody uses yet, so the new team's zones stand out on the map
        const used = new Set(list.map((t) => t.color?.toLowerCase()))
        setNewColor((c) => (used.has(c) ? (TEAM_COLORS.find((x) => !used.has(x)) ?? c) : c))
      })
      .catch(() => {})
  }, [showPicker, data?.team?.id])

  if (!data) {
    if (!loadError) return null
    return (
      <Card>
        <SectionTitle>Your team</SectionTitle>
        <ErrorText>Couldn't load your team: {loadError}</ErrorText>
        <Button variant="secondary" className="mt-3 h-11 w-full" onClick={load}>
          Try again
        </Button>
      </Card>
    )
  }

  const run = async (key, path, body, done) => {
    setBusy(key)
    setError(null)
    setNote(null)
    try {
      const d = apply(await api(path, { method: 'POST', body }))
      setNote(typeof done === 'function' ? done(d) : done)
      return d
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setBusy(null)
    }
  }

  const askToJoin = async (t) => {
    const d = await run(`join-${t.id}`, `/teams/${t.id}/join`, undefined, (res) =>
      res.team?.id === t.id ? `You're on ${t.name}!` : `Request sent. You'll join ${t.name} once someone there accepts.`,
    )
    if (d?.team?.id === t.id) setPicking(false)
  }

  const startTeam = async () => {
    const d = await run('new', '/teams', { name: newName.trim(), color: newColor }, (res) => `You started ${res.team.name}.`)
    if (d) {
      setPicking(false)
      setNewName('')
    }
  }

  const leave = () => {
    const name = data.team.name
    if (window.confirm(`Leave ${name}? To get back in, someone on the team will have to accept you.`)) {
      run('leave', '/me/team/leave', undefined, `You left ${name}.`)
    }
  }

  const answer = (r, accept) =>
    run(
      `${accept ? 'accept' : 'decline'}-${r.id}`,
      `/join-requests/${r.id}/${accept ? 'accept' : 'decline'}`,
      undefined,
      accept ? `${r.user.name} is on the team now.` : `You declined ${r.user.name}.`,
    )

  const cancelRequest = () => run('cancel', `/join-requests/${data.my_request.id}/cancel`, undefined, 'Request cancelled.')

  return (
    <Card>
      <SectionTitle
        action={
          data.team && (
            <span className="flex items-center gap-1 text-sm font-semibold text-muted">
              <Users className="size-4" aria-hidden /> {data.members.length}
            </span>
          )
        }
      >
        Your team
      </SectionTitle>

      {data.team ? (
        <>
          {data.requests.length > 0 && (
            <div className="mb-3 rounded-2xl bg-lime/25 p-3 dark:bg-lime/10">
              <p className="mb-2.5 text-sm font-semibold">
                {data.requests.length === 1 ? 'Wants' : 'Want'} to join {data.team.name}
              </p>
              <div className="space-y-3">
                {data.requests.map((r) => (
                  <RequestRow key={r.id} request={r} busy={busy} onAnswer={answer} />
                ))}
              </div>
            </div>
          )}
          <div className="-mx-2">
            {data.members.map((m) => (
              <div
                key={m.id}
                className={`flex min-h-12 items-center gap-3 rounded-2xl px-2 py-1.5 ${m.id === user.id ? 'bg-lime/30 dark:bg-lime/15' : ''}`}
              >
                <Avatar name={m.name} color={data.team.color} size={36} />
                <span className="flex-1 truncate font-semibold">
                  {m.name}
                  {m.id === user.id && <span className="ml-1.5 text-sm font-normal text-muted">(you)</span>}
                </span>
                {m.streak > 0 && (
                  <span className="flex items-center gap-0.5 text-sm font-semibold text-orange-500">
                    <Flame className="size-4" aria-hidden /> {m.streak}
                  </span>
                )}
                <span className="w-16 text-right font-display text-lg font-bold">{m.points}</span>
              </div>
            ))}
          </div>
          {data.members.length === 1 && (
            <p className="mt-2 text-sm text-muted">
              Just you so far. When friends ask to join {data.team.name}, their requests show up here.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">You're not on a team yet. Your Hangs only claim zones once you're on one.</p>
      )}

      {data.my_request && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-chip p-3">
          <Hourglass className="size-5 shrink-0 text-muted" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">Waiting for {data.my_request.team.name}.</span> Anyone on the team can accept you.
          </p>
          <Button variant="secondary" className="h-9 shrink-0 px-3 text-sm" loading={busy === 'cancel'} onClick={cancelRequest}>
            Cancel
          </Button>
        </div>
      )}

      {note && (
        <p role="status" className="mt-3 flex items-center gap-2 rounded-2xl bg-lime px-3 py-2 text-sm font-semibold text-on-accent">
          <Check className="size-4 shrink-0" aria-hidden /> {note}
        </p>
      )}
      {error && (
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      {showPicker ? (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold">{data.team ? 'Switch to another team' : 'Pick a team'}</p>
            {data.team && (
              <button onClick={() => setPicking(false)} className="-m-2 rounded-xl p-2 text-sm font-semibold text-muted active:bg-chip">
                Close
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {data.team ? "You'll move over once someone on the new team accepts." : 'Someone on the team has to accept you.'}
          </p>
          <div className="mt-3 space-y-2">
            {(teams ?? [])
              .filter((t) => t.id !== data.team?.id)
              .map((t) => {
                const waiting = data.my_request?.team.id === t.id
                return (
                  <div key={t.id} className="flex min-h-14 items-center gap-3 rounded-2xl bg-canvas px-3 py-2">
                    <Hexagon className="size-6 shrink-0" style={{ color: t.color, fill: t.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{t.name}</p>
                      <p className="text-xs text-muted">
                        {t.members} {t.members === 1 ? 'member' : 'members'}
                      </p>
                    </div>
                    <Button
                      variant={waiting ? 'ghost' : 'secondary'}
                      className="h-9 shrink-0 px-3 text-sm"
                      disabled={waiting}
                      loading={busy === `join-${t.id}`}
                      onClick={() => askToJoin(t)}
                    >
                      {waiting ? 'Requested' : t.members === 0 ? 'Join' : 'Ask to join'}
                    </Button>
                  </div>
                )
              })}
          </div>

          <div className="mt-4 rounded-2xl bg-canvas p-3">
            <label htmlFor="new-team-name" className="flex items-center gap-2 font-semibold">
              <Plus className="size-4" aria-hidden /> Start a new team
            </label>
            <input
              id="new-team-name"
              value={newName}
              maxLength={40}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Team name"
              className="mt-2 h-11 w-full rounded-xl bg-surface px-3 text-sm text-ink outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-brand-ink"
            />
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Team colour">
              {TEAM_COLORS.map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={newColor === c}
                  aria-label={`Colour ${c}`}
                  onClick={() => setNewColor(c)}
                  className={`size-8 rounded-full transition ${newColor === c ? 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-canvas' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            {data.team && <p className="mt-3 text-xs text-muted">You'll leave {data.team.name}.</p>}
            <Button className="mt-3 h-11 w-full" disabled={!newName.trim()} loading={busy === 'new'} onClick={startTeam}>
              Start team
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" className="h-11" onClick={() => setPicking(true)}>
            <ArrowLeftRight className="size-4" aria-hidden /> Switch team
          </Button>
          <Button variant="danger" className="h-11" loading={busy === 'leave'} onClick={leave}>
            <LogOut className="size-4" aria-hidden /> Leave team
          </Button>
        </div>
      )}
    </Card>
  )
}
