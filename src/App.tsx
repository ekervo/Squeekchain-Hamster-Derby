import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { NetworkBase, NetworkEthereum, TokenETH, TokenUSDC } from '@web3icons/react'
import { DEPLOYMENTS, FAUCETS } from '@/lib/derby'
import { RoundPanel } from '@/components/RoundPanel'
import { HamsterAvatar } from '@/components/HamsterAvatar'
import { HowItWorks } from '@/components/HowItWorks'

function ArcMark() {
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
      style={{ background: 'var(--accent)' }}
      aria-hidden="true"
    >
      A
    </span>
  )
}

export default function App() {
  const [chainId, setChainId] = useState(DEPLOYMENTS[0]?.chainId ?? 0)
  const deployment = DEPLOYMENTS.find((d) => d.chainId === chainId)

  return (
    <div className="relative min-h-dvh overflow-hidden" style={{ background: 'var(--bg-gradient)' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: '5%',
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '8%',
            right: '8%',
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)',
            filter: 'blur(58px)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-24 pt-6">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="glass-pill flex h-11 w-11 items-center justify-center rounded-2xl">
              <HamsterAvatar color="#e8a24a" size={34} />
            </span>
            <div>
              <h1 className="display text-xl font-bold leading-none">Hamster Derby</h1>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Wheel races. Onchain pots.</p>
            </div>
          </div>
          <ConnectKitButton.Custom>
            {({ isConnected, show, truncatedAddress }) => (
              <button
                type="button"
                onClick={() => show?.()}
                className="rounded-full px-4 text-xs font-semibold text-white transition-colors hover:brightness-110"
                style={{ minHeight: 44, background: 'var(--accent)' }}
              >
                {isConnected ? truncatedAddress : 'Connect wallet'}
              </button>
            )}
          </ConnectKitButton.Custom>
        </header>

        <div className="glass-pill mb-4 flex gap-1 rounded-full p-1" role="tablist" aria-label="Select network">
          {DEPLOYMENTS.map((d) => {
            const active = d.chainId === chainId
            return (
              <button
                key={d.chainId}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setChainId(d.chainId)}
                className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[12px] font-semibold leading-tight"
                style={{
                  minHeight: 52,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? '#fff' : 'var(--ink-2)',
                }}
              >
                <span className="flex items-center gap-1.5">
                  {d.asset === 'usdc' ? (
                    <ArcMark />
                  ) : d.chainId === 84532 ? (
                    <NetworkBase variant="branded" size={14} />
                  ) : (
                    <NetworkEthereum variant="branded" size={14} />
                  )}
                  <span className="truncate">{d.shortLabel}</span>
                </span>
                <span className="text-[10px] font-medium opacity-70">Bet in {d.symbol}</span>
              </button>
            )
          })}
        </div>

        {deployment ? (
          <>
            <HowItWorks key={`guide-${deployment.chainId}`} deployment={deployment} />
            <div className="mt-4">
              <RoundPanel key={deployment.chainId} deployment={deployment} />
            </div>
          </>
        ) : (
          <p className="glass-card rounded-3xl p-5 text-sm" style={{ color: 'var(--muted)' }}>
            Contract addresses are not configured in .env.
          </p>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs" style={{ color: 'var(--subtle)' }}>
          {deployment?.asset === 'eth' ? <TokenETH variant="branded" size={14} /> : <TokenUSDC variant="branded" size={14} />}
          {deployment && FAUCETS[deployment.chainId] ? (
            <span>
              Need {FAUCETS[deployment.chainId].name} ETH?{' '}
              <a
                href={FAUCETS[deployment.chainId].url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Open a faucet
              </a>
            </span>
          ) : (
            'Need test USDC? Use the "Get test USDC" button in the Arc Studio sidebar.'
          )}
        </p>
      </div>

      <a
        href="https://x.com/gemresearches"
        target="_blank"
        rel="noopener noreferrer"
        className="glass-pill fixed bottom-4 left-4 z-[9998] inline-flex items-center rounded-full px-3.5 text-xs font-semibold transition-colors hover:brightness-95"
        style={{ minHeight: 36, color: 'var(--ink)' }}
      >
        Built by @gemresearches
      </a>
    </div>
  )
}
