import { describe, expect, it } from "vitest";
import { describeError, isUserRejection, shortAddress } from "../errors";

describe("shortAddress", () => {
  it("shortens valid addresses with ellipsis", () => {
    expect(shortAddress("0x1234567890123456789012345678901234567890")).toBe("0x1234…7890");
  });

  it("returns short inputs as is", () => {
    expect(shortAddress("0x123")).toBe("0x123");
  });
});

describe("isUserRejection", () => {
  it("recognizes wallet user rejection errors", () => {
    expect(isUserRejection(new Error("User rejected the request."))).toBe(true);
    expect(isUserRejection(new Error("User denied transaction signature."))).toBe(true);
    expect(isUserRejection({ code: 4001, message: "User rejected" })).toBe(true);
    expect(isUserRejection(new Error("Out of gas"))).toBe(false);
  });
});

describe("describeError", () => {
  it("handles user rejection gracefully", () => {
    expect(describeError(new Error("User rejected the request."))).toBe("Cancelled.");
  });

  it("handles WrongPayment custom error with formatted amount", () => {
    const error = {
      data: {
        errorName: "WrongPayment",
        args: [4_000_000_000_000_000n, 2_000_000_000_000_000n],
      },
    };
    expect(describeError(error)).toBe(
      "Someone got there first. The price is now 0.004 BOT — look again."
    );
  });

  it("handles AlreadyOwner custom error", () => {
    const error = {
      data: {
        errorName: "AlreadyOwner",
        args: [1],
      },
    };
    expect(describeError(error)).toBe("That cell is already yours.");
  });

  it("handles NotOwner custom error with formatted owner", () => {
    const error = {
      data: {
        errorName: "NotOwner",
        args: [1, "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"],
      },
    };
    expect(describeError(error)).toBe("Only 0xBBBB…BBBB can repaint that cell.");
  });

  it("handles BadCell custom error", () => {
    const error = { data: { errorName: "BadCell", args: [1024] } };
    expect(describeError(error)).toBe("That cell isn't on the wall.");
  });

  it("handles BadBatch custom error", () => {
    const error = { data: { errorName: "BadBatch", args: [17] } };
    expect(describeError(error)).toBe("Pick between 1 and 16 cells.");
  });

  it("handles NothingToWithdraw custom error", () => {
    const error = { data: { errorName: "NothingToWithdraw", args: [] } };
    expect(describeError(error)).toBe("Nothing to withdraw yet.");
  });

  it("handles TransferFailed custom error", () => {
    const error = { data: { errorName: "TransferFailed", args: [] } };
    expect(describeError(error)).toBe("The transfer to your wallet failed. Try again.");
  });

  it("handles ZeroAddress custom error", () => {
    const error = { data: { errorName: "ZeroAddress", args: [] } };
    expect(describeError(error)).toBe("Beneficiary address cannot be zero.");
  });

  it("handles Reentrancy custom error", () => {
    const error = { data: { errorName: "Reentrancy", args: [] } };
    expect(describeError(error)).toBe("Reentrant call detected.");
  });

  it("handles generic Error fallback", () => {
    expect(describeError(new Error("RPC timeout"))).toBe(
      "Transaction reverted. RPC timeout"
    );
  });

  it("handles unknown fallback", () => {
    expect(describeError(null)).toBe("Transaction reverted.");
  });
});
