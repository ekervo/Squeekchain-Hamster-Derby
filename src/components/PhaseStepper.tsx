import { RoundStatus } from '@/lib/derby'

const STEPS = ['Betting', 'Seed block', 'Race', 'Payout'] as const

function stepIndex(status: RoundStatus | undefined, seedReady: boolean): number {
  switch (status) {
    case RoundStatus.Open:
      return 0
    case RoundStatus.Locked:
      return seedReady ? 2 : 1
    case RoundStatus.Settled:
    case RoundStatus.Void:
      return 3
    default:
      return -1
  }
}

export function PhaseStepper({ status, seedReady }: { status: RoundStatus | undefined; seedReady: boolean }) {
  const current = stepIndex(status, seedReady)
  return (
    <ol className="flex items-center gap-1" aria-label="Round progress">
      {STEPS.map((label, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={label} className="flex flex-1 flex-col gap-1.5" aria-current={active ? 'step' : undefined}>
            <span
              className="h-1 w-full rounded-full"
              style={{
                background: active
                  ? 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'
                  : done
                    ? 'var(--accent)'
                    : 'rgba(18,45,69,0.12)',
              }}
            />
            <span
              className="text-[11px] font-semibold uppercase"
              style={{
                letterSpacing: '0.08em',
                color: active ? 'var(--ink)' : 'var(--subtle)',
              }}
            >
              {status === RoundStatus.Void && index === 3 ? 'Refund' : label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
