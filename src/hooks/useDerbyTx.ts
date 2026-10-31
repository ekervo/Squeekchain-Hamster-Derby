import { useCallback, useState } from 'react'
import { erc20Abi } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { derbyAbi, type DerbyDeployment, parseOnchainError, USER_REJECTED } from '@/lib/derby'
import { buildTxExplorerUrl } from '@/onchain-facts'

type Action = 'create' | 'approve' | 'bet' | 'lock' | 'settle' | 'claim'

/**
 * Sends one transaction at a time on the deployment's chain, waits for the
 * receipt, and reports only states the chain has confirmed.
 */
export function useDerbyTx(deployment: DerbyDeployment, onConfirmed: () => void) {
  const { chainId: walletChainId, isConnected } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: deployment.chainId })
  const [pending, setPending] = useState<Action | null>(null)
  const [lastHash, setLastHash] = useState<`0x${string}` | null>(null)

  const run = useCallback(
    async (action: Action, send: () => Promise<`0x${string}`>) => {
      if (!isConnected || !publicClient) return
      setPending(action)
      try {
        if (walletChainId !== deployment.chainId) {
          await switchChainAsync({ chainId: deployment.chainId })
        }
        const hash = await send()
        setLastHash(hash)
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') {
          toast.error('The transaction failed onchain.')
        } else {
          onConfirmed()
        }
      } catch (error) {
        const message = parseOnchainError(error)
        if (message !== USER_REJECTED) toast.error(message)
      } finally {
        setPending(null)
      }
    },
    [deployment.chainId, isConnected, onConfirmed, publicClient, switchChainAsync, walletChainId],
  )

  const base = { chainId: deployment.chainId, address: deployment.address, abi: derbyAbi } as const

  return {
    pending,
    lastTxUrl: lastHash ? buildTxExplorerUrl(deployment.chainId, lastHash) : null,
    createRound: () => run('create', () => writeContractAsync({ ...base, functionName: 'createRound' })),
    approve: (amount: bigint) =>
      run('approve', () =>
        writeContractAsync({
          chainId: deployment.chainId,
          address: deployment.usdc ?? deployment.address,
          abi: erc20Abi,
          functionName: 'approve',
          args: [deployment.address, amount],
        }),
      ),
    bet: (roundId: number, hamster: number, amount: bigint) =>
      run('bet', () =>
        deployment.asset === 'eth'
          ? writeContractAsync({ ...base, functionName: 'bet', args: [BigInt(roundId), BigInt(hamster)], value: amount })
          : writeContractAsync({ ...base, functionName: 'bet', args: [BigInt(roundId), BigInt(hamster), amount] }),
      ),
    lockRound: (roundId: number) =>
      run('lock', () => writeContractAsync({ ...base, functionName: 'lockRound', args: [BigInt(roundId)] })),
    settleRound: (roundId: number) =>
      run('settle', () => writeContractAsync({ ...base, functionName: 'settleRound', args: [BigInt(roundId)] })),
    claim: (roundId: number) =>
      run('claim', () => writeContractAsync({ ...base, functionName: 'claim', args: [BigInt(roundId)] })),
  }
}
