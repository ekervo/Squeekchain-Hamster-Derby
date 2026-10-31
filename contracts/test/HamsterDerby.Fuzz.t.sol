// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {HamsterDerbyTestBase} from "./HamsterDerby.Base.t.sol";
import {HamsterDerby} from "../HamsterDerby.sol";

contract HamsterDerbyFuzzTest is HamsterDerbyTestBase {
    function testFuzz_PayoutsNeverExceedPool(
        uint256 a0,
        uint256 a1,
        uint256 a2,
        uint256 a3,
        uint256 a4,
        bytes32 h
    ) public {
        vm.assume(h != bytes32(0));
        a0 = bound(a0, MIN_BET, 1e12);
        a1 = bound(a1, MIN_BET, 1e12);
        a2 = bound(a2, MIN_BET, 1e12);
        a3 = bound(a3, MIN_BET, 1e12);
        a4 = bound(a4, MIN_BET, 1e12);

        uint256 id = _newRound();
        _bet(alice, id, 0, a0);
        _bet(bob, id, 1, a1);
        _bet(carol, id, 2, a2);
        _bet(dave, id, 3, a3);
        _bet(eve, id, a4 % 4, a4); // a second staker on some hamster
        uint256 total = a0 + a1 + a2 + a3 + a4;
        assertEq(usdc.balanceOf(address(derby)), total);

        _lock(id);
        _settleWithHash(id, h);
        assertEq(uint8(derby.getRound(id).status), uint8(HamsterDerby.Status.Settled));

        address[5] memory users = [alice, bob, carol, dave, eve];
        uint256 sumPreview;
        uint256 winners;
        for (uint256 i = 0; i < 5; i++) {
            uint256 p = derby.previewPayout(id, users[i]);
            sumPreview += p;
            if (p > 0) winners++;
        }
        assertLe(sumPreview, total, "payouts exceed pool");

        uint256 sumClaimed;
        for (uint256 i = 0; i < 5; i++) {
            uint256 p = derby.previewPayout(id, users[i]);
            if (p == 0) continue;
            uint256 got = _claim(users[i], id);
            assertEq(got, p, "preview != claim");
            sumClaimed += got;
        }
        assertEq(sumClaimed, sumPreview);
        uint256 dust = usdc.balanceOf(address(derby));
        assertEq(dust, total - sumClaimed);
        assertLt(dust, winners, "dust must be < number of winning claimants");
    }

    function testFuzz_VoidRefundsExactly(uint256 a0, uint256 a1, uint256 a2) public {
        a0 = bound(a0, MIN_BET, 1e12);
        a1 = bound(a1, MIN_BET, 1e12);
        a2 = bound(a2, MIN_BET, 1e12);
        uint256 id = _newRound();
        _bet(alice, id, 0, a0);
        _bet(alice, id, 1, a1);
        _bet(bob, id, 2, a2);
        uint256 sb = _lock(id);
        vm.roll(sb + derby.SETTLE_WINDOW() + 1);
        derby.settleRound(id);
        assertEq(_claim(alice, id), a0 + a1);
        assertEq(_claim(bob, id), a2);
        assertEq(usdc.balanceOf(address(derby)), 0);
    }

    function testFuzz_WinnerPayoutFormula(uint256 w1, uint256 w2, uint256 loser, bytes32 h) public {
        vm.assume(h != bytes32(0));
        w1 = bound(w1, MIN_BET, 1e12);
        w2 = bound(w2, MIN_BET, 1e12);
        loser = bound(loser, MIN_BET, 1e12);
        uint256 id = _newRound();
        (uint8 win,) = _sim(h, id);
        uint256 other = (uint256(win) + 1) % 4;
        _bet(alice, id, win, w1);
        _bet(bob, id, win, w2);
        _bet(carol, id, other, loser);
        _lock(id);
        _settleWithHash(id, h);
        uint256 total = w1 + w2 + loser;
        assertEq(_claim(alice, id), w1 * total / (w1 + w2));
        assertEq(_claim(bob, id), w2 * total / (w1 + w2));
        vm.prank(carol);
        vm.expectRevert(HamsterDerby.NothingToClaim.selector);
        derby.claim(id);
    }
}
