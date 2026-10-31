import { useCallback, useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Amount } from '@/onchain-money'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { HAMSTERS, type DerbyDeployment, RoundStatus } from '@/lib/derby'
import { useChainClock, useChainNow, useMyPosition, useRounds, useStakeAsset } from '@/hooks/useDerby'
import { useDerbyTx } from '@/hooks/useDerbyTx'
import { WheelTrack } from './WheelTrack'
import { BetPanel } from './BetPanel'
import { RoundHistory } from './RoundHistory'
import { PhaseStepper } from './PhaseStepper'
import { RaceArena } from './RaceArena'
import { HowItWorks } from './HowItWorks'
import { BlockProof } from './BlockProof'

const SETTLE_WINDOW = 200n

function PrimaryButton({
  children,
  onClick,
  busy,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  busy?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold text-white transition-colors enabled:hover:brightness-110 disabled:opacity-40"
      style={{ minHeight: 52, background: 'var(--accent)' }}
    >
      {busy && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  )
}

function SecondaryButton({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="glass-pill flex w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold disabled:opacity-40"
      style={{ minHeight: 52, color: 'var(--ink)' }}
    >
      {busy && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  )
}

export function RoundPanel({ deployment }: { deployment: DerbyDeployment }) {
  const { chainId } = deployment
  const { isConnected } = useAccount()
  const rounds = useRounds(deployment)
  const clock = useChainClock(chainId)
  const chainNow = useChainNow(clock)
  const usdc = useStakeAsset(deployment)
  const [picked, setPicked] = useState<number | null>(null)
  const [hamster, setHamster] = useState<number | null>(null)

  const latest = rounds.items[0]
  const activeId = picked ?? latest?.id
  const active = rounds.items.find((r) => r.id === activeId)
  const round = active?.data
  const position = useMyPosition(deployment, activeId)

  const { decimals, symbol } = deployment
  const digits = deployment.asset === 'eth' ? 4 : 2
  const fmt = (raw: bigint) => Amount.fromRaw(raw, decimals).toFixed(digits)

  const refreshAll = useCallback(() => {
    void rounds.refetch()
    void position.refetch()
    void usdc.refetch()
  }, [rounds, position, usdc])
  const tx = useDerbyTx(deployment, refreshAll)

  const secondsLeft = round ? Number(round.bettingEndsAt - chainNow) : 0
  const status = round?.status
  const bettingOpen = status === RoundStatus.Open && secondsLeft > 0
  const seedReady = clock && round ? clock.blockNumber > round.seedBlock : false
  const blocksToSeed = clock && round && !seedReady ? Number(round.seedBlock - clock.blockNumber) + 1 : 0
  const expired = clock && round ? clock.blockNumber > round.seedBlock + SETTLE_WINDOW : false

  const pending = tx.pending
  const pendingBet = pending === 'approve' || pending === 'bet' ? pending : null

  const headline = (() => {
    if (!round) return 'No race yet'
    switch (round.status) {
      case RoundStatus.Open:
        return bettingOpen
          ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')} left to bet`
          : 'Betting is closed'
      case RoundStatus.Locked:
        return seedReady ? 'Ready to run the race' : 'Waiting for the seed block'
      case RoundStatus.Settled:
        return `${HAMSTERS[round.winner].name} wins`
      case RoundStatus.Void:
        return 'Round cancelled, bets refunded'
    }
  })()

  const subline = (() => {
    if (!round) return 'Start a round and let the wheels turn.'
    switch (round.status) {
      case RoundStatus.Open:
        return bettingOpen ? 'Pick a hamster, then place your bet.' : 'Anyone can lock the round and pick the seed block.'
      case RoundStatus.Locked:
        return 'The race is simulated from a block that did not exist when betting closed.'
      case RoundStatus.Settled:
        return 'Winners split the whole pot in proportion to their stake.'
      case RoundStatus.Void:
        return 'Nobody backed the winner or the seed expired. Claim your stake back.'
    }
  })()

  const renderAction = () => {
    if (!isConnected) {
      return (
        <ConnectKitButton.Custom>
          {({ show }) => <PrimaryButton onClick={() => show?.()}>Connect wallet to play</PrimaryButton>}
        </ConnectKitButton.Custom>
      )
    }
    if (!round || activeId === undefined) {
      return (
        <PrimaryButton onClick={() => void tx.createRound()} busy={pending === 'create'}>
          Start the first race
        </PrimaryButton>
      )
    }
    if (status === RoundStatus.Open && bettingOpen) {
      return (
        <BetPanel
          deployment={deployment}
          selected={hamster}
          balance={usdc.balance}
          allowance={usdc.allowance}
          minBet={usdc.minBet}
          pending={pendingBet}
          onApprove={(amount) => void tx.approve(amount)}
          onBet={(id, amount) => void tx.bet(activeId, id, amount)}
        />
      )
    }
    if (status === RoundStatus.Open && round.totalPool === 0n) {
      return (
        <PrimaryButton onClick={() => void tx.createRound()} busy={pending === 'create'}>
          Nobody bet in time. Start a new race
        </PrimaryButton>
      )
    }
    if (status === RoundStatus.Open) {
      return (
        <PrimaryButton onClick={() => void tx.lockRound(activeId)} busy={pending === 'lock'}>
          Lock round and pick seed block
        </PrimaryButton>
      )
    }
    if (status === RoundStatus.Locked) {
      return (
        <PrimaryButton onClick={() => void tx.settleRound(activeId)} busy={pending === 'settle'} disabled={!seedReady}>
          {seedReady ? (expired ? 'Close expired round' : 'Run the race') : `Waiting for ${blocksToSeed} more block${blocksToSeed === 1 ? '' : 's'}...`}
        </PrimaryButton>
      )
    }
    return (
      <div className="space-y-2">
        {position.payout > 0n && (
          <PrimaryButton onClick={() => void tx.claim(activeId)} busy={pending === 'claim'}>
            {status === RoundStatus.Void ? 'Refund' : 'Claim'} {fmt(position.payout)} {symbol}
          </PrimaryButton>
        )}
        {activeId === latest?.id && (
          <SecondaryButton onClick={() => void tx.createRound()} busy={pending === 'create'}>
            Start a new race
          </SecondaryButton>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="min-w-0 space-y-4">
      <section className="glass-card relative overflow-hidden rounded-3xl p-5">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.1em', color: 'var(--muted)' }}>
              {round && activeId !== undefined ? `Round #${activeId}` : 'Hamster Derby'}
            </p>
            <h2 className="display mt-1 text-[28px] font-bold leading-tight text-balance" style={{ color: 'var(--ink)' }}>
              {headline}
            </h2>
            <p className="mt-1 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
              {subline}
            </p>
          </div>
          <div className="glass-inner shrink-0 rounded-2xl px-3 py-2 text-right">
            <p className="text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.08em', color: 'var(--subtle)' }}>
              Pot
            </p>
            <p className="display text-2xl font-bold tabular-nums leading-none">{fmt(round?.totalPool ?? 0n)}</p>
            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--subtle)' }}>{symbol}</p>
          </div>
        </div>

        <div className="mt-5">
          <PhaseStepper status={status} seedReady={seedReady} />
        </div>

        <div className="mt-5">
          {rounds.isLoading && !round ? (
            <p className="py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>Loading the track...</p>
          ) : (
            <WheelTrack
              deployment={deployment}
              round={round}
              stakes={position.stakes}
              selected={hamster}
              onSelect={bettingOpen ? setHamster : undefined}
            />
          )}
        </div>

        <div className="mt-4">{renderAction()}</div>

        {tx.lastTxUrl && (
          <a
            href={tx.lastTxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: 'var(--accent-hover)' }}
          >
            View latest transaction <ExternalLink size={12} />
          </a>
        )}
      </section>

      <RaceArena
        deployment={deployment}
        roundId={activeId}
        round={round}
        connected={isConnected}
        bettingOpen={bettingOpen}
        seedReady={seedReady}
        blocksToSeed={blocksToSeed}
        payout={position.payout}
        pending={pending}
        onLock={() => activeId !== undefined && void tx.lockRound(activeId)}
        onSettle={() => activeId !== undefined && void tx.settleRound(activeId)}
        onClaim={() => activeId !== undefined && void tx.claim(activeId)}
      />
      </div>

      <div className="min-w-0 space-y-4">
        <HowItWorks deployment={deployment} />

      <BlockProof deployment={deployment} roundId={activeId} round={round} latestBlock={clock?.blockNumber} />

      <RoundHistory
        deployment={deployment}
        items={rounds.items}
        activeId={activeId}
        onSelect={(id) => setPicked(id === latest?.id ? null : id)}
      />

      <p className="px-2 text-center text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        Contract{' '}
        <a
          href={buildAddressExplorerUrl(chainId, deployment.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="mono underline"
        >
          {deployment.address.slice(0, 6)}...{deployment.address.slice(-4)}
        </a>{' '}
        has no owner and takes no fee. The race is simulated from a future block hash, so validators could nudge it
        slightly: play with testnet funds only.
      </p>
      </div>
    </div>
  )
}
