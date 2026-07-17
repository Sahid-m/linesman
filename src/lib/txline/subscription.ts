"use client";

import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import { getNetworkConfig, type Network } from "@/lib/network/config";
import devnetIdl from "./idl/devnet.json";
import mainnetIdl from "./idl/mainnet.json";

export type SubscribeInput = {
  network: Network;
  serviceLevelId: number;
  connection: Connection;
  wallet: ConstructorParameters<typeof AnchorProvider>[1];
};

export async function subscribeFreeTier(
  input: SubscribeInput,
): Promise<string> {
  const config = getNetworkConfig(input.network);
  if (!config.serviceLevels.includes(input.serviceLevelId)) {
    throw new Error(`Unsupported ${input.network} service level`);
  }

  const idl = (input.network === "devnet" ? devnetIdl : mainnetIdl) as Idl;
  if (idl.address !== config.programId) {
    throw new Error("IDL and selected network program do not match");
  }
  const provider = new AnchorProvider(input.connection, input.wallet, {
    commitment: "confirmed",
  });
  const program = new Program(idl, provider);
  const tokenMint = new PublicKey(config.txlMint);
  const user = input.wallet.publicKey;
  const userTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    user,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const [pricingMatrix] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId,
  );
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    program.programId,
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    tokenMint,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  const transaction = new Transaction();
  if (!(await input.connection.getAccountInfo(userTokenAccount))) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        user,
        userTokenAccount,
        user,
        tokenMint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }
  transaction.add(
    await program.methods
      .subscribe(input.serviceLevelId, 4)
      .accounts({
        user,
        pricingMatrix,
        tokenMint,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction(),
  );

  const latest = await input.connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = latest.blockhash;
  transaction.feePayer = user;
  const signed = await input.wallet.signTransaction(transaction);
  const signature = await input.connection.sendRawTransaction(
    signed.serialize(),
  );
  await input.connection.confirmTransaction(
    { signature, ...latest },
    "confirmed",
  );
  return signature;
}
