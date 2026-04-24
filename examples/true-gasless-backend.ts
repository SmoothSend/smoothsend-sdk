import { Account, Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { TrueGaslessClient } from "../src/index";
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

async function main() {
  console.log("=== TrueGaslessClient Live Test ===");
  
  const apiKey = process.env.SMOOTHSEND_SECRET_KEY;
  if (!apiKey || !apiKey.startsWith('sk_nogas_')) {
    console.error("❌ ERROR: Please create a .env file with SMOOTHSEND_SECRET_KEY=sk_nogas_... to run this live test.");
    process.exit(1);
  }

  // 1. Setup Aptos client for testnet
  const aptosConfig = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(aptosConfig);

  // 2. Generate a fresh backend account
  const backendWallet = Account.generate();
  console.log(`Backend Wallet Address: ${backendWallet.accountAddress.toString()}`);

  // 3. Fund the backend wallet with Testnet APT so it exists on-chain and has something to transfer!
  console.log("Funding backend wallet via Aptos Faucet (so it exists on-chain)...");
  try {
    await aptos.fundAccount({
      accountAddress: backendWallet.accountAddress,
      amount: 100_000_000, // 1 APT
    });
    console.log("✅ Wallet successfully funded with 1 APT!");
  } catch (err) {
    console.error("⚠️ Warning: Faucet funding failed. Transaction might fail if account doesn't exist.", err);
  }

  // 4. Initialize the TrueGaslessClient
  const client = new TrueGaslessClient({
    apiKey: apiKey,
    network: 'testnet',
    debug: true
  });

  // 5. Define an APT transfer payload (sending 0.1 APT to a random address)
  // TODO: Replace RECIPIENT with a real destination address before running this example.
  const RECIPIENT = "0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2000000000000000000000000"; // ← placeholder
  
  const payload = {
    function: "0x1::aptos_account::transfer" as `${string}::${string}::${string}`,
    typeArguments: [],
    functionArguments: [
      RECIPIENT,     
      "10000000"     // 0.1 APT in octas
    ]
  };

  console.log(`\nExecuting Gasless Payload: ${payload.function} sending 0.1 APT`);

  try {
    const result = await client.execute({
      senderAccount: backendWallet,
      payload
    });

    console.log("\n✅ Success! Gasless transaction executed completely.");
    console.log(`Explorer Link: https://explorer.aptoslabs.com/txn/${result.txHash}?network=testnet`);
    console.log(`Gas Used: ${result.gasUsed}`);
  } catch (error: any) {
    console.error("\n❌ Execution Failed:", error.message);
  }
}

main().catch(console.error);
