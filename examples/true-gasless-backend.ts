import { Account } from "@aptos-labs/ts-sdk";
import { TrueGaslessClient } from "../src/index";

async function main() {
  console.log("=== TrueGaslessClient Live Test ===");
  
  // 1. Generate a random backend account (in prod, load from env process.env.PRIVATE_KEY)
  const backendWallet = Account.generate();
  console.log(`Backend Wallet Address: ${backendWallet.accountAddress.toString()}`);

  // 2. Initialize the TrueGaslessClient
  // We use testnet and a dummy secret key for the scope of this dry-run
  const client = new TrueGaslessClient({
    apiKey: process.env.SMOOTHSEND_SECRET_KEY || 'sk_nogas_demo_key_for_testing',
    network: 'testnet',
    debug: true // Enabe debug logs to see the flow
  });

  // 3. Define an arbitrary Aptos transaction payload
  // Here we simulate a generic transfer or function call
  const payload = {
    function: "0x1::aptos_account::transfer",
    functionArguments: ["0x1234567890123456789012345678901234567890123456789012345678901234", "100"],
  };

  console.log("\nExecuting Gasless Payload:", payload.function);

  try {
    // 4. Execute the payload
    // Note: This will actually attempt to hit proxy.smoothsend.xyz 
    // It will likely fail at the relayer level because 'sk_nogas_demo_key_for_testing' is an invalid API key,
    // but it will successfully demonstrate the local Client build/sign/serialization mechanics!
    const result = await client.execute({
      senderAccount: backendWallet,
      payload
    });

    console.log("\nSuccess!", result);
  } catch (error: any) {
    console.log("\nExpected Relayer Output/Error:", error.message);
    if (!process.env.SMOOTHSEND_SECRET_KEY) {
      console.log("(Failed gracefully locally since we used a mock API Key!)");
    }
  }
}

main().catch(console.error);
