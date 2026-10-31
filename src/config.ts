/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { baseSepolia, mainnet, sepolia } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { getChain } from '@/onchain-facts'

const arcRpc = getChain(arcTestnet.id)?.rpcUrls[0] ?? arcTestnet.rpcUrls.default.http[0]
const sepoliaRpc = getChain(sepolia.id)?.rpcUrls[0] ?? sepolia.rpcUrls.default.http[0]
const baseSepoliaRpc = getChain(baseSepolia.id)?.rpcUrls[0] ?? baseSepolia.rpcUrls.default.http[0]

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcRpc)
registerChain(sepolia.id, sepoliaRpc)
registerChain(baseSepolia.id, baseSepoliaRpc)

export const config = createConfig({
  chains: [arcTestnet, sepolia, baseSepolia, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(arcRpc),
    [sepolia.id]: http(sepoliaRpc),
    [baseSepolia.id]: http(baseSepoliaRpc),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
