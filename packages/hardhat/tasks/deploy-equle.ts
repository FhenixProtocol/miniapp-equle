import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { saveDeployment } from "./utils";

task(
  "deploy-equle",
  "Deploy the Equle contract to the selected network"
).setAction(async (_, hre: HardhatRuntimeEnvironment) => {
  const { ethers, network } = hre;

  console.log(`Deploying Equle to ${network.name}...`);

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  const Equle = await ethers.getContractFactory("Equle");
  const equle = await Equle.deploy();
  await equle.waitForDeployment();

  const equleAddress = await equle.getAddress();
  const nftAddress = await equle.equleNFT();

  console.log(`Equle deployed to:    ${equleAddress}`);
  console.log(`EquleNFT deployed to: ${nftAddress}`);

  saveDeployment(network.name, "Equle", equleAddress);
  saveDeployment(network.name, "EquleNFT", nftAddress);

  return equleAddress;
});
