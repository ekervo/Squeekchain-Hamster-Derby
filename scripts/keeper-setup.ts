/**
 * One-time setup for the keeper bot: creates a Circle wallet set and one EOA wallet per network, then
 * appends the wallet ids (not secrets) to .env. Prints the shared wallet address so it can be funded.
 *
 * Needs CIRCLE_API_KEY and a registered CIRCLE_ENTITY_SECRET in .env. Safe to re-run: it does nothing
 * if the wallet ids already exist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const TARGETS = [
  { circleChain: 'ETH-SEPOLIA', env: 'KEEPER_WALLET_ETH_SEPOLIA' },
  { circleChain: 'BASE-SEPOLIA', env: 'KEEPER_WALLET_BASE_SEPOLIA' },
  { circleChain: 'ARC-TESTNET', env: 'KEEPER_WALLET_ARC_TESTNET' },
] as const;

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  console.error('Set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET in .env first.');
  process.exit(1);
}

if (TARGETS.every((t) => process.env[t.env])) {
  console.log('Keeper wallets already configured in .env. Nothing to do.');
  process.exit(0);
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const set = await client.createWalletSet({ name: `hamster-derby-keeper-${Date.now()}` });
const walletSetId = set.data?.walletSet?.id;
if (!walletSetId) throw new Error('Circle did not return a wallet set id.');

const created = await client.createWallets({
  accountType: 'EOA',
  blockchains: TARGETS.map((t) => t.circleChain),
  count: 1,
  walletSetId,
});
const list = created.data?.wallets ?? [];

const lines: string[] = [];
for (const target of TARGETS) {
  const wallet = list.find((w) => w.blockchain === target.circleChain);
  if (!wallet?.id) throw new Error(`No wallet returned for ${target.circleChain}`);
  lines.push(`${target.env}=${wallet.id}`);
  console.log(`${target.circleChain}: ${wallet.address}`);
}
fs.appendFileSync(path.join(process.cwd(), '.env'), `\n${lines.join('\n')}\n`, 'utf-8');
console.log('Wallet ids saved to .env. Fund the address above with gas, then run `bun run keeper`.');
