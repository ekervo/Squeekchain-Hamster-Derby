// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {HamsterDerby} from "../HamsterDerby.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

abstract contract HamsterDerbyTestBase is Test {
    HamsterDerby internal derby;
    MockERC20 internal usdc;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal eve = makeAddr("eve");

    uint256 internal constant FUND = 1e15;
    uint256 internal constant MIN_BET = 100000;

    function setUp() public virtual {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        derby = new HamsterDerby(address(usdc));
        address[5] memory users = [alice, bob, carol, dave, eve];
        for (uint256 i = 0; i < users.length; i++) {
            usdc.mint(users[i], FUND);
            vm.prank(users[i]);
            usdc.approve(address(derby), type(uint256).max);
        }
    }

    // ---------- helpers ----------

    function _bet(address user, uint256 roundId, uint256 hamster, uint256 amount) internal {
        vm.prank(user);
        derby.bet(roundId, hamster, amount);
    }

    function _claim(address user, uint256 roundId) internal returns (uint256 got) {
        uint256 before = usdc.balanceOf(user);
        vm.prank(user);
        derby.claim(roundId);
        got = usdc.balanceOf(user) - before;
    }

    /// @dev Warp to the end of betting, lock, return the seed block.
    function _lock(uint256 roundId) internal returns (uint256 seedBlock) {
        HamsterDerby.Round memory r = derby.getRound(roundId);
        vm.warp(r.bettingEndsAt);
        derby.lockRound(roundId);
        seedBlock = derby.getRound(roundId).seedBlock;
    }

    /// @dev Roll to seedBlock+1, pin the seed block's hash, settle.
    function _settleWithHash(uint256 roundId, bytes32 h) internal {
        uint256 sb = derby.getRound(roundId).seedBlock;
        vm.roll(sb + 1);
        vm.setBlockhash(sb, h);
        derby.settleRound(roundId);
    }

    /// @dev Independent replica of the race: winner = lowest id among the max distances.
    function _sim(bytes32 h, uint256 roundId) internal pure returns (uint8 w, uint16[4] memory d) {
        bytes32 seed = keccak256(abi.encode(h, roundId));
        uint16 max;
        for (uint256 i = 0; i < 4; i++) {
            d[i] = uint16(uint256(keccak256(abi.encode(seed, i))) % 1000);
            if (d[i] > max) max = d[i];
        }
        for (uint256 i = 0; i < 4; i++) {
            if (d[i] == max) {
                w = uint8(i);
                break;
            }
        }
    }

    function _hashForWinner(uint256 roundId, uint8 want) internal pure returns (bytes32 h) {
        for (uint256 i = 1; i < 10000; i++) {
            h = keccak256(abi.encode("winner-search", i));
            (uint8 w,) = _sim(h, roundId);
            if (w == want) return h;
        }
        revert("no hash found");
    }

    /// @dev Find a hash where >=2 hamsters share the max distance.
    function _hashForTie(uint256 roundId) internal pure returns (bytes32 h, uint8 lowest, uint8 other) {
        for (uint256 i = 1; i < 40000; i++) {
            h = keccak256(abi.encode("tie-search", i));
            (uint8 w, uint16[4] memory d) = _sim(h, roundId);
            for (uint8 j = w + 1; j < 4; j++) {
                if (d[j] == d[w]) return (h, w, j);
            }
        }
        revert("no tie found");
    }

    function _newRound() internal returns (uint256 id) {
        id = derby.createRound();
    }
}
