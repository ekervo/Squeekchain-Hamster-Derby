// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title HamsterDerby
/// @notice Permissionless parimutuel hamster-wheel races for Squeekchain builders.
/// @dev Intended for Arc Testnet USDC (6 decimals) at
/// 0x3600000000000000000000000000000000000000. Pass that address to the constructor.
/// Only standard, non-rebasing, non-fee-on-transfer USDC is supported.
/// Future block hashes prevent seed-aware bets, but are not unbiasable randomness:
/// block producers can influence hashes and anyone can let settlement expire.
/// Rounded-down payout dust remains in the contract; there is no withdrawal authority.
contract HamsterDerby is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant HAMSTERS = 4;
    uint256 public constant BETTING_DURATION = 120;
    uint256 public constant SEED_DELAY = 2;
    uint256 public constant SETTLE_WINDOW = 200;
    uint256 public constant MIN_BET = 100000;

    enum Status { Open, Locked, Settled, Void }

    struct Round {
        uint64 bettingEndsAt;
        uint64 seedBlock;
        uint8 winner;
        Status status;
        uint256 totalPool;
        uint256[4] pools;
        uint16[4] distances;
    }

    /// @notice The immutable USDC token used by every round.
    IERC20 public immutable usdc;
    /// @notice Next unused round id; ids start at zero.
    uint256 public nextRoundId;
    /// @notice Round scalar fields; use getRound to also retrieve arrays.
    mapping(uint256 => Round) public rounds;
    /// @notice Stakes in USDC base units, keyed by round, player, and hamster.
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) public stakes;
    /// @notice Whether a player has successfully claimed a given round.
    mapping(uint256 => mapping(address => bool)) public claimed;

    error ZeroAddress();
    error RoundNotFound(uint256 roundId);
    error InvalidStatus(uint256 roundId, Status actual);
    error BettingClosed(uint256 roundId);
    error BettingStillOpen(uint256 roundId);
    error InvalidHamster(uint256 hamster);
    error BetTooSmall(uint256 amount);
    error SeedNotReady(uint256 seedBlock);
    error AlreadyClaimed(uint256 roundId, address user);
    error NothingToClaim();
    error ValueExceedsUint64();

    event RoundCreated(uint256 indexed roundId, uint64 bettingEndsAt);
    event BetPlaced(uint256 indexed roundId, address indexed user, uint256 indexed hamster, uint256 amount);
    event RoundLocked(uint256 indexed roundId, uint64 seedBlock);
    event RoundVoided(uint256 indexed roundId);
    event RoundSettled(uint256 indexed roundId, uint8 indexed winner, uint16[4] distances);
    event Claimed(uint256 indexed roundId, address indexed user, uint256 amount);

    /// @param usdcAddress USDC ERC-20 address; cannot be zero.
    constructor(address usdcAddress) {
        if (usdcAddress == address(0)) revert ZeroAddress();
        usdc = IERC20(usdcAddress);
    }

    /// @notice Create an independent round with a two-minute betting period.
    /// @return id The newly allocated round id.
    function createRound() external returns (uint256 id) {
        uint256 endsAt = block.timestamp + BETTING_DURATION;
        if (endsAt > type(uint64).max) revert ValueExceedsUint64();
        id = nextRoundId++;
        Round storage round = rounds[id];
        round.bettingEndsAt = uint64(endsAt);
        round.status = Status.Open;
        emit RoundCreated(id, round.bettingEndsAt);
    }

    /// @notice Stake USDC on a hamster before betting closes.
    /// @param roundId Existing round id.
    /// @param hamster Hamster id from 0 through 3.
    /// @param amount USDC base units; at least 0.1 USDC per bet.
    /// @dev Approve this contract first. Effects precede the token interaction;
    /// a failed transfer reverts all accounting changes.
    function bet(uint256 roundId, uint256 hamster, uint256 amount) external nonReentrant {
        Round storage round = _getRound(roundId);
        if (round.status != Status.Open) revert InvalidStatus(roundId, round.status);
        if (block.timestamp >= round.bettingEndsAt) revert BettingClosed(roundId);
        if (hamster >= HAMSTERS) revert InvalidHamster(hamster);
        if (amount < MIN_BET) revert BetTooSmall(amount);

        round.totalPool += amount;
        round.pools[hamster] += amount;
        stakes[roundId][msg.sender][hamster] += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit BetPlaced(roundId, msg.sender, hamster, amount);
    }

    /// @notice After betting closes, commit to a block two blocks in the future.
    /// @param roundId Existing Open round id.
    function lockRound(uint256 roundId) external {
        Round storage round = _getRound(roundId);
        if (round.status != Status.Open) revert InvalidStatus(roundId, round.status);
        if (block.timestamp < round.bettingEndsAt) revert BettingStillOpen(roundId);
        uint256 seedBlock = block.number + SEED_DELAY;
        if (seedBlock > type(uint64).max) revert ValueExceedsUint64();
        round.seedBlock = uint64(seedBlock);
        round.status = Status.Locked;
        emit RoundLocked(roundId, round.seedBlock);
    }

    /// @notice Simulate a locked race, or void it if its seed cannot be used.
    /// @param roundId Existing Locked round id.
    /// @dev Callable from seedBlock + 1 onward. Expired or zero hashes void the
    /// round. Ties select the lowest id. An unbacked winner also voids the round.
    function settleRound(uint256 roundId) external {
        Round storage round = _getRound(roundId);
        if (round.status != Status.Locked) revert InvalidStatus(roundId, round.status);
        uint256 seedBlock = round.seedBlock;
        if (block.number <= seedBlock) revert SeedNotReady(seedBlock);
        if (block.number > seedBlock + SETTLE_WINDOW) {
            _voidRound(roundId, round);
            return;
        }

        bytes32 seedHash = blockhash(seedBlock);
        if (seedHash == bytes32(0)) {
            _voidRound(roundId, round);
            return;
        }
        bytes32 seed = keccak256(abi.encode(seedHash, roundId));
        uint16[4] memory distances;
        uint8 winner;
        for (uint256 i = 0; i < HAMSTERS; ++i) {
            distances[i] = uint16(uint256(keccak256(abi.encode(seed, i))) % 1000);
            if (distances[i] > distances[winner]) winner = uint8(i);
        }
        round.distances = distances;
        round.winner = winner;

        if (round.totalPool == 0 || round.pools[winner] == 0) {
            _voidRound(roundId, round);
            return;
        }
        round.status = Status.Settled;
        emit RoundSettled(roundId, winner, distances);
    }

    /// @notice Claim your winning payout or, for a void round, all your stakes.
    /// @param roundId Existing Settled or Void round id.
    /// @dev Each player can claim once per round. Losing players and nonplayers
    /// revert with NothingToClaim. Claim flags are written before transferring.
    function claim(uint256 roundId) external nonReentrant {
        Round storage round = _getRound(roundId);
        if (round.status != Status.Settled && round.status != Status.Void) {
            revert InvalidStatus(roundId, round.status);
        }
        if (claimed[roundId][msg.sender]) revert AlreadyClaimed(roundId, msg.sender);
        uint256 amount = _payout(roundId, msg.sender, round);
        if (amount == 0) revert NothingToClaim();
        claimed[roundId][msg.sender] = true;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(roundId, msg.sender, amount);
    }

    /// @notice Retrieve all round fields, including hamster pools and distances.
    /// @param roundId Existing round id.
    /// @return round Complete round data. Winner is meaningful after simulation.
    function getRound(uint256 roundId) external view returns (Round memory round) {
        round = _getRound(roundId);
    }

    /// @notice Retrieve a player's stake on each of the four hamsters.
    /// @param roundId Existing round id.
    /// @param user Player address.
    /// @return userStakes Stakes in hamster-id order, in USDC base units.
    function getUserStakes(uint256 roundId, address user) external view returns (uint256[4] memory userStakes) {
        _getRound(roundId);
        for (uint256 i = 0; i < HAMSTERS; ++i) {
            userStakes[i] = stakes[roundId][user][i];
        }
    }

    /// @notice Preview a claim; returns zero for unknown, unfinished, already
    /// claimed rounds or users with no entitlement.
    /// @param roundId Round id to inspect.
    /// @param user Player address.
    /// @return amount Claimable USDC base units, rounded down.
    function previewPayout(uint256 roundId, address user) external view returns (uint256 amount) {
        if (roundId >= nextRoundId || claimed[roundId][user]) return 0;
        return _payout(roundId, user, rounds[roundId]);
    }

    /// @notice Number of rounds created, including unfinished and void rounds.
    /// @return count Total rounds created.
    function roundCount() external view returns (uint256 count) {
        return nextRoundId;
    }

    function _getRound(uint256 roundId) private view returns (Round storage round) {
        if (roundId >= nextRoundId) revert RoundNotFound(roundId);
        return rounds[roundId];
    }

    function _voidRound(uint256 roundId, Round storage round) private {
        round.status = Status.Void;
        emit RoundVoided(roundId);
    }

    function _payout(uint256 roundId, address user, Round storage round) private view returns (uint256 amount) {
        if (round.status == Status.Settled) {
            // uint256 arithmetic comfortably accommodates practical USDC supply
            // and its squared product; Solidity checks all arithmetic overflow.
            return stakes[roundId][user][round.winner] * round.totalPool / round.pools[round.winner];
        }
        if (round.status == Status.Void) {
            for (uint256 i = 0; i < HAMSTERS; ++i) {
                amount += stakes[roundId][user][i];
            }
        }
    }
}
