import { Buffer } from 'buffer';
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  AccountMeta,
  Connection,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { AppInstruction, AppAccountMeta } from './types';

/**
 * Converts a base58 encoded private key string into a Keypair object.
 */
export const getKeypairFromBs58 = (privateKeyBs58: string): Keypair => {
  try {
    const privateKeyBytes = bs58.decode(privateKeyBs58);
    // Ensure the decoded key is 64 bytes, typical for Solana secret keys
    // If it's 32 bytes, it might be just the secret part, not the full keypair encoding.
    // Keypair.fromSecretKey expects the 64-byte array.
    if (privateKeyBytes.length !== 64) {
        // If it's a 32-byte seed, use fromSeed, otherwise it's an invalid format for fromSecretKey
        if (privateKeyBytes.length === 32) {
            return Keypair.fromSeed(privateKeyBytes);
        }
      throw new Error('Invalid private key length. Must be 64 bytes after bs58 decoding, or 32 bytes for a seed.');
    }
    return Keypair.fromSecretKey(privateKeyBytes);
  } catch (error) {
    console.error("Failed to decode private key:", error);
    throw new Error('Invalid base58 private key.');
  }
};

/**
 * Converts a string (Hex or UTF-8) to a Buffer.
 * If the string starts with "0x", it's treated as Hex.
 */
export const stringToBuffer = (input: string): Buffer => {
  return Buffer.from(input, 'hex');
};

/**
 * Converts an AppAccountMeta (our internal representation) to an AccountMeta (web3.js).
 */
const toWeb3AccountMeta = (appAccount: AppAccountMeta): AccountMeta => {
  try {
    return {
      pubkey: new PublicKey(appAccount.pubkey),
      isSigner: appAccount.isSigner,
      isWritable: appAccount.isWritable,
    };
  } catch (error) {
    throw new Error(`Invalid public key format for account: ${appAccount.pubkey}. ${error.message}`);
  }
};

/**
 * Converts an AppInstruction (our internal representation) to a TransactionInstruction (web3.js).
 */
export const toWeb3Instruction = (appInstruction: AppInstruction): TransactionInstruction => {
  try {
    const programId = new PublicKey(appInstruction.programId);
    const keys = appInstruction.accounts.map(toWeb3AccountMeta);
    const data = stringToBuffer(appInstruction.data);
    return new TransactionInstruction({ programId, keys, data });
  } catch (error) {
    // Catch errors from PublicKey creation or data conversion
    if (error instanceof Error) {
        throw new Error(`Error converting instruction: ${error.message}`);
    }
    throw new Error('Unknown error converting instruction.');
  }
};

/**
 * Creates, signs, and sends a versioned transaction.
 */
export const createTransaction = async (
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  computeUnitPrice?: number, // Optional compute unit price in microLamports
  computeUnitLimit?: number,   // Optional compute unit limit
  skipPreflight?: boolean // Add skipPreflight parameter
): Promise<VersionedTransaction> => {
  let finalInstructions = [...instructions];

  // Add compute unit price instruction if specified
  if (typeof computeUnitPrice === 'number' && computeUnitPrice > 0) {
    const { ComputeBudgetProgram } = await import('@solana/web3.js'); // Dynamically import for tree-shaking
    finalInstructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeUnitPrice })
    );
  }

  // Add compute unit limit instruction if specified
  if (typeof computeUnitLimit === 'number' && computeUnitLimit > 0) {
    const { ComputeBudgetProgram } = await import('@solana/web3.js'); // Dynamically import for tree-shaking
    finalInstructions.unshift(
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit })
    );
  }

  const { blockhash } = await connection.getLatestBlockhash();

  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: finalInstructions, // Use the potentially modified instructions array
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}; 