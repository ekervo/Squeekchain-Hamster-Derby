import { useQuery } from '@tanstack/react-query'
import { encodeAbiParameters, keccak256 } from 'viem'
import { usePublicClient } from 'wagmi'
import { BadgeCheck, Box, ExternalLink, TriangleAlert } from 'lucide-react'
import { requireChain } from '@/onchain-facts'
import { HAMSTERS, type DerbyDeployment, type RoundData, RoundStatus } from '@/lib/derby'

interface Props {
  deployment: DerbyDeployment
  roundId: number | undefined
  round: RoundData | undefined
  latestBlock: bigint | undefined
}

const PAIR = [{ type: 'bytes32' }, { type: 'uint256' }] as const

/** Recomputes the race exactly as the contract does, from a block hash. */
export function raceFromBlockHash(blockHash: `0x${string}`, roundId: number) {
  const seed = keccak256(encodeAbiParameters(PAIR, [blockHash, BigInt(roundId)]))
  const distances = HAMSTERS.map((h) =>
    Number(BigInt(keccak256(encodeAbiParameters(PAIR, [seed, BigInt(h.id)]))) % 1000n),
  )
  let winner = 0
  distances.forEach((d, i) => {
    if (d > distances[winner]) winner = i
  })
  return { distances, winner }
}

export function BlockProof({ deployment, roundId, round, latestBlock }: Props) {
  const { chainId } = deployment
  const client = usePublicClient({ chainId })
  const status = round?.status
  const seedBlock = round && round.seedBlock > 0n ? round.seedBlock : undefined
  const seedMined = seedBlock !== undefined && latestBlock !== undefined && latestBlock >= seedBlock
  const blockUrl = (n: bigint) => `${requireChain(chainId).explorerBase}/block/${n.toString()}`

  const block = useQuery({
    queryKey: ['seed-block', chainId, seedBlock?.toString()],
    enabled: Boolean(client) && seedMined && seedBlock !== undefined,
    staleTime: Infinity,
    queryFn: async () => {
      if (!client || seedBlock === undefined) return null
      const b = await client.getBlock({ blockNumber: seedBlock })
      return b.hash
    },
  })

  if (!round || roundId === undefined) return null
  if (status === RoundStatus.Open) {
    return (
      <section className="glass-card rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <Box size={16} style={{ color: 'var(--muted)' }} />
          <p className="text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.1em', color: 'var(--muted)' }}>
            Block prediction
          </p>
        </div>
        <p className="mt-2 text-sm text-pretty" style={{ color: 'var(--ink-2)' }}>
          You are predicting a future block. When betting ends, the round locks onto a block that does not exist yet.
          Its hash decides which hamster runs farthest.
        </p>
        {latestBlock !== undefined && (
          <p className="mono mt-2 text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
            {deployment.label} latest block #{latestBlock.toString()}
          </p>
        )}
      </section>
    )
  }
  if (seedBlock === undefined) return null

  const proof =
    status === RoundStatus.Settled && block.data
      ? (() => {
          const local = raceFromBlockHash(block.data, roundId)
          const matches =
            local.winner === round.winner && local.distances.every((d, i) => d === round.distances[i])
          return { local, matches }
        })()
      : null

  return (
    <section className="glass-card rounded-3xl p-5">
      <div className="flex items-center gap-2">
        <Box size={16} style={{ color: 'var(--muted)' }} />
        <p className="text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.1em', color: 'var(--muted)' }}>
          Seed block proof
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={blockUrl(seedBlock)}
          target="_blank"
          rel="noopener noreferrer"
          className="display inline-flex items-center gap-1 text-lg font-bold underline"
        >
          Block #{seedBlock.toString()} <ExternalLink size={14} />
        </a>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>
          {seedMined
            ? 'mined'
            : latestBlock !== undefined
              ? `${(seedBlock - latestBlock).toString()} block${seedBlock - latestBlock === 1n ? '' : 's'} to go`
              : 'not mined yet'}
        </span>
      </div>

      {block.data && (
        <p className="mono mt-2 break-all text-[11px]" style={{ color: 'var(--muted)' }}>
          {block.data}
        </p>
      )}

      {status === RoundStatus.Locked && (
        <p className="mt-2 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          {seedMined
            ? 'The block is mined. Reveal the result to put its hash onchain.'
            : 'Nobody, including you, can know this hash until the block is mined.'}
        </p>
      )}

      {proof && (
        <div
          className="glass-inner mt-3 rounded-2xl p-3 text-sm"
          style={{ color: proof.matches ? 'var(--success)' : 'var(--danger)' }}
        >
          <p className="flex items-center gap-2 font-semibold">
            {proof.matches ? <BadgeCheck size={16} /> : <TriangleAlert size={16} />}
            {proof.matches
              ? 'Verified in your browser: this block hash gives exactly the onchain result.'
              : 'Mismatch: this block hash does not reproduce the onchain result.'}
          </p>
          <p className="mono mt-1 text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>
            {HAMSTERS.map((h, i) => `${h.name} ${proof.local.distances[i]} m`).join(' · ')}
          </p>
        </div>
      )}
    </section>
  )
}
