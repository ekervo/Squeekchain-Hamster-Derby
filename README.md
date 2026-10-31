# Hamster Derby

A prediction game on simulated hamster-wheel races. Each round has four hamsters: pick one, stake funds, and winners split the whole pot. If a round cannot be settled, everyone is refunded. There is no owner and no fee. Bets are placed in USDC on Arc Testnet and in ETH on Ethereum Sepolia and Base Sepolia, with test funds only. A built-in guide explains the game for newcomers, and a race arena replays each result as an animated hamster race, and a seed block proof lets anyone recompute the result from the block hash in their browser.

## Tech stack

- React, TypeScript, Vite, Tailwind CSS
- wagmi, viem, ConnectKit
- Solidity, Foundry, OpenZeppelin

## Development

Prerequisites: Bun and Foundry.

Install: `bun install`

Environment variables:

- `VITE_DERBY_ARC_TESTNET`: deployed HamsterDerby address on Arc Testnet.
- `VITE_DERBY_SEPOLIA_ETH`: deployed HamsterDerbyEth (ETH stakes) address on Ethereum Sepolia.
- `VITE_DERBY_BASE_SEPOLIA_ETH`: deployed HamsterDerbyEth address on Base Sepolia.
- `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`: Circle developer-controlled wallet credentials, only needed to run the keeper bot.
- `KEEPER_WALLET_ETH_SEPOLIA`, `KEEPER_WALLET_BASE_SEPOLIA`, `KEEPER_WALLET_ARC_TESTNET`: keeper wallet ids, written by `bun run keeper:setup`.
- `KEEPER_POLL_MS`, `KEEPER_IDLE_ROUND_MINUTES`: optional keeper tuning.
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: optional RPC proxy settings used by the keeper bot; public RPC URLs are used when they are not set.

Run: `bun run dev`

Check (lint and typecheck): `bun run check`

Compile the contract: `forge build`

Keeper bot (locks and settles rounds automatically): `bun run keeper:setup` once, fund the printed wallet address with test gas, then `bun run keeper`.
