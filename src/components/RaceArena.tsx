import { useState } from 'react'
import { motion } from 'framer-motion'
import { Crown, Flag, Loader2, RotateCcw } from 'lucide-react'
import { Amount } from '@/onchain-money'
import { HAMSTERS, type DerbyDeployment, type RoundData, RoundStatus } from '@/lib/derby'
import { HamsterAvatar } from './HamsterAvatar'

interface Props {
  deployment: DerbyDeployment
  roundId: number | undefined
  round: RoundData | undefined
  connected: boolean
  bettingOpen: boolean
  seedReady: boolean
  blocksToSeed: number
  payout: bigint
  pending: string | null
  onLock: () => void
  onSettle: () => void
  onClaim: () => void
}

const AVATAR = 44
const RUN_SECONDS = 4

function Lane({
  index,
  distance,
  waiting,
  playKey,
  isWinner,
  dimmed,
}: {
  index: number
  distance: number | null
  waiting: boolean
  playKey: number
  isWinner: boolean
  dimmed: boolean
}) {
  const hamster = HAMSTERS[index]
  const target = distance === null ? 0 : distance / 1000
  return (
    <li className="flex items-center gap-2" style={{ opacity: dimmed ? 0.6 : 1 }}>
      <span
        className="display flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
        style={{ background: hamster.color }}
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <div
        className="relative h-12 flex-1 overflow-hidden rounded-full"
        style={{ background: 'rgba(18,45,69,0.06)', boxShadow: 'inset 0 1px 3px rgba(18,45,69,0.08)' }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-2"
          style={{
            backgroundImage: 'repeating-conic-gradient(rgba(18,45,69,0.55) 0% 25%, rgba(255,255,255,0.9) 0% 50%)',
            backgroundSize: '8px 8px',
            opacity: 0.35,
          }}
        />
        <motion.div
          key={`${index}-${playKey}`}
          className="absolute inset-y-0 right-0 rounded-full"
          style={{ left: AVATAR, background: `linear-gradient(90deg, transparent, ${hamster.color}55)` }}
          initial={playKey === 0 ? false : { x: '-100%' }}
          animate={{ x: `${(target - 1) * 100}%` }}
          transition={{ duration: RUN_SECONDS, delay: index * 0.12, ease: [0.22, 0.8, 0.25, 1] }}
        >
          <motion.span
            className="absolute right-0 top-0.5"
            animate={waiting ? { y: [0, -3, 0] } : { y: 0 }}
            transition={waiting ? { repeat: Infinity, duration: 0.5 + index * 0.07, ease: 'easeInOut' } : undefined}
          >
            <HamsterAvatar color={hamster.color} spinning={waiting || (playKey > 0 && distance !== null)} size={AVATAR} />
          </motion.span>
        </motion.div>
      </div>
      <span className="w-14 shrink-0 text-right text-sm font-bold tabular-nums display">
        {distance !== null ? `${distance} m` : ''}
        {isWinner && <Crown size={13} className="ml-1 inline" style={{ color: hamster.color }} aria-label="Winner" />}
      </span>
    </li>
  )
}

export function RaceArena({
  deployment,
  roundId,
  round,
  connected,
  bettingOpen,
  seedReady,
  blocksToSeed,
  payout,
  pending,
  onLock,
  onSettle,
  onClaim,
}: Props) {
  const { decimals, symbol } = deployment
  const digits = deployment.asset === 'eth' ? 4 : 2
  const [watching, setWatching] = useState(false)
  const [playKey, setPlayKey] = useState(0)
  const [seen, setSeen] = useState<string>('')

  const status = round?.status
  const marker = `${roundId ?? 'none'}:${status ?? 'none'}`
  if (marker !== seen) {
    // Replay the run when the round we are watching flips from Locked to Settled.
    const [prevId, prevStatus] = seen.split(':')
    const wasWatching = prevId === String(roundId) && prevStatus === String(RoundStatus.Locked)
    setSeen(marker)
    if (wasWatching && status === RoundStatus.Settled) setPlayKey((k) => k + 1)
    if (prevId !== String(roundId)) setWatching(false)
  }

  const settled = status === RoundStatus.Settled
  const locked = status === RoundStatus.Locked
  const waiting = locked
  const winner = settled ? round?.winner : undefined

  let headline = 'Race arena'
  let detail = 'Start a round to see the hamsters line up.'
  if (round) {
    if (status === RoundStatus.Open) {
      headline = bettingOpen ? 'Hamsters are warming up' : 'Betting closed'
      detail = bettingOpen
        ? 'Place your bets above. The race starts once the round is locked.'
        : 'Lock the round to pick the seed block that decides the race.'
    } else if (locked) {
      headline = seedReady ? 'Ready to reveal' : 'Waiting for the result'
      detail = seedReady
        ? 'The seed block exists. Reveal the result to send the hamsters running.'
        : `The seed block is ${blocksToSeed} block${blocksToSeed === 1 ? '' : 's'} away. The wheels turn until it arrives.`
    } else if (settled && winner !== undefined) {
      headline = `${HAMSTERS[winner].name} wins`
      detail = 'These are the distances the contract computed from the seed block.'
    } else {
      headline = 'Round cancelled'
      detail = 'No race was run. Your bets can be refunded.'
    }
  }

  const busy = pending === 'lock' || pending === 'settle' || pending === 'claim'

  const action = (() => {
    if (!round) return null
    if (status === RoundStatus.Open && !bettingOpen && round.totalPool > 0n) {
      return (
        <button type="button" onClick={onLock} disabled={!connected || busy} className="arena-btn">
          {pending === 'lock' && <Loader2 size={18} className="animate-spin" />}
          {connected ? 'Lock round' : 'Connect wallet to lock'}
        </button>
      )
    }
    if (locked && !seedReady) {
      return (
        <button type="button" onClick={() => setWatching(true)} disabled={watching} className="arena-btn">
          {watching && <Loader2 size={18} className="animate-spin" />}
          {watching ? `Waiting for ${blocksToSeed} more block${blocksToSeed === 1 ? '' : 's'}...` : 'Wait for the result'}
        </button>
      )
    }
    if (locked) {
      return (
        <button type="button" onClick={onSettle} disabled={!connected || busy} className="arena-btn">
          {pending === 'settle' && <Loader2 size={18} className="animate-spin" />}
          {connected ? 'Reveal the result' : 'Connect wallet to reveal'}
        </button>
      )
    }
    if (settled) {
      return (
        <div className="space-y-2">
          {payout > 0n && (
            <button type="button" onClick={onClaim} disabled={busy} className="arena-btn">
              {pending === 'claim' && <Loader2 size={18} className="animate-spin" />}
              Claim {Amount.fromRaw(payout, decimals).toFixed(digits)} {symbol}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPlayKey((k) => k + 1)}
            className="glass-pill flex w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold"
            style={{ minHeight: 52, color: 'var(--ink)' }}
          >
            <RotateCcw size={16} />
            Replay the race
          </button>
        </div>
      )
    }
    return null
  })()

  return (
    <section className="glass-card rounded-3xl p-5" aria-labelledby="arena-title">
      <div className="flex items-center gap-2">
        <Flag size={16} style={{ color: 'var(--muted)' }} />
        <p className="text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.1em', color: 'var(--muted)' }}>
          {roundId !== undefined ? `Race arena · Round #${roundId}` : 'Race arena'}
        </p>
      </div>
      <h3 id="arena-title" className="display mt-1 text-2xl font-bold text-balance">
        {headline}
      </h3>
      <p className="mt-1 text-sm text-pretty" style={{ color: 'var(--muted)' }} aria-live="polite">
        {detail}
      </p>

      <ol className="mt-4 space-y-2">
        {HAMSTERS.map((hamster) => (
          <Lane
            key={hamster.id}
            index={hamster.id}
            distance={settled ? (round?.distances[hamster.id] ?? 0) : null}
            waiting={waiting}
            playKey={playKey}
            isWinner={winner === hamster.id}
            dimmed={winner !== undefined && winner !== hamster.id}
          />
        ))}
      </ol>

      {settled && winner !== undefined && (
        <motion.div
          key={`banner-${playKey}`}
          className="glass-inner mt-3 flex items-center gap-2 rounded-2xl px-4 py-3"
          initial={playKey === 0 ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: RUN_SECONDS + 0.4 }}
        >
          <Crown size={18} style={{ color: HAMSTERS[winner].color }} />
          <span className="text-sm font-semibold">
            {HAMSTERS[winner].name} ran {round?.distances[winner]} m and takes the pot.
          </span>
        </motion.div>
      )}

      {action && <div className="mt-4">{action}</div>}
    </section>
  )
}
