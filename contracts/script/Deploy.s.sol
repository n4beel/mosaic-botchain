// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {Mosaic} from "../src/Mosaic.sol";

/// @notice Deploys Mosaic and prints the two env lines the frontend needs.
contract Deploy is Script {
  uint256 public constant BASE_PRICE = 0.002 ether;
  uint256 public constant STEP = 0.002 ether;

  function run() external {
    uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
    address beneficiary = vm.envAddress("MOSAIC_BENEFICIARY");

    console2.log("BASE_PRICE:     ", BASE_PRICE);
    console2.log("STEP:           ", STEP);
    console2.log("BENEFICIARY:    ", beneficiary);

    vm.startBroadcast(deployerKey);
    Mosaic deployed = new Mosaic(BASE_PRICE, STEP, beneficiary);
    vm.stopBroadcast();

    address deployedAddress = address(deployed);

    console2.log("chain id        ", block.chainid);
    console2.log("contract        ", deployedAddress);
    console2.log("");
    console2.log("Add to .env.local:");
    console2.log(
      string.concat(
        "NEXT_PUBLIC_CONTRACT_", vm.toString(block.chainid), "=", vm.toString(deployedAddress)
      )
    );
    uint256 startBlock = block.number > 1 ? block.number - 1 : 1;
    console2.log(
      string.concat(
        "NEXT_PUBLIC_DEPLOY_BLOCK_", vm.toString(block.chainid), "=", vm.toString(startBlock)
      )
    );
  }
}
