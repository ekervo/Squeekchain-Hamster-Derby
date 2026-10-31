import { useEffect, useMemo, useState } from 'react'
import { erc20Abi } from 'viem'
import { useAccount, useBalance, useBlock, useReadContract, useReadContracts } from 'wagmi'
import { derbyAbi, type DerbyDeployment, type RoundData } from '@/lib/derby'

const HISTORY = 6
const POLL_MS = 3000

export interface ChainClock {
  timestamp: bigint
  blockNumber: bigint
}

export function useChainClock(chainId: number): ChainClock | undefined {
  const { data } = useBlock({ chainId, query: { refetchInterval: POLL_MS } })
  return data ? { timestamp: data.timestamp, blockNumber: data.number } : undefined
}

/** Chain time in seconds, ticking each second between block polls. */
export function useChainNow(clock: ChainClock | undefined): bigint {
  const anchor = clock?.timestamp
  const [now, setNow] = useState<bigint>(0n)
  useEffect(() => {
    if (anchor === undefined) return
    const startedAt = Date.now()
    const timer = setInterval(() => {
      setNow(anchor + BigInt(Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [anchor])
  return now > (anchor ?? 0n) ? now : (anchor ?? 0n)
}

export function useRounds(deployment: DerbyDeployment) {
  const { chainId, address } = deployment
  const count = useReadContract({
    chainId,
    address,
    abi: derbyAbi,
    functionName: 'roundCount',
    query: { refetchInterval: POLL_MS },
  })

  const total = count.data !== undefined ? Number(count.data) : 0
  const ids = useMemo(() => {
    const list: number[] = []
    for (let i = total - 1; i >= 0 && list.length < HISTORY; i--) list.push(i)
    return list
  }, [total])

  const rounds = useReadContracts({
    contracts: ids.map((id) => ({
      chainId,
      address,
      abi: derbyAbi,
      functionName: 'getRound' as const,
      args: [BigInt(id)] as const,
    })),
    query: { enabled: ids.length > 0, refetchInterval: POLL_MS },
  })

  const items = useMemo(() => {
    return ids.map((id, index) => {
      const result = rounds.data?.[index]?.result
      if (!result) return { id, data: undefined as RoundData | undefined }
      const data: RoundData = {
        bettingEndsAt: result.bettingEndsAt,
        seedBlock: result.seedBlock,
        winner: result.winner,
        status: result.status,
        totalPool: result.totalPool,
        pools: result.pools,
        distances: result.distances,
      }
      return { id, data }
    })
  }, [ids, rounds.data])

  return {
    items,
    total,
    isLoading: count.isLoading || (ids.length > 0 && rounds.isLoading),
    refetch: async () => {
      await count.refetch()
      await rounds.refetch()
    },
  }
}

export function useMyPosition(deployment: DerbyDeployment, roundId: number | undefined) {
  const { address: user } = useAccount()
  const { chainId, address } = deployment
  const enabled = Boolean(user) && roundId !== undefined

  const result = useReadContracts({
    contracts: [
      {
        chainId,
        address,
        abi: derbyAbi,
        functionName: 'getUserStakes',
        args: [BigInt(roundId ?? 0), user ?? '0x0000000000000000000000000000000000000000'],
      },
      {
        chainId,
        address,
        abi: derbyAbi,
        functionName: 'previewPayout',
        args: [BigInt(roundId ?? 0), user ?? '0x0000000000000000000000000000000000000000'],
      },
    ],
    query: { enabled, refetchInterval: POLL_MS },
  })

  const stakes = result.data?.[0]?.result
  const payout = result.data?.[1]?.result
  return {
    stakes: stakes ?? [0n, 0n, 0n, 0n],
    payout: payout ?? 0n,
    refetch: result.refetch,
  }
}

const MAX_UINT = 2n ** 256n - 1n

/** Wallet balance, allowance and minimum bet for whichever asset the deployment stakes. */
export function useStakeAsset(deployment: DerbyDeployment) {
  const { address: user } = useAccount()
  const { chainId, usdc, address, asset } = deployment
  const zero = '0x0000000000000000000000000000000000000000'

  const erc20 = useReadContracts({
    contracts: [
      { chainId, address: usdc ?? address, abi: erc20Abi, functionName: 'balanceOf', args: [user ?? zero] },
      { chainId, address: usdc ?? address, abi: erc20Abi, functionName: 'allowance', args: [user ?? zero, address] },
    ],
    query: { enabled: Boolean(user) && asset === 'usdc', refetchInterval: POLL_MS },
  })
  const native = useBalance({
    address: user,
    chainId,
    query: { enabled: Boolean(user) && asset === 'eth', refetchInterval: POLL_MS },
  })
  const min = useReadContract({ chainId, address, abi: derbyAbi, functionName: 'MIN_BET' })

  const refetch = async () => {
    if (asset === 'usdc') await erc20.refetch()
    else await native.refetch()
  }

  return {
    balance: asset === 'usdc' ? (erc20.data?.[0]?.result ?? 0n) : (native.data?.value ?? 0n),
    // Native-token bets need no approval.
    allowance: asset === 'usdc' ? (erc20.data?.[1]?.result ?? 0n) : MAX_UINT,
    minBet: min.data ?? (asset === 'usdc' ? 100000n : 10n ** 15n),
    refetch,
  }
}
