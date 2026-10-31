import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { TokenETH, TokenUSDC } from '@web3icons/react'
import { Amount, AmountError } from '@/onchain-money'
import { HAMSTERS, type DerbyDeployment } from '@/lib/derby'

interface Props {
  deployment: DerbyDeployment
  selected: number | null
  balance: bigint
  allowance: bigint
  minBet: bigint
  pending: 'approve' | 'bet' | null
  onApprove: (amount: bigint) => void
  onBet: (hamster: number, amount: bigint) => void
}

const QUICK: Record<DerbyDeployment['asset'], string[]> = {
  usdc: ['1', '5', '10'],
  eth: ['0.001', '0.01', '0.05'],
}

// Native-token bets leave a little behind so the wallet can still pay gas.
const GAS_RESERVE_ETH = 10n ** 15n

export function BetPanel({ deployment, selected, balance, allowance, minBet, pending, onApprove, onBet }: Props) {
  const { decimals, symbol, asset } = deployment
  const [value, setValue] = useState(asset === 'eth' ? '0.01' : '1')
  const digits = asset === 'eth' ? 4 : 2

  let amount: Amount | null = null
  try {
    amount = value.trim() === '' ? null : Amount.parse(value, decimals)
  } catch (error) {
    if (!(error instanceof AmountError)) throw error
  }

  const raw = amount?.raw ?? 0n
  const tooSmall = amount !== null && raw < minBet
  const tooMuch = raw > balance
  const needsApproval = asset === 'usdc' && raw > allowance
  const invalid = amount === null || tooSmall || tooMuch || raw === 0n
  const hamster = selected !== null ? HAMSTERS[selected] : null

  let helper: string | null = null
  if (amount === null && value.trim() !== '') helper = 'Enter a valid amount.'
  else if (tooSmall) helper = `Minimum bet is ${Amount.fromRaw(minBet, decimals).toString()} ${symbol}.`
  else if (tooMuch) helper = `Not enough ${symbol} in your wallet.`

  const busy = pending !== null
  const label = !hamster
    ? 'Pick a hamster above'
    : pending === 'approve'
      ? 'Approving USDC...'
      : pending === 'bet'
        ? 'Placing bet...'
        : needsApproval && !invalid
          ? 'Approve USDC'
          : `Bet on ${hamster.name}`

  const max = () => {
    const spendable = asset === 'eth' ? (balance > GAS_RESERVE_ETH ? balance - GAS_RESERVE_ETH : 0n) : balance
    setValue(Amount.fromRaw(spendable, decimals).toString())
  }

  return (
    <div className="glass-inner rounded-2xl p-4">
      <div className="flex items-baseline justify-between">
        <label
          htmlFor="bet-amount"
          className="text-[11px] font-semibold uppercase"
          style={{ letterSpacing: '0.08em', color: 'var(--muted)' }}
        >
          Your bet
        </label>
        <span className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
          Balance {Amount.fromRaw(balance, decimals).toFixed(digits)} {symbol}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {asset === 'eth' ? <TokenETH variant="branded" size={28} /> : <TokenUSDC variant="branded" size={28} />}
        <input
          id="bet-amount"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="display w-full bg-transparent text-3xl font-bold tabular-nums outline-none"
          style={{ color: 'var(--ink)' }}
          placeholder="0.00"
          aria-invalid={Boolean(helper)}
        />
        <span className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>{symbol}</span>
      </div>
      <div className="mt-3 flex gap-2">
        {QUICK[asset].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setValue(q)}
            className="glass-pill rounded-full px-4 text-sm font-semibold"
            style={{ minHeight: 44, color: 'var(--ink-2)' }}
          >
            {q}
          </button>
        ))}
        <button
          type="button"
          onClick={max}
          className="glass-pill rounded-full px-4 text-sm font-semibold"
          style={{ minHeight: 44, color: 'var(--ink-2)' }}
        >
          Max
        </button>
      </div>
      {helper && (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }} role="alert">
          {helper}
        </p>
      )}
      <button
        type="button"
        disabled={!hamster || invalid || busy}
        onClick={() => {
          if (!hamster || !amount) return
          if (needsApproval) onApprove(raw)
          else onBet(hamster.id, raw)
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold text-white transition-colors enabled:hover:brightness-110 disabled:opacity-40"
        style={{ minHeight: 52, background: 'var(--accent)' }}
      >
        {busy && <Loader2 size={18} className="animate-spin" />}
        {label}
      </button>
      {needsApproval && !invalid && hamster && !busy && (
        <p className="mt-2 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          Step 1 of 2: allow the contract to use exactly this amount of USDC, then place your bet.
        </p>
      )}
      {asset === 'eth' && (
        <p className="mt-2 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          Your ETH is sent with the bet in one transaction. A little extra ETH pays the network fee.
        </p>
      )}
    </div>
  )
}
