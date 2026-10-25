// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Mosaic} from "../src/Mosaic.sol";

contract RevertingReceiver {
  receive() external payable {
    revert("REJECTED");
  }

  function withdraw(address mosaic) external {
    Mosaic(mosaic).withdraw();
  }
}

contract ReentrantReceiver {
  Mosaic public mosaic;
  bytes public capturedRevert;

  constructor(address mosaicAddress) {
    mosaic = Mosaic(mosaicAddress);
  }

  function withdraw() external {
    mosaic.withdraw();
  }

  receive() external payable {
    (bool ok, bytes memory data) = address(mosaic).call(
      abi.encodeWithSelector(Mosaic.withdraw.selector)
    );
    if (!ok) {
      capturedRevert = data;
    }
  }
}


contract MosaicHandler is Test {
  Mosaic public mosaic;
  address public beneficiary;
  address[] public actors;

  constructor(Mosaic _mosaic, address _beneficiary) {
    mosaic = _mosaic;
    beneficiary = _beneficiary;
    for (uint160 i = 1; i <= 5; i++) {
      address actor = address(uint160(0x1000 + i));
      vm.deal(actor, 1000 ether);
      actors.push(actor);
    }
  }

  function claimRandom(uint8 actorIndex, uint16 cellId, uint24 color) external {
    address actor = actors[actorIndex % actors.length];
    uint16 id = cellId % 1024;
    uint256 price = mosaic.priceOf(id);

    // Skip if actor already owns it
    Mosaic.Cell memory c = mosaic.cellOf(id);
    if (c.owner == actor) return;

    vm.prank(actor);
    mosaic.claim{value: price}(id, color);
  }

  function withdrawRandom(uint8 actorIndex) external {
    address actor = actors[actorIndex % actors.length];
    if (mosaic.pending(actor) == 0) return;
    vm.prank(actor);
    mosaic.withdraw();
  }

  function withdrawBeneficiary() external {
    if (mosaic.pending(beneficiary) == 0) return;
    vm.prank(beneficiary);
    mosaic.withdraw();
  }

  function actorsList() external view returns (address[] memory) {
    return actors;
  }
}

contract MosaicTest is Test {
  Mosaic public mosaic;
  MosaicHandler public handler;

  uint256 public constant BASE_PRICE = 0.002 ether;
  uint256 public constant STEP = 0.002 ether;
  address public beneficiary = makeAddr("beneficiary");

  address public alice = makeAddr("alice");
  address public bob = makeAddr("bob");
  address public carol = makeAddr("carol");

  event CellClaimed(
    uint16 indexed id,
    address indexed buyer,
    address indexed seller,
    uint24 color,
    uint256 price,
    uint32 sales
  );
  event CellPainted(uint16 indexed id, address indexed owner, uint24 color);
  event Withdrawn(address indexed account, uint256 amount);

  function setUp() public {
    vm.warp(1_760_000_000);
    vm.deal(alice, 100 ether);
    vm.deal(bob, 100 ether);
    vm.deal(carol, 100 ether);

    mosaic = new Mosaic(BASE_PRICE, STEP, beneficiary);

    handler = new MosaicHandler(mosaic, beneficiary);
    targetContract(address(handler));
  }

  function test_FirstClaim_PaysBeneficiary_SetsOwnerColor() public {
    uint16 id = 42;
    uint24 color = 0xFF5733;

    vm.expectEmit(true, true, true, true);
    emit CellClaimed(id, alice, address(0), color, BASE_PRICE, 1);

    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE}(id, color);

    Mosaic.Cell memory c = mosaic.cellOf(id);
    assertEq(c.owner, alice);
    assertEq(c.color, color);
    assertEq(c.sales, 1);
    assertEq(mosaic.pending(beneficiary), BASE_PRICE);
    assertEq(mosaic.totalClaims(), 1);
  }

  function test_Resale_PaysPreviousOwner_PriceRises() public {
    uint16 id = 100;
    uint24 colorA = 0x112233;
    uint24 colorB = 0x445566;

    // First sale to Alice
    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE}(id, colorA);

    // Resale price = BASE_PRICE + 1 * STEP = 0.004 ether
    uint256 resalePrice = BASE_PRICE + STEP;
    assertEq(mosaic.priceOf(id), resalePrice);

    vm.expectEmit(true, true, true, true);
    emit CellClaimed(id, bob, alice, colorB, resalePrice, 2);

    vm.prank(bob);
    mosaic.claim{value: resalePrice}(id, colorB);

    Mosaic.Cell memory c = mosaic.cellOf(id);
    assertEq(c.owner, bob);
    assertEq(c.color, colorB);
    assertEq(c.sales, 2);
    assertEq(mosaic.pending(alice), resalePrice);
    assertEq(mosaic.priceOf(id), BASE_PRICE + 2 * STEP);
  }

  function test_PriceLadder_IsLinear_PerCell() public {
    uint16 id = 10;
    assertEq(mosaic.priceOf(id), BASE_PRICE);

    for (uint32 s = 1; s <= 6; s++) {
      address buyer = (s % 2 == 1) ? alice : bob;
      uint256 expectedPrice = BASE_PRICE + uint256(s - 1) * STEP;
      vm.prank(buyer);
      mosaic.claim{value: expectedPrice}(id, 0x123456);
      assertEq(mosaic.priceOf(id), BASE_PRICE + uint256(s) * STEP);
    }
  }

  function test_CannotClaimOwnCell() public {
    uint16 id = 5;
    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE}(id, 0x111111);

    uint256 nextPrice = mosaic.priceOf(id);
    vm.expectRevert(abi.encodeWithSelector(Mosaic.AlreadyOwner.selector, id));
    vm.prank(alice);
    mosaic.claim{value: nextPrice}(id, 0x222222);
  }

  function test_WrongPayment_BothDirections() public {
    uint16 id = 8;
    // Underpayment
    vm.expectRevert(abi.encodeWithSelector(Mosaic.WrongPayment.selector, BASE_PRICE, BASE_PRICE - 1));
    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE - 1}(id, 0x111111);

    // Overpayment
    vm.expectRevert(abi.encodeWithSelector(Mosaic.WrongPayment.selector, BASE_PRICE, BASE_PRICE + 1));
    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE + 1}(id, 0x111111);
  }

  function test_BadCell() public {
    vm.expectRevert(abi.encodeWithSelector(Mosaic.BadCell.selector, uint16(1024)));
    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE}(1024, 0x111111);

    vm.expectRevert(abi.encodeWithSelector(Mosaic.BadCell.selector, uint16(1024)));
    mosaic.priceOf(1024);
  }

  function test_Paint_OwnerOnly_Free() public {
    uint16 id = 77;
    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE}(id, 0x111111);

    uint24 newColor = 0xAABBCC;
    vm.expectEmit(true, true, false, true);
    emit CellPainted(id, alice, newColor);

    vm.prank(alice);
    mosaic.paint(id, newColor);

    assertEq(mosaic.cellOf(id).color, newColor);
  }

  function test_Paint_NotOwnerReverts_Args() public {
    uint16 id = 77;
    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE}(id, 0x111111);

    vm.expectRevert(abi.encodeWithSelector(Mosaic.NotOwner.selector, id, bob, alice));
    vm.prank(bob);
    mosaic.paint(id, 0x999999);
  }

  function test_Withdraw_PaysAndZeroes() public {
    uint16 id = 50;
    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE}(id, 0x111111);

    uint256 resalePrice = BASE_PRICE + STEP;
    vm.prank(bob);
    mosaic.claim{value: resalePrice}(id, 0x222222);

    assertEq(mosaic.pending(alice), resalePrice);

    uint256 balanceBefore = alice.balance;
    vm.expectEmit(true, false, false, true);
    emit Withdrawn(alice, resalePrice);

    vm.prank(alice);
    mosaic.withdraw();

    assertEq(mosaic.pending(alice), 0);
    assertEq(alice.balance, balanceBefore + resalePrice);
  }

  function test_Withdraw_NothingReverts() public {
    vm.expectRevert(abi.encodeWithSelector(Mosaic.NothingToWithdraw.selector));
    vm.prank(alice);
    mosaic.withdraw();
  }

  function test_Withdraw_RevertingReceiver_DoesNotBlockOthers() public {
    RevertingReceiver badGuy = new RevertingReceiver();
    uint16 id = 99;

    // BadGuy claims first
    vm.deal(address(badGuy), 10 ether);
    vm.prank(address(badGuy));
    mosaic.claim{value: BASE_PRICE}(id, 0x000000);

    // Alice claims cell from badGuy -> badGuy gets pending credit
    uint256 resalePrice = BASE_PRICE + STEP;
    vm.prank(alice);
    mosaic.claim{value: resalePrice}(id, 0xFFFFFF);
    assertEq(mosaic.pending(address(badGuy)), resalePrice);

    // BadGuy trying to withdraw fails because receive() reverts
    vm.expectRevert(abi.encodeWithSelector(Mosaic.TransferFailed.selector));
    badGuy.withdraw(address(mosaic));

    // Beneficiary can still withdraw their own funds
    uint256 benPending = mosaic.pending(beneficiary);
    assertGt(benPending, 0);
    uint256 benBalBefore = beneficiary.balance;
    vm.prank(beneficiary);
    mosaic.withdraw();
    assertEq(beneficiary.balance, benBalBefore + benPending);
  }

  function test_ReentrancyCustomError() public {
    ReentrantReceiver attacker = new ReentrantReceiver(address(mosaic));
    uint16 id = 99;
    vm.deal(address(attacker), 1 ether);
    vm.prank(address(attacker));
    mosaic.claim{value: BASE_PRICE}(id, 0x111111);

    // Alice claims cell from attacker -> attacker gets pending credit
    uint256 resalePrice = BASE_PRICE + STEP;
    vm.prank(alice);
    mosaic.claim{value: resalePrice}(id, 0xFFFFFF);
    assertEq(mosaic.pending(address(attacker)), resalePrice);

    // Attacker withdraws; receive() reenters withdraw() and gets Reentrancy custom error
    attacker.withdraw();
    assertEq(
      attacker.capturedRevert(),
      abi.encodeWithSelector(Mosaic.Reentrancy.selector)
    );
  }

  function test_ClaimMany_SumPrice_Atomic() public {
    uint16[] memory ids = new uint16[](3);
    ids[0] = 1;
    ids[1] = 2;
    ids[2] = 3;

    uint24[] memory colors = new uint24[](3);
    colors[0] = 0x111111;
    colors[1] = 0x222222;
    colors[2] = 0x333333;

    uint256 total = BASE_PRICE * 3;

    vm.prank(alice);
    mosaic.claimMany{value: total}(ids, colors);

    assertEq(mosaic.cellOf(1).owner, alice);
    assertEq(mosaic.cellOf(2).owner, alice);
    assertEq(mosaic.cellOf(3).owner, alice);
  }

  function test_ClaimMany_DuplicateIdReverts() public {
    uint16[] memory ids = new uint16[](2);
    ids[0] = 5;
    ids[1] = 5;

    uint24[] memory colors = new uint24[](2);
    colors[0] = 0x111111;
    colors[1] = 0x222222;

    uint256 total = BASE_PRICE + (BASE_PRICE + STEP);

    // The second occurrence reverts AlreadyOwner because Alice became owner on first
    vm.expectRevert(abi.encodeWithSelector(Mosaic.AlreadyOwner.selector, uint16(5)));
    vm.prank(alice);
    mosaic.claimMany{value: total}(ids, colors);
  }

  function test_ClaimMany_BadBatch_0_and_17() public {
    // Length 0
    uint16[] memory zeroIds = new uint16[](0);
    uint24[] memory zeroColors = new uint24[](0);
    vm.expectRevert(abi.encodeWithSelector(Mosaic.BadBatch.selector, 0));
    vm.prank(alice);
    mosaic.claimMany{value: 0}(zeroIds, zeroColors);

    // Length 17
    uint16[] memory ids17 = new uint16[](17);
    uint24[] memory colors17 = new uint24[](17);
    for (uint16 i = 0; i < 17; i++) {
      ids17[i] = i;
      colors17[i] = 0x111111;
    }
    vm.expectRevert(abi.encodeWithSelector(Mosaic.BadBatch.selector, 17));
    vm.prank(alice);
    mosaic.claimMany{value: BASE_PRICE * 17}(ids17, colors17);
  }

  function test_WallPagination_ClampsAndReturnsEmpty() public {
    // First claim a few cells
    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE}(0, 0x112233);
    vm.prank(bob);
    mosaic.claim{value: BASE_PRICE}(1023, 0x445566);

    // Page 1: 0 to 256
    (address[] memory o1, uint24[] memory c1, uint32[] memory s1) = mosaic.wall(0, 256);
    assertEq(o1.length, 256);
    assertEq(c1.length, 256);
    assertEq(s1.length, 256);
    assertEq(o1[0], alice);
    assertEq(c1[0], 0x112233);

    // Page 4: 768 to 1024
    (address[] memory o4, uint24[] memory c4, uint32[] memory s4) = mosaic.wall(768, 256);
    assertEq(o4.length, 256);
    assertEq(c4.length, 256);
    assertEq(s4.length, 256);
    assertEq(o4[255], bob); // cell 1023
    assertEq(c4[255], 0x445566);

    // Out of bounds start >= 1024 returns empty
    (address[] memory oEmpty, , ) = mosaic.wall(1024, 256);
    assertEq(oEmpty.length, 0);

    // Clamps to CELLS (e.g. start = 1000, count = 100 -> returns 24 cells)
    (address[] memory oClamp, , ) = mosaic.wall(1000, 100);
    assertEq(oClamp.length, 24);
  }

  function test_OwnedBy() public {
    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE}(10, 0x111111);
    vm.prank(alice);
    mosaic.claim{value: BASE_PRICE}(20, 0x222222);
    vm.prank(bob);
    mosaic.claim{value: BASE_PRICE}(30, 0x333333);

    uint16[] memory aliceCells = mosaic.ownedBy(alice, 0, 1024);
    assertEq(aliceCells.length, 2);
    assertEq(aliceCells[0], 10);
    assertEq(aliceCells[1], 20);

    uint16[] memory bobCells = mosaic.ownedBy(bob, 0, 1024);
    assertEq(bobCells.length, 1);
    assertEq(bobCells[0], 30);
  }

  function test_ConstructorRejectsZero() public {
    // Zero address beneficiary
    vm.expectRevert(Mosaic.ZeroAddress.selector);
    new Mosaic(BASE_PRICE, STEP, address(0));

    // Zero base price
    vm.expectRevert(Mosaic.ZeroAddress.selector);
    new Mosaic(0, STEP, beneficiary);
  }

  function testFuzz_TotalClaimsMatchesSales(uint8[8] memory pickedIds) public {
    uint32 expectedTotal = 0;
    for (uint256 i = 0; i < pickedIds.length; i++) {
      uint16 id = uint16(pickedIds[i]);
      address buyer = (i % 2 == 0) ? alice : bob;
      Mosaic.Cell memory c = mosaic.cellOf(id);
      if (c.owner == buyer) continue;

      uint256 price = mosaic.priceOf(id);
      vm.prank(buyer);
      mosaic.claim{value: price}(id, 0x123456);
      expectedTotal++;
    }
    assertEq(mosaic.totalClaims(), expectedTotal);
  }

  function invariant_BalanceEqualsPending() public view {
    address[] memory actors = handler.actorsList();
    uint256 sumPending = mosaic.pending(beneficiary);
    for (uint256 i = 0; i < actors.length; i++) {
      sumPending += mosaic.pending(actors[i]);
    }
    assertEq(address(mosaic).balance, sumPending);
  }

  function test_GasSnapshot() public {
    // First sale claim
    vm.prank(alice);
    uint256 g0 = gasleft();
    mosaic.claim{value: BASE_PRICE}(1, 0x111111);
    uint256 firstGas = g0 - gasleft();

    // Resale claim
    vm.prank(bob);
    uint256 g1 = gasleft();
    mosaic.claim{value: BASE_PRICE + STEP}(1, 0x222222);
    uint256 resaleGas = g1 - gasleft();

    assertLt(firstGas, 110_000, "First claim gas too high");
    assertLt(resaleGas, 75_000, "Resale claim gas too high");
  }
}
