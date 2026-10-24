import { BaseError, ContractFunctionRevertedError, formatEther } from "viem";

export interface RevertDetails {
  errorName?: string;
  args?: readonly unknown[];
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Traverses an error to extract the custom revert error name and arguments.
 */
export function extractRevert(err: unknown): RevertDetails | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  // Direct property check
  if (
    "data" in err &&
    (err as any).data &&
    typeof (err as any).data === "object" &&
    (err as any).data.errorName
  ) {
    return {
      errorName: (err as any).data.errorName,
      args: (err as any).data.args,
    };
  }
  if ("errorName" in err && typeof (err as any).errorName === "string") {
    return {
      errorName: (err as any).errorName,
      args: (err as any).args,
    };
  }

  // If it's a viem BaseError, use walk
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => {
      if (e instanceof ContractFunctionRevertedError) return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "data" in e &&
        Boolean((e as any).data?.errorName)
      )
        return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "errorName" in e &&
        Boolean((e as any).errorName)
      )
        return true;
      return false;
    });

    if (reverted) {
      const errorObj = reverted as any;
      if (errorObj.data?.errorName) {
        return {
          errorName: errorObj.data.errorName,
          args: errorObj.data.args,
        };
      }
      if (errorObj.errorName) {
        return {
          errorName: errorObj.errorName,
          args: errorObj.args,
        };
      }
    }
  }

  return undefined;
}

/**
 * Checks whether an error represents the user rejecting the prompt in their wallet.
 */
export function isUserRejection(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("User rejected") ||
    msg.includes("User denied") ||
    msg.includes("user rejected") ||
    msg.includes("ACTION_REJECTED") ||
    (typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 4001)
  );
}

/**
 * Translates an error into user-facing copy in Mosaic's gallery-label voice.
 */
export function describeError(err: unknown): string {
  if (isUserRejection(err)) {
    return "Cancelled.";
  }

  const details = extractRevert(err);
  if (details?.errorName) {
    switch (details.errorName) {
      case "WrongPayment": {
        const expected = details.args?.[0];
        if (expected !== undefined && expected !== null) {
          const formatted = formatEther(BigInt(expected.toString()));
          return `Someone got there first. The price is now ${formatted} BOT — look again.`;
        }
        return "Someone got there first. The price has changed — look again.";
      }
      case "AlreadyOwner":
        return "That cell is already yours.";
      case "NotOwner": {
        const owner = details.args?.[2];
        const ownerStr = typeof owner === "string" ? shortAddress(owner) : "the owner";
        return `Only ${ownerStr} can repaint that cell.`;
      }
      case "BadCell":
        return "That cell isn't on the wall.";
      case "BadBatch":
        return "Pick between 1 and 16 cells.";
      case "NothingToWithdraw":
        return "Nothing to withdraw yet.";
      case "TransferFailed":
        return "The transfer to your wallet failed. Try again.";
      case "ZeroAddress":
        return "Beneficiary address cannot be zero.";
    }
  }

  if (err instanceof Error) {
    const shortReason = err.message.slice(0, 120).replace(/\n/g, " ");
    return `Transaction reverted. ${shortReason}`;
  }

  return "Transaction reverted.";
}
