import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Equle } from "../typechain-types";
import { Encryptable } from "@cofhe/sdk";
import { getDeployment } from "./utils";
import { equationToAllSame } from "../utils";
import { createCofheClientForNetwork } from "./cofhe-hardhat-client";

task("setgame-equle", "Set the current game on the deployed contract").setAction(
  async (_, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;

    const equleAddress = getDeployment(network.name, "Equle");
    if (!equleAddress) {
      console.error(`No Equle deployment found for network ${network.name}`);
      console.error(
        `Please deploy first using: npx hardhat deploy-equle --network ${network.name}`
      );
      return;
    }

    console.log(`Using Equle at ${equleAddress} on ${network.name}`);

    const [signer] = await ethers.getSigners();
    console.log(`Using account: ${signer.address}`);

    const client = await createCofheClientForNetwork(hre, signer);
    console.log("CoFHE client initialized");

    const Equle = await ethers.getContractFactory("Equle");
    const equle = Equle.attach(equleAddress) as unknown as Equle;

    const gameId = await equle.getCurrentGameId();
    const equation = "1+2*3";
    const result = 9;

    const equationBits = equationToAllSame(equation);

    const [encryptedEquation] = await client
      .encryptInputs([Encryptable.uint128(equationBits)])
      .execute();
    const [encryptedResult] = await client
      .encryptInputs([Encryptable.uint16(BigInt(result))])
      .execute();

    console.log(`Setting game ${gameId}: "${equation}" = ${result}`);
    const tx = await equle.setGame(
      gameId,
      encryptedEquation as any,
      encryptedResult as any
    );
    await tx.wait();
    console.log(`Transaction hash: ${tx.hash}`);
  }
);
