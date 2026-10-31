// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {HamsterDerbyTestBase} from "./HamsterDerby.Base.t.sol";
import {HamsterDerby} from "../HamsterDerby.sol";

contract HamsterDerbySettleTest is HamsterDerbyTestBase {
    function _status(uint256 id) internal view returns (HamsterDerby.Status) {
        return derby.getRound(id).status;
    }

    // ---------- Settled: payouts ----------

    function test_Settle_NormalRoundPayoutsAndEvent() public {
        uint256 id = _newRound();
        _bet(alice, id, 2, 200e6);
        _bet(bob, id, 2, 100e6);
        _bet(carol, id, 0, 300e6);
        _bet(dave, id, 1, 100e6);
        _bet(alice, id, 3, 50e6); // alice also backs a loser
        assertEq(derby.getRound(id).totalPool, 750e6);

        _lock(id);
        bytes32 h = _hashForWinner(id, 2);
        (uint8 w, uint16[4] memory d) = _sim(h, id);
        assertEq(w, 2);

        uint256 sb = derby.getRound(id).seedBlock;
        vm.roll(sb + 1);
        vm.setBlockhash(sb, h);
        vm.expectEmit(true, true, false, true, address(derby));
        emit HamsterDerby.RoundSettled(id, 2, d);
        derby.settleRound(id);

        HamsterDerby.Round memory r = derby.getRound(id);
        assertEq(uint8(r.status), uint8(HamsterDerby.Status.Settled));
        assertEq(r.winner, 2);
        for (uint256 i = 0; i < 4; i++) {
            assertEq(r.distances[i], d[i], "distance replica mismatch");
            assertLt(r.distances[i], 1000);
        }

        // payout = stake * totalPool / winnerPool
        assertEq(derby.previewPayout(id, alice), 500e6);
        assertEq(derby.previewPayout(id, bob), 250e6);
        assertEq(derby.previewPayout(id, carol), 0);

        vm.expectEmit(true, true, false, true, address(derby));
        emit HamsterDerby.Claimed(id, alice, 500e6);
        assertEq(_claim(alice, id), 500e6);
        assertEq(_claim(bob, id), 250e6);
        assertTrue(derby.claimed(id, alice));
        assertEq(usdc.balanceOf(address(derby)), 0);
    }

    function test_Settle_LosersGetNothingToClaim() public {
        uint256 id = _newRound();
        _bet(alice, id, 2, 100e6);
        _bet(carol, id, 0, 300e6);
        _bet(dave, id, 1, 100e6);
        _lock(id);
        _settleWithHash(id, _hashForWinner(id, 2));

        vm.prank(carol);
        vm.expectRevert(HamsterDerby.NothingToClaim.selector);
        derby.claim(id);
        vm.prank(dave);
        vm.expectRevert(HamsterDerby.NothingToClaim.selector);
        derby.claim(id);
        vm.prank(eve); // never played
        vm.expectRevert(HamsterDerby.NothingToClaim.selector);
        derby.claim(id);
        assertFalse(derby.claimed(id, carol));
        assertEq(derby.previewPayout(id, carol), 0);
    }

    function test_Settle_DoubleClaimReverts() public {
        uint256 id = _newRound();
        _bet(alice, id, 3, 100e6);
        _bet(bob, id, 3, 100e6);
        _bet(carol, id, 0, 200e6);
        _lock(id);
        _settleWithHash(id, _hashForWinner(id, 3));
        _claim(alice, id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.AlreadyClaimed.selector, id, alice));
        derby.claim(id);
        assertEq(derby.previewPayout(id, alice), 0);
        // bob still unaffected
        assertEq(_claim(bob, id), 200e6);
    }

    function test_Settle_PreviewMatchesClaim_AndOnlyDustRemains() public {
        uint256 id = _newRound();
        // three winners (hamster 1) and awkward numbers to force rounding
        _bet(alice, id, 1, 100_000);
        _bet(bob, id, 1, 100_000);
        _bet(carol, id, 1, 100_000);
        _bet(dave, id, 0, 100_001);
        _lock(id);
        _settleWithHash(id, _hashForWinner(id, 1));

        uint256 total = 400_001;
        uint256 winnerPool = 300_000;
        uint256 expected = (100_000 * total) / winnerPool; // 133333
        address[3] memory winners = [alice, bob, carol];
        uint256 paid;
        for (uint256 i = 0; i < 3; i++) {
            uint256 preview = derby.previewPayout(id, winners[i]);
            uint256 got = _claim(winners[i], id);
            assertEq(preview, got, "preview != claim");
            assertEq(got, expected);
            paid += got;
        }
        assertLe(paid, total);
        uint256 dust = usdc.balanceOf(address(derby));
        assertEq(dust, total - paid);
        assertLt(dust, 3, "dust must be < number of winners");
    }

    function test_Settle_SingleWinnerTakesWholePool() public {
        uint256 id = _newRound();
        _bet(alice, id, 0, 1e6);
        _bet(bob, id, 1, 7e6);
        _bet(carol, id, 2, 3e6);
        _lock(id);
        _settleWithHash(id, _hashForWinner(id, 1));
        assertEq(_claim(bob, id), 11e6);
        assertEq(usdc.balanceOf(address(derby)), 0);
    }

    // ---------- tie-break ----------

    function test_Settle_TieGoesToLowestId() public {
        uint256 id = _newRound();
        (bytes32 h, uint8 lowest, uint8 other) = _hashForTie(id);
        // everyone is backed so the round settles, not voids
        _bet(alice, id, 0, 1e6);
        _bet(bob, id, 1, 1e6);
        _bet(carol, id, 2, 1e6);
        _bet(dave, id, 3, 1e6);
        _lock(id);
        _settleWithHash(id, h);

        HamsterDerby.Round memory r = derby.getRound(id);
        assertEq(uint8(r.status), uint8(HamsterDerby.Status.Settled));
        assertEq(r.distances[lowest], r.distances[other], "not a tie");
        assertLt(lowest, other);
        assertEq(r.winner, lowest, "tie must resolve to lowest id");
        assertEq(derby.previewPayout(id, alice) + derby.previewPayout(id, bob), 4e6);
        assertEq(derby.previewPayout(id, address(0)), 0);
    }

    function test_Settle_TieWithOnlyHigherTiedIdBackedVoids() public {
        uint256 id = _newRound();
        (bytes32 h, uint8 lowest, uint8 other) = _hashForTie(id);
        // bet only on the higher tied id: lowest id wins the tie, nobody backed it -> Void
        _bet(alice, id, other, 2e6);
        _bet(bob, id, other, 1e6);
        _lock(id);
        _settleWithHash(id, h);
        assertEq(derby.getRound(id).winner, lowest);
        assertEq(uint8(_status(id)), uint8(HamsterDerby.Status.Void));
        assertEq(_claim(alice, id), 2e6);
        assertEq(_claim(bob, id), 1e6);
    }

    function testFuzz_Settle_WinnerIsMaxDistanceLowestId(bytes32 h) public {
        vm.assume(h != bytes32(0));
        uint256 id = _newRound();
        _bet(alice, id, 0, 1e6);
        _bet(alice, id, 1, 1e6);
        _bet(alice, id, 2, 1e6);
        _bet(alice, id, 3, 1e6);
        _lock(id);
        _settleWithHash(id, h);

        HamsterDerby.Round memory r = derby.getRound(id);
        assertEq(uint8(r.status), uint8(HamsterDerby.Status.Settled));
        for (uint256 i = 0; i < 4; i++) {
            assertLt(r.distances[i], 1000);
            if (i < r.winner) assertLt(r.distances[i], r.distances[r.winner], "earlier id must be strictly slower");
            else assertLe(r.distances[i], r.distances[r.winner], "winner must hold the max");
        }
        (uint8 w,) = _sim(h, id);
        assertEq(r.winner, w);
    }

    function test_Settle_SameHashDifferentRoundIdIsIndependentlySeeded() public {
        uint256 a = _newRound();
        uint256 b = _newRound();
        _bet(alice, a, 0, 1e6);
        _bet(alice, b, 0, 1e6);
        _lock(a);
        _lock(b);
        bytes32 h = keccak256("same");
        uint256 sb = derby.getRound(b).seedBlock;
        vm.roll(sb + 1);
        vm.setBlockhash(derby.getRound(a).seedBlock, h);
        vm.setBlockhash(sb, h);
        derby.settleRound(a);
        derby.settleRound(b);
        (, uint16[4] memory da) = _sim(h, a);
        (, uint16[4] memory db) = _sim(h, b);
        for (uint256 i = 0; i < 4; i++) {
            assertEq(derby.getRound(a).distances[i], da[i]);
            assertEq(derby.getRound(b).distances[i], db[i]);
        }
        assertTrue(da[0] != db[0] || da[1] != db[1] || da[2] != db[2] || da[3] != db[3]);
    }

    // ---------- Void ----------

    function test_Void_WinnerNotBackedRefundsEverything() public {
        uint256 id = _newRound();
        _bet(alice, id, 0, 10e6);
        _bet(alice, id, 1, 5e6); // multi-hamster stakes are all refunded
        _bet(bob, id, 1, 7e6);
        _bet(carol, id, 2, 3e6);
        _lock(id);
        bytes32 h = _hashForWinner(id, 3); // nobody backed hamster 3

        uint256 sb = derby.getRound(id).seedBlock;
        vm.roll(sb + 1);
        vm.setBlockhash(sb, h);
        vm.expectEmit(true, false, false, true, address(derby));
        emit HamsterDerby.RoundVoided(id);
        derby.settleRound(id);

        assertEq(uint8(_status(id)), uint8(HamsterDerby.Status.Void));
        assertEq(derby.previewPayout(id, alice), 15e6);
        assertEq(_claim(alice, id), 15e6);
        assertEq(_claim(bob, id), 7e6);
        assertEq(_claim(carol, id), 3e6);
        assertEq(usdc.balanceOf(address(derby)), 0, "void refunds must be exact");
        assertEq(usdc.balanceOf(alice), FUND);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.AlreadyClaimed.selector, id, alice));
        derby.claim(id);
        vm.prank(dave);
        vm.expectRevert(HamsterDerby.NothingToClaim.selector);
        derby.claim(id);
    }

    function test_Void_SettleAfterWindowVoidsRegardlessOfHash() public {
        uint256 id = _newRound();
        _bet(alice, id, 0, 4e6);
        _bet(bob, id, 1, 6e6);
        uint256 sb = _lock(id);
        vm.roll(sb + derby.SETTLE_WINDOW() + 1);
        vm.expectEmit(true, false, false, true, address(derby));
        emit HamsterDerby.RoundVoided(id);
        derby.settleRound(id);
        assertEq(uint8(_status(id)), uint8(HamsterDerby.Status.Void));
        assertEq(_claim(alice, id), 4e6);
        assertEq(_claim(bob, id), 6e6);
        assertEq(usdc.balanceOf(address(derby)), 0);
    }

    function test_Settle_AtLastBlockOfWindowStillSettles() public {
        uint256 id = _newRound();
        _bet(alice, id, 1, 4e6);
        _bet(bob, id, 0, 6e6);
        uint256 sb = _lock(id);
        bytes32 h = _hashForWinner(id, 1);
        vm.roll(sb + derby.SETTLE_WINDOW());
        vm.setBlockhash(sb, h);
        derby.settleRound(id);
        assertEq(uint8(_status(id)), uint8(HamsterDerby.Status.Settled));
        assertEq(_claim(alice, id), 10e6);
    }

    function test_Void_ZeroBets() public {
        uint256 id = _newRound();
        _lock(id);
        _settleWithHash(id, keccak256("any"));
        assertEq(uint8(_status(id)), uint8(HamsterDerby.Status.Void));
        vm.prank(alice);
        vm.expectRevert(HamsterDerby.NothingToClaim.selector);
        derby.claim(id);
        assertEq(derby.previewPayout(id, alice), 0);
    }

    function test_Void_ZeroBlockhash() public {
        uint256 id = _newRound();
        _bet(alice, id, 0, 2e6);
        _bet(bob, id, 1, 2e6);
        _lock(id);
        _settleWithHash(id, bytes32(0));
        assertEq(uint8(_status(id)), uint8(HamsterDerby.Status.Void));
        assertEq(_claim(alice, id), 2e6);
        assertEq(_claim(bob, id), 2e6);
    }

    function test_Claim_AfterSettleRevertsForOtherRoundOpen() public {
        // claiming a still-Open round is rejected even while another round is settled
        uint256 a = _newRound();
        _bet(alice, a, 0, 1e6);
        _lock(a);
        _settleWithHash(a, _hashForWinner(a, 0));
        uint256 b = _newRound();
        _bet(alice, b, 0, 1e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HamsterDerby.InvalidStatus.selector, b, HamsterDerby.Status.Open));
        derby.claim(b);
        assertEq(_claim(alice, a), 1e6);
    }
}
