import {
  Connection,
  PublicKey,
  clusterApiUrl,
  PublicKeyInitData,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { writeFileSync } from "fs";

// discriminators
enum Tag {
  Credential = 0,
  Schema = 1,
  Attestation = 2,
}

// decode helpers
function readPubkey(buf: Buffer, off: number): [string, number] {
  const slice = buf.slice(off, off + 32);
  return [new PublicKey(slice as PublicKeyInitData).toBase58(), off + 32];
}

function readString(buf: Buffer, off: number): [string, number] {
  const len = buf.readUInt32LE(off);
  off += 4;
  const str = buf.slice(off, off + len).toString("utf8");
  return [str, off + len];
}

function toBuffer(data: any): Buffer {
  if (!data) throw new Error("account.data is undefined");
  if (Array.isArray(data) && typeof data[0] === "string") {
    const [b64, enc] = data as [string, string];
    return Buffer.from(b64, enc as BufferEncoding);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data as Uint8Array);
  }
  throw new Error("Unsupported account.data format");
}

// manual decoders
function decodeAttestation(buf: Buffer) {
  let off = 1; // skip the 1-byte enum tag

  const [nonce, off1] = readPubkey(buf, off);
  off = off1;
  const [credential, off2] = readPubkey(buf, off);
  off = off2;
  const [schema, off3] = readPubkey(buf, off);
  off = off3;

  // ——— FIXED slice of `data` ———
  const [data, newOff] = readString(buf, off);
  off = newOff; // now `off` is poised exactly at the next field

  const [signer, off4] = readPubkey(buf, off);
  off = off4;
  const expiryI64 = buf.readBigInt64LE(off);
  off += 8;
  const expiryDate =
    expiryI64 === BigInt(0)
      ? null
      : new Date(Number(expiryI64) * 1000).toISOString();

  const [tokenAccount] = readPubkey(buf, off);

  return {
    type: "Attestation",
    nonce,
    credential,
    schema,
    data,
    signer,
    expiry: expiryI64.toString(),
    expiryDate,
    tokenAccount,
  };
}

function decodeCredential(buf: Buffer) {
  let off = 1;
  const [authority, off1] = readPubkey(buf, off);
  off = off1;
  const [name, off2] = readString(buf, off);
  off = off2;

  // read Vector<PublicKey>
  const count = buf.readUInt32LE(off);
  off += 4;
  const authorizedSigners: string[] = [];
  for (let i = 0; i < count; i++) {
    const slice = buf.slice(off, off + 32);
    authorizedSigners.push(
      new PublicKey(slice as PublicKeyInitData).toBase58()
    );
    off += 32;
  }

  return {
    type: "Credential",
    authority,
    name,
    authorizedSigners,
  };
}

function decodeSchema(buf: Buffer) {
  let off = 1;
  const [cred, off1] = readPubkey(buf, off);
  off = off1;
  const [name, off2] = readString(buf, off);
  off = off2;
  const [desc, off3] = readString(buf, off);
  off = off3;
  const [layout, off4] = readString(buf, off);
  off = off4;
  const [fields, off5] = readString(buf, off);
  off = off5;
  const isPaused = buf.readUInt8(off) === 1;
  off += 1;
  const version = buf.readUInt8(off);
  off += 1;

  return {
    type: "Schema",
    credential: cred,
    name,
    description: desc,
    layout,
    fieldNames: fields,
    isPaused,
    version,
  };
}

(async () => {
  const conn = new Connection(clusterApiUrl("devnet"), "confirmed");
  const PROGRAM_ID = new PublicKey(
    "FJ8myMh9dRcgc2n8xBrWTbCrFYAbHQZCPtMzhhmvNo4M"
  );
  const raw = await conn.getProgramAccounts(PROGRAM_ID, { encoding: "base64" });

  console.log(`Found ${raw.length} accounts—decoding…`);

  const all: any[] = [];

  for (const { pubkey, account } of raw) {
    try {
      const buf = toBuffer(account.data);
      const tag = buf.readUInt8(0);
      let decoded: any;

      switch (tag) {
        case Tag.Attestation:
          decoded = decodeAttestation(buf);
          break;
        case Tag.Credential:
          decoded = decodeCredential(buf);
          break;
        case Tag.Schema:
          decoded = decodeSchema(buf);
          break;
        default:
          throw new Error(`Unknown tag ${tag}`);
      }

      all.push({ pubkey: pubkey.toBase58(), ...decoded });
    } catch (err: any) {
      console.warn(`❌ ${pubkey.toBase58()}: ${err.message}`);
    }
  }

  writeFileSync("./attestations_dump.json", JSON.stringify(all, null, 2), {
    encoding: "utf8",
  });
  console.log(`✅ Dumped ${all.length} records to attestations_dump.json`);
})();
