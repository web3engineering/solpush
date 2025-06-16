import { useState, useMemo, useCallback, useEffect } from 'react';
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


interface TemplateData {
  globalSettings: Pick<GlobalSettingsState, 'rpcAddress' | 'computeUnitPrice' | 'computeUnitLimit' | 'skipPreflight'>;
  instructions: AppInstruction[];
}

function App() {
  const [globalSettings, setGlobalSettings] = useState<GlobalSettingsState>({
    privateKeys: '',
    rpcAddress: 'https://api.mainnet-beta.solana.com',
    computeUnitPrice: '',
    computeUnitLimit: '',
    skipPreflight: true,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rpcAddressParam = params.get('rpcAddress');
    const computeUnitPriceParam = params.get('computeUnitPrice');
    const computeUnitLimitParam = params.get('computeUnitLimit');
    const instructionsParam = params.get('instructions');
    const skipPreflightParam = params.get('skipPreflight');
    setGlobalSettings(prev => ({
      ...prev,
      rpcAddress: rpcAddressParam ?? prev.rpcAddress,
      computeUnitPrice: computeUnitPriceParam ?? prev.computeUnitPrice,
      computeUnitLimit: computeUnitLimitParam ?? prev.computeUnitLimit,
      skipPreflight: skipPreflightParam !== null ? skipPreflightParam === 'true' : prev.skipPreflight,
    }));
    if (instructionsParam) {
      try {
        const decoded = atob(instructionsParam);
        const parsed: AppInstruction[] = JSON.parse(decoded);
        setInstructions(parsed);
      } catch (e) {
        // ignore errors
      }
    }
  }, []);

  const { publicKey: walletPublicKey, signTransaction, connected } = useWallet() as WalletContextState;

  const [instructions, setInstructions] = useState<AppInstruction[]>([]);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const connection = useMemo(() => 
    new Connection(globalSettings.rpcAddress, 'confirmed'), 
    [globalSettings.rpcAddress]
  );

  const [shareCopied, setShareCopied] = useState(false);


  const TEMPLATES_KEY = 'solpush_templates';
  const [templates, setTemplates] = useState<{ [name: string]: TemplateData }>(() => {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
    return {};
  });
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [saveName, setSaveName] = useState('');


  useEffect(() => {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  }, [templates]);


  const handleSaveTemplate = () => {
    if (!saveName.trim()) return;
    setTemplates(prev => ({
      ...prev,
      [saveName]: {
        globalSettings: {
          rpcAddress: globalSettings.rpcAddress,
          computeUnitPrice: globalSettings.computeUnitPrice,
          computeUnitLimit: globalSettings.computeUnitLimit,
          skipPreflight: globalSettings.skipPreflight,
        },
        instructions,
      },
    }));
    setSaveName('');
  };


  const handleSelectTemplate = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedTemplate(name);
    if (name && templates[name]) {
      setGlobalSettings(prev => ({
        ...prev,
        ...templates[name].globalSettings,
      }));
      setInstructions(templates[name].instructions);
    }
  };


  const handleDeleteTemplate = (name: string) => {
    setTemplates(prev => {
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
    if (selectedTemplate === name) setSelectedTemplate('');
  };

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

  const handleShare = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('rpcAddress', globalSettings.rpcAddress);
    url.searchParams.set('computeUnitPrice', globalSettings.computeUnitPrice.toString());
    url.searchParams.set('computeUnitLimit', globalSettings.computeUnitLimit.toString());
    url.searchParams.set('skipPreflight', globalSettings.skipPreflight.toString());

    try {
      const instructionsJson = JSON.stringify(instructions);
      const instructionsBase64 = btoa(instructionsJson);
      url.searchParams.set('instructions', instructionsBase64);
    } catch (e) {

    }
    await navigator.clipboard.writeText(url.toString());
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1500);
  };

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


        <div style={{ margin: '24px 0', textAlign: 'left', background: '#f6fff6', border: '1px solid #dcdcdc', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <select value={selectedTemplate} onChange={handleSelectTemplate} style={{ fontSize: '1.1em', padding: '8px 16px', borderRadius: 6 }}>
              <option value="">Select template...</option>
              {Object.keys(templates).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {selectedTemplate && (
              <button style={{ background: '#fdecec', color: '#c53030', border: '1px solid #fbcaca', borderRadius: 4, padding: '8px 14px', fontWeight: 600 }} onClick={() => handleDeleteTemplate(selectedTemplate)}>Delete</button>
            )}
            <input
              type="text"
              placeholder="Template name"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              style={{ fontSize: '1.1em', padding: '8px 12px', borderRadius: 6, minWidth: 180 }}
            />
            <button className="share-btn" style={{ minWidth: 120 }} onClick={handleSaveTemplate}>Save to library</button>
          </div>
        </div>

        <div style={{ margin: '24px 0', textAlign: 'left' }}>
          <button type="button" className="share-btn" onClick={handleShare}>
            SHARE
          </button>
          {shareCopied && <span style={{ marginLeft: '18px', color: 'green', fontWeight: 600, fontSize: '1.1em' }}>The link has been copied!</span>}
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