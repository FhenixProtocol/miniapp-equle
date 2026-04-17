import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { CofheClient } from "@cofhe/sdk";
import { getChainById } from "@cofhe/sdk/chains";
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/node";

// `hre.cofhe.createConfig` hard-codes `environment: 'hardhat'` AND impersonates
// a mock zkv address — so it can only run against the in-memory Hardhat network.
// For live testnets (base-sepolia / arb-sepolia / sepolia) we need the plain SDK
// config path, but we still reuse `hre.cofhe.connectWithHardhatSigner` because
// it already knows how to wrap an ethers signer into viem public/wallet clients.
export async function createCofheClientForNetwork(
  hre: HardhatRuntimeEnvironment,
  signer?: HardhatEthersSigner
): Promise<CofheClient> {
  const resolvedSigner = signer ?? (await hre.ethers.getSigners())[0];

  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  const cofheChain = getChainById(chainId);
  if (!cofheChain) {
    throw new Error(
      `No @cofhe/sdk chain config for chainId ${chainId} (network "${hre.network.name}")`
    );
  }

  const isHardhatEnv =
    hre.network.name === "hardhat" ||
    hre.network.name === "localhost" ||
    hre.network.name === "localcofhe";

  let client: CofheClient;
  if (isHardhatEnv) {
    // Local: let the plugin inject the impersonated zkv wallet client.
    const config = await hre.cofhe.createConfig({
      supportedChains: [cofheChain],
    });
    client = hre.cofhe.createClient(config);
  } else {
    // Live network: plain SDK config, no impersonation required.
    const config = createCofheConfig({
      environment: "node",
      supportedChains: [cofheChain],
    });
    client = createCofheClient(config);
  }

  await hre.cofhe.connectWithHardhatSigner(client, resolvedSigner);
  return client;
}
