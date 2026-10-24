/**
 * Mosaic contract ABI.
 * Hand-written and `as const` for strict viem / wagmi typing.
 */
export const mosaicAbi = [
  // --- Functions ---
  {
    type: "function",
    name: "claim",
    stateMutability: "payable",
    inputs: [
      { name: "id", type: "uint16" },
      { name: "color", type: "uint24" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimMany",
    stateMutability: "payable",
    inputs: [
      { name: "ids", type: "uint16[]" },
      { name: "colors", type: "uint24[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "paint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint16" },
      { name: "color", type: "uint24" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "priceOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint16" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "cellOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint16" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "color", type: "uint24" },
          { name: "sales", type: "uint32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "wall",
    stateMutability: "view",
    inputs: [
      { name: "start", type: "uint16" },
      { name: "count", type: "uint16" },
    ],
    outputs: [
      { name: "owners", type: "address[]" },
      { name: "colors", type: "uint24[]" },
      { name: "sales", type: "uint32[]" },
    ],
  },
  {
    type: "function",
    name: "ownedBy",
    stateMutability: "view",
    inputs: [
      { name: "who", type: "address" },
      { name: "start", type: "uint16" },
      { name: "count", type: "uint16" },
    ],
    outputs: [{ name: "", type: "uint16[]" }],
  },
  {
    type: "function",
    name: "pending",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalClaims",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
  },
  {
    type: "function",
    name: "BASE_PRICE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "STEP",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "BENEFICIARY",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "WIDTH",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "CELLS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "MAX_BATCH",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },

  // --- Events ---
  {
    type: "event",
    name: "CellClaimed",
    inputs: [
      { name: "id", type: "uint16", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "color", type: "uint24", indexed: false },
      { name: "price", type: "uint256", indexed: false },
      { name: "sales", type: "uint32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CellPainted",
    inputs: [
      { name: "id", type: "uint16", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "color", type: "uint24", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },

  // --- Errors ---
  {
    type: "error",
    name: "BadCell",
    inputs: [{ name: "id", type: "uint16" }],
  },
  {
    type: "error",
    name: "AlreadyOwner",
    inputs: [{ name: "id", type: "uint16" }],
  },
  {
    type: "error",
    name: "WrongPayment",
    inputs: [
      { name: "expected", type: "uint256" },
      { name: "sent", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "NotOwner",
    inputs: [
      { name: "id", type: "uint16" },
      { name: "caller", type: "address" },
      { name: "owner", type: "address" },
    ],
  },
  {
    type: "error",
    name: "BadBatch",
    inputs: [{ name: "n", type: "uint256" }],
  },
  {
    type: "error",
    name: "NothingToWithdraw",
    inputs: [],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
] as const;

export const contractAbi = mosaicAbi;
