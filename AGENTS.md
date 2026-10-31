# [App Name]

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

[Brief description of what the app does and its primary use case]

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```

## Deployed contracts (HamsterDerby)
- Arc Testnet: 0xd1110d969f6ce09408da8934c1dc6f335894502b (USDC 0x3600...0000)
- Ethereum Sepolia (USDC version, no longer used by the UI): 0x63c26b480a2b8d0f40f3a7a6df1095ef1672f8d6
- Ethereum Sepolia HamsterDerbyEth (ETH stakes, used by the UI): 0x545af5a6bf74a9b3feaecc0ed5e0fc5d84db44b8
- Addresses are read from VITE_DERBY_ARC_TESTNET and VITE_DERBY_SEPOLIA_ETH in .env.
- Accepted risk: race seed is a future blockhash (validator-biasable). Testnet USDC only.
- Base Sepolia HamsterDerbyEth (ETH stakes): 0xbdb34a51c3de4ae8074768d125e7ff05d3229a23 (VITE_DERBY_BASE_SEPOLIA_ETH)
