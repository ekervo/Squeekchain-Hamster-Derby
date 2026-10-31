// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {HamsterDerbyTestBase} from "./HamsterDerby.Base.t.sol";
import {HamsterDerby} from "../HamsterDerby.sol";

contract HamsterDerbyCoreTest is HamsterDerbyTestBase {
    // ---------- constructor ----------

    function test_Constructor_SetsUsdc() public view {
        assertEq(address(derby.usdc()), address(usdc));
        assertEq(derby.nextRoundId(), 0);
        assertEq(derby.roundCount(), 0);
    }

    function test_Constructor_RevertsOnZeroAddress() public {
        vm.expectRevert(HamsterDerby.ZeroAddress.selector);
        new HamsterDerby(address(0));
    }

    // ---------- createRound ----------

    function test_CreateRound_InitialisesRound() public {
        uint256 start = block.timestamp;
        uint256 id = derby.createRound();
        assertEq(id, 0);
        assertEq(derby.roundCount(), 1);
        HamsterDerby.Round memory r = derby.getRound(0);
        assertEq(r.bettingEndsAt, start + 120);
        assertEq(uint8(r.status), uint8(HamsterDerby.Status.Open));
        assertEq(r.totalPool, 0);
        assertEq(r.seedBlock, 0);
    }

    function test_CreateRound_EmitsAndIncrementsIds() public {
        vm.expectEmit(true, false, false, true, address(derby));
        emit HamsterDerby.RoundCreated(0, uint64(block.timestamp + 120));
        derby.createRound();

        vm.warp(block.timestamp + 50);
        vm.expectEmit(true, false, false, true, address(derby));
        emit HamsterDerby.RoundCreated(1, uint64(block.timestamp + 120));
        uint256 id2 = derby.createRound();
        assertEq(id2, 1);
        assertEq(derby.roundCount(), 2);
    }

    function test_CreateRound_IsPermissionless() public {
        vm.prank(eve);
        assertEq(derby.createRound(), 0);
    }

    // ---------- bet ----------

    function test_Bet_HappyPath() public {
        uint256 id = _newRound();
        vm.expectEmit(true, true, true, true, address(derby));
        emit HamsterDerby.BetPlaced(id, alice, 2, 5e6);
        _bet(alice, id, 2, 5e6);
        _bet(alice, id, 2, 1e6);
        _bet(alice, id, 0, 1e6);

        HamsterDerby.Round memory r = derby.getRound(id);
        assertEq(r.totalPool, 7e6);
        assertEq(r.pools[2], 6e6);
        assertEq(r.pools[0], 1e6);
        assertEq(derby.stakes(id, alice, 2), 6e6);
        uint256[4] memory s = derby.getUserStakes(id, alice);
        assertEq(s[0], 1e6);
        assertEq(s[1], 0);
        assertEq(s[2], 6e6);
        assertEq(usdc.balanceOf(address(derby)), 7e6);
        assertEq(usdc.balanceOf(alice), FUND - 7e6);
    }

    function test_Bet_AtMinBetSucceeds() public {
        uint256 id = _newRound();
        _bet(alice, id, 0, MIN_BET);
        assertEq(derby.getRound(id).totalPool, MIN_BET);
    }

    function test_Bet_RevertsBelowMinBet() public {
        uint256 id = _newRound();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.BetTooSmall.selector, MIN_BET - 1));
        derby.bet(id, 0, MIN_BET - 1);
    }

    function test_Bet_RevertsOnInvalidHamster() public {
        uint256 id = _newRound();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.InvalidHamster.selector, 4));
        derby.bet(id, 4, 1e6);
    }

    function test_Bet_RevertsOnNonexistentRound() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.RoundNotFound.selector, 0));
        derby.bet(0, 0, 1e6);

        _newRound();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.RoundNotFound.selector, 1));
        derby.bet(1, 0, 1e6);
    }

    function test_Bet_RevertsWhenBettingClosedByTime() public {
        uint256 id = _newRound();
        uint64 endsAt = derby.getRound(id).bettingEndsAt;
        vm.warp(endsAt - 1);
        _bet(alice, id, 0, 1e6); // last valid second
        vm.warp(endsAt);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.BettingClosed.selector, id));
        derby.bet(id, 0, 1e6);
    }

    function test_Bet_RevertsWhenLocked() public {
        uint256 id = _newRound();
        _lock(id);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(HamsterDerby.InvalidStatus.selector, id, HamsterDerby.Status.Locked)
        );
        derby.bet(id, 0, 1e6);
    }

    function test_Bet_RevertsWhenSettledOrVoid() public {
        uint256 id = _newRound();
        _bet(alice, id, 1, 1e6);
        _lock(id);
        _settleWithHash(id, bytes32(0)); // zero hash -> void
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.InvalidStatus.selector, id, HamsterDerby.Status.Void));
        derby.bet(id, 1, 1e6);
    }

    function test_Bet_RevertsWithoutAllowance() public {
        uint256 id = _newRound();
        address stranger = makeAddr("stranger");
        usdc.mint(stranger, 1e6);
        vm.prank(stranger);
        vm.expectRevert();
        derby.bet(id, 0, 1e6);
        // accounting rolled back
        assertEq(derby.getRound(id).totalPool, 0);
    }

    // ---------- lockRound ----------

    function test_LockRound_RevertsTooEarly() public {
        uint256 id = _newRound();
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.BettingStillOpen.selector, id));
        derby.lockRound(id);
        vm.warp(derby.getRound(id).bettingEndsAt - 1);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.BettingStillOpen.selector, id));
        derby.lockRound(id);
    }

    function test_LockRound_SetsSeedBlockAndEmits() public {
        uint256 id = _newRound();
        vm.warp(derby.getRound(id).bettingEndsAt);
        vm.expectEmit(true, false, false, true, address(derby));
        emit HamsterDerby.RoundLocked(id, uint64(block.number + 2));
        derby.lockRound(id);
        HamsterDerby.Round memory r = derby.getRound(id);
        assertEq(r.seedBlock, block.number + 2);
        assertEq(uint8(r.status), uint8(HamsterDerby.Status.Locked));
    }

    function test_LockRound_RevertsTwice() public {
        uint256 id = _newRound();
        _lock(id);
        vm.expectRevert(
            abi.encodeWithSelector(HamsterDerby.InvalidStatus.selector, id, HamsterDerby.Status.Locked)
        );
        derby.lockRound(id);
    }

    function test_LockRound_RevertsOnNonexistentRound() public {
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.RoundNotFound.selector, 3));
        derby.lockRound(3);
    }

    function test_LockRound_IsPermissionless() public {
        uint256 id = _newRound();
        vm.warp(derby.getRound(id).bettingEndsAt);
        vm.prank(eve);
        derby.lockRound(id);
        assertEq(uint8(derby.getRound(id).status), uint8(HamsterDerby.Status.Locked));
    }

    // ---------- settleRound reverts ----------

    function test_SettleRound_RevertsBeforeSeedBlock() public {
        uint256 id = _newRound();
        _bet(alice, id, 0, 1e6);
        uint256 sb = _lock(id);
        // right after lock: block.number = sb - 2
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.SeedNotReady.selector, sb));
        derby.settleRound(id);
        vm.roll(sb - 1);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.SeedNotReady.selector, sb));
        derby.settleRound(id);
        vm.roll(sb); // block.number == seedBlock is still not ready
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.SeedNotReady.selector, sb));
        derby.settleRound(id);
    }

    function test_SettleRound_RevertsWhenOpen() public {
        uint256 id = _newRound();
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.InvalidStatus.selector, id, HamsterDerby.Status.Open));
        derby.settleRound(id);
    }

    function test_SettleRound_RevertsOnNonexistentRound() public {
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.RoundNotFound.selector, 0));
        derby.settleRound(0);
    }

    function test_SettleRound_RevertsTwice() public {
        uint256 id = _newRound();
        _bet(alice, id, 0, 1e6);
        _lock(id);
        _settleWithHash(id, _hashForWinner(id, 0));
        vm.expectRevert(
            abi.encodeWithSelector(HamsterDerby.InvalidStatus.selector, id, HamsterDerby.Status.Settled)
        );
        derby.settleRound(id);
    }

    // ---------- claim / views reverts ----------

    function test_Claim_RevertsWhenOpenOrLocked() public {
        uint256 id = _newRound();
        _bet(alice, id, 0, 1e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.InvalidStatus.selector, id, HamsterDerby.Status.Open));
        derby.claim(id);
        _lock(id);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(HamsterDerby.InvalidStatus.selector, id, HamsterDerby.Status.Locked)
        );
        derby.claim(id);
    }

    function test_Claim_RevertsOnNonexistentRound() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.RoundNotFound.selector, 9));
        derby.claim(9);
    }

    function test_Views_RevertOnNonexistentRound() public {
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.RoundNotFound.selector, 0));
        derby.getRound(0);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.RoundNotFound.selector, 0));
        derby.getUserStakes(0, alice);
    }

    function test_PreviewPayout_ZeroForUnknownOpenAndLocked() public {
        assertEq(derby.previewPayout(5, alice), 0);
        uint256 id = _newRound();
        _bet(alice, id, 0, 1e6);
        assertEq(derby.previewPayout(id, alice), 0);
        _lock(id);
        assertEq(derby.previewPayout(id, alice), 0);
    }
}
