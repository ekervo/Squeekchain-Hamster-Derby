import { Amount } from '@/onchain-money'
import { HAMSTERS, type DerbyDeployment, type RoundData, RoundStatus } from '@/lib/derby'

interface Props {
  deployment: DerbyDeployment
  items: { id: number; data: RoundData | undefined }[]
  activeId: number | undefined
  onSelect: (id: number) => void
}

const STATUS_TEXT: Record<RoundStatus, string> = {
  [RoundStatus.Open]: 'Open',
  [RoundStatus.Locked]: 'Racing',
  [RoundStatus.Settled]: 'Settled',
  [RoundStatus.Void]: 'Refunded',
}

export function RoundHistory({ deployment, items, activeId, onSelect }: Props) {
  if (items.length < 2) return null
  const { decimals, symbol } = deployment
  const digits = deployment.asset === 'eth' ? 4 : 2

  return (
    <section className="glass-card rounded-3xl p-4">
      <h3 className="px-1 text-xs font-semibold uppercase" style={{ letterSpacing: '0.08em', color: 'var(--muted)' }}>
        Recent rounds
      </h3>
      <ul className="mt-2 space-y-1">
        {items.map(({ id, data }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onSelect(id)}
              aria-current={activeId === id}
              className="flex w-full items-center justify-between rounded-xl px-3 text-left text-sm"
              style={{
                minHeight: 44,
                background: activeId === id ? 'rgba(18,45,69,0.07)' : 'transparent',
              }}
            >
              <span className="font-semibold">Round #{id}</span>
              <span className="tabular-nums" style={{ color: 'var(--muted)' }}>
                {data
                  ? data.status === RoundStatus.Settled
                    ? `${HAMSTERS[data.winner].name} won`
                    : STATUS_TEXT[data.status]
                  : '...'}
                {data ? ` · ${Amount.fromRaw(data.totalPool, decimals).toFixed(digits)} ${symbol}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
