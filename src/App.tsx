import { useState, useMemo, useCallback } from 'react';
import GlobalSettings from './components/GlobalSettings';
import InstructionEditor from './components/InstructionEditor';
import { AppInstruction, GlobalSettingsState } from './types';
import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import {
  getKeypairFromBs58,
  toWeb3Instruction,
  createTransaction,
} from './solanaUtils';
import { useWallet, WalletContextState } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function App() {
  const [globalSettings, setGlobalSettings] = useState<GlobalSettingsState>({
    privateKeys: '',
    rpcAddress: 'https://api.mainnet-beta.solana.com',
    computeUnitPrice: '', 
    computeUnitLimit: '',
    skipPreflight: true,
  });

  const { publicKey: walletPublicKey, signTransaction, connected } = useWallet() as WalletContextState;

  const [instructions, setInstructions] = useState<AppInstruction[]>([]);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const connection = useMemo(() => 
    new Connection(globalSettings.rpcAddress, 'confirmed'), 
    [globalSettings.rpcAddress]
  );

  const handleSettingsChange = useCallback(<K extends keyof GlobalSettingsState>(
    key: K,
    value: GlobalSettingsState[K]
  ) => {
    setGlobalSettings(prev => ({ ...prev, [key]: value }));
    setError(null);
    setTransactionSignature(null);
  }, []);

  const addInstruction = useCallback(() => {
    const newInstruction: AppInstruction = {
      id: Date.now().toString(),
      programId: '',
      accounts: [],
      data: '',
    };
    setInstructions(prev => [...prev, newInstruction]);
    setError(null);
    setTransactionSignature(null);
  }, []);

  const updateInstruction = useCallback((id: string, updatedInstruction: AppInstruction) => {
    setInstructions(prev => prev.map(inst => inst.id === id ? updatedInstruction : inst));
    setError(null);
    setTransactionSignature(null);
  }, []);

  const removeInstruction = useCallback((id: string) => {
    setInstructions(prev => prev.filter(inst => inst.id !== id));
    setError(null);
    setTransactionSignature(null);
  }, []);

  const handleSendTransaction = async () => {
    setIsLoading(true);
    setError(null);
    setTransactionSignature(null);

    try {
      if (instructions.length === 0) {
        throw new Error('At least one instruction is required.');
      }
      if (!globalSettings.rpcAddress.trim()) {
        throw new Error('RPC Address is required.');
      }

      // 1. Determine Payer
      let payerPublicKey: PublicKey;
      let payerKeypair: Keypair | null = null;
      const privateKeyStrings = globalSettings.privateKeys.split('\n').map(pk => pk.trim()).filter(pk => pk);

      if (privateKeyStrings.length > 0) {
        payerKeypair = getKeypairFromBs58(privateKeyStrings[0]);
        payerPublicKey = payerKeypair.publicKey;
      } else if (connected && walletPublicKey) {
        payerPublicKey = walletPublicKey;
      } else {
        throw new Error('Payer not specified. Provide a private key or connect a wallet.');
      }

      // 2. Prepare Instructions
      const web3Instructions = instructions.map(inst => toWeb3Instruction(inst));

      // 3. Identify all signers
      const localSigners: Keypair[] = [];
      const allProvidedKeypairsMap = new Map<string, Keypair>();
      privateKeyStrings.forEach(pkStr => {
        try {
          const kp = getKeypairFromBs58(pkStr);
          allProvidedKeypairsMap.set(kp.publicKey.toBase58(), kp);
        } catch (e) {
          console.warn(`Ignoring invalid private key: ${ (e as Error).message }`);
        }
      });

      let walletIsSigner = false;
      const uniqueRequiredSignerPubkeys = new Set<string>();
      uniqueRequiredSignerPubkeys.add(payerPublicKey.toBase58()); // Payer is always a signer

      instructions.forEach(inst => {
        inst.accounts.forEach(acc => {
          if (acc.isSigner && acc.pubkey) {
            uniqueRequiredSignerPubkeys.add(acc.pubkey);
          }
        });
      });
      
      uniqueRequiredSignerPubkeys.forEach(pubkeyStr => {
        const kp = allProvidedKeypairsMap.get(pubkeyStr);
        if (kp) {
          // Add to localSigners if not already (e.g. if payer is also in instruction accounts as signer)
          if (!localSigners.find(ls => ls.publicKey.toBase58() === kp.publicKey.toBase58())) {
            localSigners.push(kp);
          }
        } else if (connected && walletPublicKey && walletPublicKey.toBase58() === pubkeyStr) {
          walletIsSigner = true;
        } else {
          throw new Error(`Signature required for ${pubkeyStr}, but no private key provided and not connected wallet.`);
        }
      });
      
      // Ensure payerKeypair is in localSigners if it was derived from privateKeys and is the designated payer
      if (payerKeypair && !localSigners.find(ls => ls.publicKey.toBase58() === payerKeypair.publicKey.toBase58())) {
         localSigners.push(payerKeypair);
      }

      // 4. Create Transaction
      const unitPrice = globalSettings.computeUnitPrice === '' ? undefined : Number(globalSettings.computeUnitPrice);
      const unitLimit = globalSettings.computeUnitLimit === '' ? undefined : Number(globalSettings.computeUnitLimit);

      let transaction = await createTransaction(
        connection,
        web3Instructions,
        payerPublicKey,
        unitPrice,
        unitLimit
      );

      // 5. Sign Transaction
      // Sign with local keypairs first
      if (localSigners.length > 0) {
        transaction.sign(localSigners);
      }

      // Sign with wallet if needed (as payer or instruction signer)
    //   if (walletIsSigner || (payerPublicKey.equals(walletPublicKey!) && !payerKeypair) ) { // wallet is payer and no local key for payer
      if (walletIsSigner) { // wallet is payer and no local key for payer
        if (!signTransaction) {
          throw new Error('Wallet not connected or doesn\'t support signing.');
        }
        try {
            console.log("Requesting wallet signature for transaction:", transaction);
            transaction = await signTransaction(transaction);
        } catch (signError) {
            console.error("Wallet signing failed:", signError);
            throw new Error(`Wallet signing failed: ${ (signError as Error).message }`);
        }
      }

      // 6. Send Transaction
      const signature = await connection.sendTransaction(transaction, {
        skipPreflight: globalSettings.skipPreflight,
      });

      console.log('Transaction sent with signature:', signature);
      await connection.confirmTransaction({ 
          signature, 
          blockhash: transaction.message.recentBlockhash!, 
          lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight 
        }, 'confirmed');
      
      setTransactionSignature(signature);

    } catch (e: any) {
      console.error("Transaction failed:", e);
      setError(e.message || 'An unknown error occurred during transaction processing.');
    }
    setIsLoading(false);
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>Solana Transaction Builder</h1>
        <div className="wallet-button-container">
          <WalletMultiButton />
        </div>
      </header>
      <main>
        <GlobalSettings settings={globalSettings} onSettingsChange={handleSettingsChange} />
        
        <div className="instructions-section section-container">
          <h2>Transaction Instructions</h2>
          <button onClick={addInstruction} style={{ marginBottom: '1rem' }} className="add-btn">
            [ + ] ADD INSTRUCTION
          </button>
          {instructions.length === 0 && <p>No instructions added yet. Click above to add one.</p>}
          {instructions.map((inst, index) => (
            <InstructionEditor
              key={inst.id}
              instruction={inst}
              onUpdateInstruction={updateInstruction}
              onRemoveInstruction={removeInstruction}
              index={index}
            />
          ))}
        </div>

        <div className="send-section section-container">
          <h2>Send Transaction</h2>
          <button onClick={handleSendTransaction} disabled={isLoading || instructions.length === 0} className="send-tx-btn">
            {isLoading ? 'Processing...' : 'Sign & Send Transaction'}
          </button>
          {transactionSignature && (
            <div className="tx-status success-message">
              <p>Transaction Sent Successfully!</p>
              <p>Signature: {transactionSignature}</p>
              <a 
                href={`https://solscan.io/tx/${transactionSignature}?cluster=${globalSettings.rpcAddress.includes('devnet') ? 'devnet' : globalSettings.rpcAddress.includes('testnet') ? 'testnet' : 'mainnet-beta'}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Solscan
              </a>
            </div>
          )}
          {error && (
            <div className="tx-status error-message">
              <p>Error: {error}</p>
            </div>
          )}
        </div>
      </main>
      <footer>
        <p>&copy; 2024 Solana Transaction Builder</p>
      </footer>
    </div>
  );
}

export default App; 