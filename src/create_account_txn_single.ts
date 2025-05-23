import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

const targetAddress = new PublicKey(
  "Ac86N3YbGfhefTKz92h6ESpw6PnqnkUkZBFXetrJ1JDN"
);

async function findCreateAccountTransaction(address: PublicKey) {
  const signatures = await connection.getSignaturesForAddress(address, {
    limit: 100,
  });

  for (const signatureInfo of signatures) {
    const tx = await connection.getParsedTransaction(signatureInfo.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) continue;
    for (const ix of tx.transaction.message.instructions) {
      if (!("parsed" in ix)) {
        const isFromExpectedProgram =
          ix.programId.toBase58() ===
          "FJ8myMh9dRcgc2n8xBrWTbCrFYAbHQZCPtMzhhmvNo4M";
        const involvedAccounts = ix.accounts.map((acc) => acc.toBase58());

        if (
          isFromExpectedProgram &&
          involvedAccounts.includes(targetAddress.toBase58())
        ) {
          console.log("✅ Found transaction hash:", signatureInfo.signature);
          return signatureInfo.signature;
        }
      }
    }

    console.log("❌ No createAccount txn found for address.");
    return null;
  }
}

findCreateAccountTransaction(targetAddress).catch(console.error);
