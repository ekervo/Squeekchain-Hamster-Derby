import { useState } from 'react'
import { ChevronDown, Flag, Lock, MousePointerClick, Trophy, Wallet } from 'lucide-react'
import type { DerbyDeployment } from '@/lib/derby'

const STORAGE_KEY = 'hamster-derby:guide-closed'

function readClosed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

interface Step {
  icon: typeof Wallet
  title: string
  body: string
}

function buildSteps(d: DerbyDeployment): Step[] {
  const gas = d.asset === 'eth' ? 'ETH' : 'USDC'
  const min = d.asset === 'eth' ? '0.001 ETH' : '0.1 USDC'
  return [
    {
      icon: Wallet,
      title: 'Connect and get test funds',
      body: `Connect your wallet on ${d.label}. You need test ${d.symbol} to bet and a little ${gas} for network fees. These are test tokens with no real value.`,
    },
    {
      icon: MousePointerClick,
      title: 'Pick a hamster and bet',
      body: `Four hamsters race on their wheels. Tap one, choose an amount (minimum ${min}) and confirm. You can bet on more than one hamster.`,
    },
    {
      icon: Lock,
      title: 'Betting closes after 2 minutes',
      body: 'When the timer ends, anyone can press "Lock round". This picks a future block to decide the race, so nobody can bet knowing the result.',
    },
    {
      icon: Flag,
      title: 'Run the race',
      body: 'A few blocks later, anyone can press "Run the race". The contract turns that block into a distance for each hamster. The farthest wheel runner wins.',
    },
    {
      icon: Trophy,
      title: 'Claim your winnings',
      body: `If your hamster won, press "Claim" to receive your share of the pot in ${d.symbol}. Your wallet only changes when you confirm a transaction.`,
    },
  ]
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group glass-inner rounded-2xl px-4">
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold"
        style={{ minHeight: 44, color: 'var(--ink)' }}
      >
        {q}
        <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <p className="pb-3 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        {children}
      </p>
    </details>
  )
}

export function HowItWorks({ deployment }: { deployment: DerbyDeployment }) {
  const [open, setOpen] = useState(() => !readClosed())
  const { symbol } = deployment
  const steps = buildSteps(deployment)

  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '0' : '1')
    } catch {
      // Storage can be unavailable in embedded previews; the guide still works.
    }
  }

  return (
    <section className="glass-card rounded-3xl p-5" aria-labelledby="guide-title">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="guide-body"
        className="flex w-full items-center justify-between gap-3 text-left"
        style={{ minHeight: 44 }}
      >
        <span>
          <span
            className="block text-[11px] font-semibold uppercase"
            style={{ letterSpacing: '0.1em', color: 'var(--muted)' }}
          >
            New here?
          </span>
          <span id="guide-title" className="display block text-xl font-bold">
            How Hamster Derby works
          </span>
        </span>
        <ChevronDown size={20} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div id="guide-body" className="mt-4 space-y-4">
          <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
            Everyone bets on one of four hamsters. When the race ends, the winners split the whole pot. There is no
            house and no fee: the money sits in a smart contract that nobody owns.
          </p>

          <ol className="space-y-2.5">
            {steps.map((step, index) => (
              <li key={step.title} className="glass-inner flex gap-3 rounded-2xl p-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ background: 'var(--accent)' }}
                  aria-hidden="true"
                >
                  <step.icon size={18} />
                </span>
                <div className="min-w-0">
                  <p className="display text-base font-bold">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-0.5 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="glass-inner rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.08em', color: 'var(--muted)' }}>
              Example
            </p>
            <p className="mt-1 text-sm text-pretty" style={{ color: 'var(--ink-2)' }}>
              The pot holds 10 {symbol} in total, and 2 {symbol} of it was bet on Turbo. You bet 1 {symbol} on Turbo.
              If Turbo wins, you own half of Turbo's pool, so you receive half of the pot: 5 {symbol}. If another
              hamster wins, your bet goes to its backers.
            </p>
          </div>

          <div className="space-y-2">
            <Faq q="Who decides the winner?">
              Nobody. The contract mixes the hash of the seed block with the round number and gets a distance from 0 to
              999 m for each hamster. The longest distance wins, and a tie goes to the lower-numbered hamster.
            </Faq>
            <Faq q="Why do I have to press Lock and Run?">
              The contract cannot start itself. Anyone can press these buttons, and the first person to do it moves the
              round forward for everybody. Lock takes a few seconds after the timer ends, and the race runs a few
              blocks later.
            </Faq>
            <Faq q="Can I get my money back?">
              Yes, in two cases. If nobody bet on the winning hamster, or if nobody ran the race in time, the round is
              cancelled and every bet is refunded with the "Refund" button.
            </Faq>
            <Faq q="Is it truly random?">
              It is fair for a demo, but not perfect. The result comes from a block hash, which block producers could
              nudge slightly. That is why this app only uses test funds.
            </Faq>
            <Faq q="What does 'Pays 2.50x' mean?">
              It is the pot divided by the amount bet on that hamster right now. If that hamster wins, each {symbol} you
              staked returns about that many {symbol}. It changes as people bet.
            </Faq>
          </div>
        </div>
      )}
    </section>
  )
}
