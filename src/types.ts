// Using string for PublicKey fields for easier form handling initially.
// These will be converted to PublicKey objects when building the transaction.

export interface AppAccountMeta {
  id: string; // For React key prop
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface AppInstruction {
  id: string; // For React key prop
  programId: string;
  accounts: AppAccountMeta[];
  data: string; // Will accept HEX or ASCII, to be converted to Buffer
  description?: string; 
}

export interface GlobalSettingsState {
  privateKeys: string; // Raw string from textarea, split by newline
  rpcAddress: string;
  computeUnitPrice: number | string;
  computeUnitLimit: number | string;
  skipPreflight: boolean;
} 