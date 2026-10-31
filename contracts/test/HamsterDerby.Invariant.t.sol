// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {HamsterDerby} from "../HamsterDerby.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

contract HamsterDerbyHandler is Test {
    HamsterDerby public derby;
    MockERC20 public usdc;
    address[4] public actors;

    uint256 public ghostDeposited;
    uint256 public ghostClaimed;
    mapping(uint256 => uint256) public roundClaimed;

    constructor(HamsterDerby _derby, MockERC20 _usdc) {
        derby = _derby;
        usdc = _usdc;
        for (uint256 i = 0; i < 4; i++) {
            actors[i] = makeAddr(string(abi.encodePacked("actor", vm.toString(i))));
            usdc.mint(actors[i], 1e15);
            vm.prank(actors[i]);
            usdc.approve(address(derby), type(uint256).max);
        }
    }

    function create() external {
        if (derby.roundCount() < 6) derby.createRound();
    }

    function placeBet(uint256 actorSeed, uint256 roundSeed, uint256 hamster, uint256 amount) external {
        uint256 n = derby.roundCount();
        if (n == 0) return;
        uint256 id = roundSeed % n;
        HamsterDerby.Round memory r = derby.getRound(id);
        if (r.status != HamsterDerby.Status.Open || block.timestamp >= r.bettingEndsAt) return;
        amount = bound(amount, derby.MIN_BET(), 1e9);
        address a = actors[actorSeed % 4];
        vm.prank(a);
        derby.bet(id, hamster % 4, amount);
        ghostDeposited += amount;
    }

    function lock(uint256 roundSeed) external {
        uint256 n = derby.roundCount();
        if (n == 0) return;
        uint256 id = roundSeed % n;
        HamsterDerby.Round memory r = derby.getRound(id);
        if (r.status != HamsterDerby.Status.Open) return;
        if (block.timestamp < r.bettingEndsAt) vm.warp(r.bettingEndsAt);
        derby.lockRound(id);
    }

    function settle(uint256 roundSeed, uint256 hashSeed) external {
        uint256 n = derby.roundCount();
        if (n == 0) return;
        uint256 id = roundSeed % n;
        HamsterDerby.Round memory r = derby.getRound(id);
        if (r.status != HamsterDerby.Status.Locked) return;
        if (hashSeed % 5 == 0) {
            vm.roll(r.seedBlock + derby.SETTLE_WINDOW() + 1); // expire -> void
        } else {
            if (block.number <= r.seedBlock) vm.roll(r.seedBlock + 1);
            vm.setBlockhash(r.seedBlock, keccak256(abi.encode(hashSeed)));
        }
        derby.settleRound(id);
    }

    function claim(uint256 actorSeed, uint256 roundSeed) external {
        uint256 n = derby.roundCount();
        if (n == 0) return;
        uint256 id = roundSeed % n;
        address a = actors[actorSeed % 4];
        uint256 expected = derby.previewPayout(id, a);
        uint256 before = usdc.balanceOf(a);
        vm.prank(a);
        try derby.claim(id) {
            uint256 got = usdc.balanceOf(a) - before;
            require(got == expected, "claim != preview");
            ghostClaimed += got;
            roundClaimed[id] += got;
        } catch {}
    }
}

contract HamsterDerbyInvariantTest is Test {
    HamsterDerby internal derby;
    MockERC20 internal usdc;
    HamsterDerbyHandler internal handler;

    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        derby = new HamsterDerby(address(usdc));
        handler = new HamsterDerbyHandler(derby, usdc);
        targetContract(address(handler));
    }

    /// Conservation: contract holds exactly what was deposited minus what was claimed.
    function invariant_BalanceEqualsDepositsMinusClaims() public view {
        assertEq(usdc.balanceOf(address(derby)), handler.ghostDeposited() - handler.ghostClaimed());
    }

    /// Solvency: contract USDC balance always covers the sum of all unclaimed entitlements.
    function invariant_BalanceCoversUnclaimedEntitlements() public view {
        uint256 n = derby.roundCount();
        uint256 owed;
        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = 0; j < 4; j++) {
                owed += derby.previewPayout(i, handler.actors(j));
            }
        }
        assertGe(usdc.balanceOf(address(derby)), owed);
    }

    /// No round ever pays out more than its pool.
    function invariant_NoRoundOverpaid() public view {
        uint256 n = derby.roundCount();
        for (uint256 i = 0; i < n; i++) {
            assertLe(handler.roundClaimed(i), derby.getRound(i).totalPool);
        }
    }

    /// Pool accounting: totalPool == sum of hamster pools; pending balance covers unclaimed obligations.
    function invariant_PoolsSumToTotal() public view {
        uint256 n = derby.roundCount();
        uint256 sumTotals;
        for (uint256 i = 0; i < n; i++) {
            HamsterDerby.Round memory r = derby.getRound(i);
            assertEq(r.pools[0] + r.pools[1] + r.pools[2] + r.pools[3], r.totalPool);
            sumTotals += r.totalPool;
        }
        assertEq(sumTotals, handler.ghostDeposited());
    }
}
