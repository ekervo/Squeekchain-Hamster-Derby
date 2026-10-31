/**
 * Hamster Derby keeper bot.
 *
 * Watches every configured network and moves rounds forward so nobody has to press buttons:
 *   Open (betting over, has bets) -> lockRound
 *   Locked (seed block mined)     -> settleRound
 *   finished or empty             -> createRound (only while players are active, see IDLE_ROUND_MINUTES)
 *
 * Signs with a Circle developer-controlled wallet. Needs CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET and the
 * KEEPER_WALLET_* ids written by `bun run keeper:setup`. Start it with `bun run keeper`.
 */
import { createPublicClient, http, parseAbi, type PublicClient } from 'viem';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { getChain } from '../src/onchain-facts';
import { waitForSuccessfulTransaction } from '../src/onchain-wait';

const abi = parseAbi([
  'function roundCount() view returns (uint256)',
  'function getRound(uint256 roundId) view returns ((uint64 bettingEndsAt, uint64 seedBlock, uint8 winner, uint8 status, uint256 totalPool, uint256[4] pools, uint16[4] distances))',
]);

const STATUS = { Open: 0, Locked: 1, Settled: 2, Void: 3 } as const;
const POLL_MS = Number(process.env.KEEPER_POLL_MS ?? 6000);
const SCAN_DEPTH = 6;
const ERROR_COOLDOWN_MS = 30_000;
/** With no bets, a new round is opened at most this often, so an idle bot does not burn gas. */
const IDLE_ROUND_MS = Number(process.env.KEEPER_IDLE_ROUND_MINUTES ?? 15) * 60_000;

interface KeeperChain {
  label: string;
  chainId: number;
  circleChain: string;
  proxyKey: string;
  contractEnv: string;
  walletEnv: string;
}

const CHAINS: KeeperChain[] = [
  {
    label: 'Ethereum Sepolia',
    chainId: 11155111,
    circleChain: 'ETH-SEPOLIA',
    proxyKey: 'Ethereum_Sepolia',
    contractEnv: 'VITE_DERBY_SEPOLIA_ETH',
    walletEnv: 'KEEPER_WALLET_ETH_SEPOLIA',
  },
  {
    label: 'Base Sepolia',
    chainId: 84532,
    circleChain: 'BASE-SEPOLIA',
    proxyKey: 'Base_Sepolia',
    contractEnv: 'VITE_DERBY_BASE_SEPOLIA_ETH',
    walletEnv: 'KEEPER_WALLET_BASE_SEPOLIA',
  },
  {
    label: 'Arc Testnet',
    chainId: 5042002,
    circleChain: 'ARC-TESTNET',
    proxyKey: 'Arc_Testnet',
    contractEnv: 'VITE_DERBY_ARC_TESTNET',
    walletEnv: 'KEEPER_WALLET_ARC_TESTNET',
  },
];

function log(label: string, message: string): void {
  console.log(`${new Date().toISOString()} [${label}] ${message}`);
}

function rpcUrlFor(chain: KeeperChain): string {
  const proxied = (process.env.RPC_PROXY_CHAINS ?? '').split(',').includes(chain.proxyKey);
  if (process.env.RPC_PROXY_BASE_URL && proxied) {
    return `${process.env.RPC_PROXY_BASE_URL}/api/rpc/${chain.proxyKey}?_rpc_token=${process.env.RPC_PROXY_TOKEN ?? ''}`;
  }
  const fallback = getChain(chain.chainId)?.rpcUrls[0];
  if (!fallback) throw new Error(`No RPC URL known for ${chain.label}`);
  return fallback;
}

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  console.error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set in .env. Run `bun run keeper:setup` first.');
  process.exit(1);
}
const wallets = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

interface ChainState {
  config: KeeperChain;
  contract: `0x${string}`;
  walletId: string;
  client: PublicClient;
  busy: boolean;
  cooldownUntil: number;
  lastCreateAt: number;
}

async function send(state: ChainState, signature: string, params: string[]): Promise<void> {
  const created = await wallets.createContractExecutionTransaction({
    walletId: state.walletId,
    contractAddress: state.contract,
    abiFunctionSignature: signature,
    abiParameters: params,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
  const id = created.data?.id;
  if (!id) throw new Error(`Circle returned no transaction id for ${signature}`);
  await waitForSuccessfulTransaction(
    () => wallets.getTransaction({ id }),
    (value) => value.data?.transaction?.state,
    { label: `${state.config.label} ${signature}` },
  );
}

async function tick(state: ChainState): Promise<void> {
  const { client, contract, config } = state;
  const [count, head] = await Promise.all([
    client.readContract({ address: contract, abi, functionName: 'roundCount' }),
    client.getBlock(),
  ]);
  const total = Number(count);
  const now = head.timestamp;

  // Move any recent round that needs a push, newest first. One action per tick.
  for (let id = total - 1; id >= Math.max(0, total - SCAN_DEPTH); id--) {
    const round = await client.readContract({ address: contract, abi, functionName: 'getRound', args: [BigInt(id)] });
    if (round.status === STATUS.Open && now >= round.bettingEndsAt && round.totalPool > 0n) {
      log(config.label, `locking round #${id}`);
      await send(state, 'lockRound(uint256)', [String(id)]);
      return;
    }
    if (round.status === STATUS.Locked && head.number > round.seedBlock) {
      log(config.label, `settling round #${id}`);
      await send(state, 'settleRound(uint256)', [String(id)]);
      return;
    }
  }

  // Keep a round available for players, without spamming empty ones.
  let needsRound = total === 0;
  let hadBets = false;
  if (total > 0) {
    const latest = await client.readContract({
      address: contract,
      abi,
      functionName: 'getRound',
      args: [BigInt(total - 1)],
    });
    hadBets = latest.totalPool > 0n;
    const done = latest.status === STATUS.Settled || latest.status === STATUS.Void;
    const deadEmpty = latest.status === STATUS.Open && now >= latest.bettingEndsAt && latest.totalPool === 0n;
    needsRound = done || deadEmpty;
  }
  const idleLongEnough = Date.now() - state.lastCreateAt >= IDLE_ROUND_MS;
  if (needsRound && (total === 0 || hadBets || idleLongEnough)) {
    log(config.label, 'opening a new round');
    state.lastCreateAt = Date.now();
    await send(state, 'createRound()', []);
  }
}

function buildState(config: KeeperChain): ChainState | null {
  const contract = process.env[config.contractEnv];
  const walletId = process.env[config.walletEnv];
  if (!contract || !/^0x[0-9a-fA-F]{40}$/.test(contract)) {
    log(config.label, `skipped: ${config.contractEnv} is not set`);
    return null;
  }
  if (!walletId) {
    log(config.label, `skipped: ${config.walletEnv} is not set (run \`bun run keeper:setup\`)`);
    return null;
  }
  return {
    config,
    contract: contract as `0x${string}`,
    walletId,
    client: createPublicClient({ transport: http(rpcUrlFor(config)) }),
    busy: false,
    cooldownUntil: 0,
    lastCreateAt: 0,
  };
}

const states = CHAINS.map(buildState).filter((s): s is ChainState => s !== null);
if (states.length === 0) {
  console.error('No chain is fully configured. Nothing to do.');
  process.exit(1);
}

log('keeper', `watching ${states.map((s) => s.config.label).join(', ')} every ${POLL_MS / 1000}s`);

async function loop(state: ChainState): Promise<void> {
  if (state.busy || Date.now() < state.cooldownUntil) return;
  state.busy = true;
  try {
    await tick(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(state.config.label, `error: ${message.slice(0, 300)}`);
    state.cooldownUntil = Date.now() + ERROR_COOLDOWN_MS;
  } finally {
    state.busy = false;
  }
}

for (const state of states) {
  void loop(state);
  setInterval(() => void loop(state), POLL_MS);
}
