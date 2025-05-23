import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import fs from "fs";

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Read JSON file
const rawData = fs.readFileSync(
  "/Users/macbookpro/solana-attestation/attestations_dump.json",
  "utf-8"
);
const entries: { pubkey: string; type: string }[] = JSON.parse(rawData);

async function findCreateAccountTransaction(
  address: PublicKey
): Promise<string | null> {
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
          involvedAccounts.includes(address.toBase58())
        ) {
          return signatureInfo.signature;
        }
      }
    }
  }

  return null;
}

async function main() {
  const results: { pubkey: string; type: string; txhash: string | null }[] = [];

  for (const { pubkey, type } of entries) {
    const pk = new PublicKey(pubkey);
    console.log(`🔍 Searching for ${pubkey} (${type})...`);
    const txhash = await findCreateAccountTransaction(pk);
    console.log(`📦 Result for ${pubkey}: ${txhash}`);
    results.push({ pubkey, type, txhash });
  }

  // Write to output JSON
  fs.writeFileSync(
    "create_account_txns.json",
    JSON.stringify(results, null, 2),
    "utf-8"
  );
  console.log("✅ Saved to create_account_txns.json");
}

main().catch(console.error);
