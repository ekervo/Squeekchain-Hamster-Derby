import { parseAbi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { baseSepolia, sepolia } from 'wagmi/chains'
import { getChain, getUsdc } from '@/onchain-facts'
import { usdcDecimalsFor } from '@/onchain-money'

export const derbyAbi = parseAbi([
  'function createRound() returns (uint256 id)',
  'function bet(uint256 roundId, uint256 hamster, uint256 amount)',
  'function bet(uint256 roundId, uint256 hamster) payable',
  'function lockRound(uint256 roundId)',
  'function settleRound(uint256 roundId)',
  'function claim(uint256 roundId)',
  'function roundCount() view returns (uint256)',
  'function previewPayout(uint256 roundId, address user) view returns (uint256)',
  'function getUserStakes(uint256 roundId, address user) view returns (uint256[4])',
  'function getRound(uint256 roundId) view returns ((uint64 bettingEndsAt, uint64 seedBlock, uint8 winner, uint8 status, uint256 totalPool, uint256[4] pools, uint16[4] distances))',
  'function MIN_BET() view returns (uint256)',
  'function BETTING_DURATION() view returns (uint256)',
])

/** Where to get test funds for a network, shown under the game. */
export const FAUCETS: Record<number, { name: string; url: string }> = {
  [sepolia.id]: { name: 'Sepolia', url: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia' },
  [baseSepolia.id]: { name: 'Base Sepolia', url: 'https://portal.cdp.coinbase.com/products/faucet' },
}

export enum RoundStatus {
  Open = 0,
  Locked = 1,
  Settled = 2,
  Void = 3,
}

export interface RoundData {
  bettingEndsAt: bigint
  seedBlock: bigint
  winner: number
  status: RoundStatus
  totalPool: bigint
  pools: readonly bigint[]
  distances: readonly number[]
}

export interface DerbyDeployment {
  chainId: number
  label: string
  /** Compact name for the network tabs. */
  shortLabel: string
  address: `0x${string}`
  /** 'usdc' stakes the ERC-20 at `usdc`; 'eth' stakes the chain's native token. */
  asset: 'usdc' | 'eth'
  symbol: 'USDC' | 'ETH'
  decimals: number
  usdc?: `0x${string}`
}

function fromEnv(value: string | undefined): `0x${string}` | undefined {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as `0x${string}`) : undefined
}

function buildUsdc(chainId: number, label: string, shortLabel: string, env: string | undefined): DerbyDeployment | null {
  const address = fromEnv(env)
  const usdc = getUsdc(chainId)?.address
  if (!address || !usdc) return null
  return { chainId, label, shortLabel, address, asset: 'usdc', symbol: 'USDC', decimals: usdcDecimalsFor(chainId), usdc: usdc as `0x${string}` }
}

function buildEth(chainId: number, label: string, shortLabel: string, env: string | undefined): DerbyDeployment | null {
  const address = fromEnv(env)
  const native = getChain(chainId)?.nativeCurrency
  if (!address || !native) return null
  return { chainId, label, shortLabel, address, asset: 'eth', symbol: 'ETH', decimals: native.decimals }
}

export const DEPLOYMENTS: DerbyDeployment[] = [
  buildEth(sepolia.id, 'Ethereum Sepolia', 'Sepolia', String(import.meta.env.VITE_DERBY_SEPOLIA_ETH ?? '')),
  buildEth(baseSepolia.id, 'Base Sepolia', 'Base Sepolia', String(import.meta.env.VITE_DERBY_BASE_SEPOLIA_ETH ?? '')),
  buildUsdc(arcTestnet.id, 'Arc Testnet', 'Arc', String(import.meta.env.VITE_DERBY_ARC_TESTNET ?? '')),
].filter((d): d is DerbyDeployment => d !== null)

export interface Hamster {
  id: number
  name: string
  trait: string
  color: string
}

export const HAMSTERS: Hamster[] = [
  { id: 0, name: 'Nibbles', trait: 'Quick starter', color: '#e8a24a' },
  { id: 1, name: 'Biscuit', trait: 'Steady pacer', color: '#4d94e8' },
  { id: 2, name: 'Turbo', trait: 'Late sprinter', color: '#e0586a' },
  { id: 3, name: 'Peanut', trait: 'Lucky underdog', color: '#3fae80' },
]

export const USER_REJECTED = 'Transaction cancelled.'

export function parseOnchainError(error: unknown): string {
  const e = error as { message?: string; shortMessage?: string; code?: number } | null
  const message = `${e?.shortMessage ?? ''} ${e?.message ?? ''}`.toLowerCase()
  if (message.includes('user rejected') || e?.code === 4001) return USER_REJECTED
  if (message.includes('insufficient funds')) return 'Not enough gas on this network.'
  if (message.includes('bettingclosed')) return 'Betting has closed for this round.'
  if (message.includes('bettoosmall')) return 'Your bet is below the minimum.'
  if (message.includes('seednotready')) return 'The seed block is not ready yet. Try again in a few seconds.'
  if (message.includes('nothingtoclaim')) return 'You have nothing to claim in this round.'
  if (message.includes('reverted')) return 'The transaction was rejected. The round state may have changed.'
  if (message.includes('network') || message.includes('timeout')) return 'Network issue. Please try again.'
  return 'Something went wrong. Please try again.'
}
