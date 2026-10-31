import { motion } from 'framer-motion'
import { Crown } from 'lucide-react'
import { Amount } from '@/onchain-money'
import { HAMSTERS, type DerbyDeployment, type RoundData, RoundStatus } from '@/lib/derby'
import { HamsterAvatar } from './HamsterAvatar'

interface Props {
  deployment: DerbyDeployment
  round: RoundData | undefined
  stakes: readonly bigint[]
  selected: number | null
  onSelect?: (id: number) => void
}

const AVATAR = 44

function Finish() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-y-0 right-0 w-2"
      style={{
        backgroundImage:
          'repeating-conic-gradient(rgba(18,45,69,0.55) 0% 25%, rgba(255,255,255,0.9) 0% 50%)',
        backgroundSize: '8px 8px',
        opacity: 0.35,
      }}
    />
  )
}

export function WheelTrack({ deployment, round, stakes, selected, onSelect }: Props) {
  const { decimals, symbol } = deployment
  const digits = deployment.asset === 'eth' ? 4 : 2
  const fmt = (raw: bigint) => Amount.fromRaw(raw, decimals).toFixed(digits)
  const status = round?.status
  const finished = status === RoundStatus.Settled
  const racing = status === RoundStatus.Locked
  const total = round?.totalPool ?? 0n

  return (
    <ul className="space-y-2.5" aria-label="Hamster race lanes">
      {HAMSTERS.map((hamster) => {
        const pool = round?.pools[hamster.id] ?? 0n
        const distance = finished ? (round?.distances[hamster.id] ?? 0) : 0
        const isWinner = finished && round?.winner === hamster.id
        const mine = stakes[hamster.id] ?? 0n
        const canPick = Boolean(onSelect) && status === RoundStatus.Open
        const isSelected = selected === hamster.id
        const multiplier = pool > 0n ? Number((total * 100n) / pool) / 100 : null

        return (
          <li key={hamster.id}>
            <button
              type="button"
              disabled={!canPick}
              onClick={() => onSelect?.(hamster.id)}
              aria-pressed={isSelected}
              className="glass-inner block w-full rounded-2xl p-3 text-left transition-all disabled:cursor-default"
              style={{
                minHeight: 44,
                opacity: finished && !isWinner ? 0.7 : 1,
                boxShadow: isSelected
                  ? `0 0 0 2px ${hamster.color}, 0 6px 18px ${hamster.color}33`
                  : isWinner
                    ? `0 0 0 2px ${hamster.color}`
                    : undefined,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="display text-base font-bold" style={{ color: 'var(--ink)' }}>
                      {hamster.name}
                    </span>
                    {isWinner && <Crown size={15} style={{ color: hamster.color }} aria-label="Winner" />}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                    {hamster.trait}
                  </span>
                </div>
                <div className="text-right tabular-nums">
                  {finished ? (
                    <>
                      <div className="display text-base font-bold">{distance} m</div>
                      <div className="text-xs" style={{ color: 'var(--subtle)' }}>
                        {fmt(pool)} {symbol} backed
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="display text-base font-bold">{fmt(pool)} {symbol}</div>
                      <div className="text-xs" style={{ color: 'var(--subtle)' }}>
                        {multiplier ? `Pays ${multiplier.toFixed(2)}x` : 'No bets yet'}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div
                className="relative mt-2.5 h-12 overflow-hidden rounded-full"
                style={{
                  background: 'rgba(18,45,69,0.06)',
                  boxShadow: 'inset 0 1px 3px rgba(18,45,69,0.08)',
                }}
              >
                <motion.div
                  className="absolute inset-y-0 right-0 rounded-full"
                  style={{
                    left: AVATAR,
                    background: `linear-gradient(90deg, transparent, ${hamster.color}55)`,
                  }}
                  initial={{ x: '-100%' }}
                  animate={{ x: `${(distance / 1000 - 1) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 38, damping: 16 }}
                >
                  <span className="absolute right-0 top-0.5">
                    <HamsterAvatar color={hamster.color} spinning={racing} size={AVATAR} />
                  </span>
                </motion.div>
                <Finish />
              </div>

              {mine > 0n && (
                <div className="mt-2 text-xs font-medium tabular-nums" style={{ color: hamster.color }}>
                  Your stake: {fmt(mine)} {symbol}
                </div>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
