// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Mosaic
/// @notice Shared 32x32 pixel wall where cells can be claimed, recoloured, and retaken.
/// @dev Every cell's price is a linear function of its sales count: price = BASE_PRICE + sales * STEP.
/// What this cannot do:
/// - Colour only: stores a uint24 hex color per cell and nothing else (no text, no images, no links).
/// - Ownership is not permanence: any buyer can take any cell at its posted price.
/// - It cannot give a cell back for free or refund a purchase.
/// - The wall is strictly finite: 1,024 cells (32x32).
/// - No owner or admin controls after deployment.
contract Mosaic {
  uint16 public constant WIDTH = 32;
  uint16 public constant CELLS = 1024;
  uint8 public constant MAX_BATCH = 16;

  uint256 public immutable BASE_PRICE;
  uint256 public immutable STEP;
  address public immutable BENEFICIARY;

  /// @dev Packed into one 27-byte slot: 20 bytes address + 3 bytes color + 4 bytes sales.
  struct Cell {
    address owner; // 0 = unclaimed
    uint24 color;  // 0xRRGGBB
    uint32 sales;  // times this cell has been claimed (0 = never)
  }

  Cell[1024] private _cells;
  mapping(address => uint256) public pending;
  uint32 public totalClaims;

  uint256 private _lock = 1;

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

  error BadCell(uint16 id);
  error AlreadyOwner(uint16 id);
  error WrongPayment(uint256 expected, uint256 sent);
  error NotOwner(uint16 id, address caller, address owner);
  error BadBatch(uint256 n);
  error NothingToWithdraw();
  error TransferFailed();
  error ZeroAddress();
  error Reentrancy();

  constructor(uint256 basePrice, uint256 step, address beneficiary) {
    if (beneficiary == address(0) || basePrice == 0) revert ZeroAddress();
    BASE_PRICE = basePrice;
    STEP = step;
    BENEFICIARY = beneficiary;
  }

  /// @notice Calculate the current claim price of a cell
  /// @param id Cell index (0 to 1023)
  function priceOf(uint16 id) public view returns (uint256) {
    if (id >= CELLS) revert BadCell(id);
    return BASE_PRICE + uint256(_cells[id].sales) * STEP;
  }

  /// @notice Claim an individual cell by paying its current price
  /// @param id Cell index (0 to 1023)
  /// @param color 24-bit RGB colour (0xRRGGBB)
  function claim(uint16 id, uint24 color) external payable {
    if (id >= CELLS) revert BadCell(id);
    if (_cells[id].owner == msg.sender) revert AlreadyOwner(id);

    uint256 expected = BASE_PRICE + uint256(_cells[id].sales) * STEP;
    if (msg.value != expected) revert WrongPayment(expected, msg.value);

    address prevOwner = _cells[id].owner;
    if (prevOwner != address(0)) {
      pending[prevOwner] += msg.value;
    } else {
      pending[BENEFICIARY] += msg.value;
    }

    _cells[id].owner = msg.sender;
    _cells[id].color = color;
    _cells[id].sales++;
    totalClaims++;

    emit CellClaimed(id, msg.sender, prevOwner, color, msg.value, _cells[id].sales);
  }

  /// @notice Batch claim multiple cells in a single atomic transaction
  /// @param ids Array of cell indices (1 to 16)
  /// @param colors Array of 24-bit RGB colours corresponding to ids
  function claimMany(uint16[] calldata ids, uint24[] calldata colors) external payable {
    uint256 n = ids.length;
    if (n == 0 || n > MAX_BATCH || colors.length != n) revert BadBatch(n);

    uint256 totalPaid = 0;
    for (uint256 i = 0; i < n; i++) {
      uint16 id = ids[i];
      uint24 color = colors[i];

      if (id >= CELLS) revert BadCell(id);
      if (_cells[id].owner == msg.sender) revert AlreadyOwner(id);

      uint256 cost = BASE_PRICE + uint256(_cells[id].sales) * STEP;
      totalPaid += cost;

      address prevOwner = _cells[id].owner;
      if (prevOwner != address(0)) {
        pending[prevOwner] += cost;
      } else {
        pending[BENEFICIARY] += cost;
      }

      _cells[id].owner = msg.sender;
      _cells[id].color = color;
      _cells[id].sales++;
      totalClaims++;

      emit CellClaimed(id, msg.sender, prevOwner, color, cost, _cells[id].sales);
    }

    if (msg.value != totalPaid) revert WrongPayment(totalPaid, msg.value);
  }

  /// @notice Change the colour of an owned cell for free
  /// @param id Cell index (0 to 1023)
  /// @param color New 24-bit RGB colour
  function paint(uint16 id, uint24 color) external {
    if (id >= CELLS) revert BadCell(id);
    address currentOwner = _cells[id].owner;
    if (currentOwner != msg.sender) revert NotOwner(id, msg.sender, currentOwner);

    _cells[id].color = color;
    emit CellPainted(id, msg.sender, color);
  }

  /// @notice Withdraw credited proceeds from cell sales
  function withdraw() external {
    if (_lock != 1) revert Reentrancy();
    uint256 amount = pending[msg.sender];
    if (amount == 0) revert NothingToWithdraw();

    pending[msg.sender] = 0;

    _lock = 2;
    (bool ok, ) = msg.sender.call{value: amount}("");
    _lock = 1;

    if (!ok) revert TransferFailed();
    emit Withdrawn(msg.sender, amount);
  }

  /// @notice Read full record of a cell
  /// @param id Cell index (0 to 1023)
  function cellOf(uint16 id) external view returns (Cell memory) {
    if (id >= CELLS) revert BadCell(id);
    return _cells[id];
  }

  /// @notice Paginated view of the wall cells
  /// @param start Starting cell index
  /// @param count Number of cells to fetch
  function wall(
    uint16 start,
    uint16 count
  )
    external
    view
    returns (address[] memory owners, uint24[] memory colors, uint32[] memory sales)
  {
    if (start >= CELLS) {
      return (new address[](0), new uint24[](0), new uint32[](0));
    }
    uint16 end = start + count;
    if (end > CELLS) end = CELLS;
    uint16 len = end - start;

    owners = new address[](len);
    colors = new uint24[](len);
    sales = new uint32[](len);

    for (uint16 i = 0; i < len; i++) {
      Cell storage c = _cells[start + i];
      owners[i] = c.owner;
      colors[i] = c.color;
      sales[i] = c.sales;
    }
  }

  /// @notice Find cell indices owned by a specific address within a range
  /// @param who Account to search
  /// @param start Starting cell index
  /// @param count Number of cells to scan
  function ownedBy(
    address who,
    uint16 start,
    uint16 count
  ) external view returns (uint16[] memory ids) {
    if (start >= CELLS || count == 0) {
      return new uint16[](0);
    }
    uint16 end = start + count;
    if (end > CELLS) end = CELLS;

    uint16 matchCount = 0;
    for (uint16 i = start; i < end; i++) {
      if (_cells[i].owner == who) matchCount++;
    }

    ids = new uint16[](matchCount);
    uint16 idx = 0;
    for (uint16 i = start; i < end; i++) {
      if (_cells[i].owner == who) ids[idx++] = i;
    }
  }
}
