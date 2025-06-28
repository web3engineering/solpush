import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import GlobalSettings from './components/GlobalSettings';
import InstructionEditor from './components/InstructionEditor';
import { AppInstruction, GlobalSettingsState } from './types';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import {
  getKeypairFromBs58,
  toWeb3Instruction,
  createTransaction,
} from './solanaUtils';
import { useWallet, WalletContextState } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { DEFAULT_RPC, DIVERS_ADDRESS, DIVERS_RPC, RPC_PAYMENT_LAMPORTS } from './config';

interface TemplateData {
  globalSettings: Pick<GlobalSettingsState, 'rpcAddress' | 'computeUnitPrice' | 'computeUnitLimit' | 'skipPreflight'>;
  instructions: AppInstruction[];
}

function App() {
  const [globalSettings, setGlobalSettings] = useState<GlobalSettingsState>({
    privateKeys: '',
    rpcAddress: DEFAULT_RPC,
    computeUnitPrice: '', 
    computeUnitLimit: '',
    skipPreflight: true,
  });

  const { publicKey: walletPublicKey, signTransaction, connected } = useWallet() as WalletContextState;
  const isCreatingDiversPayment = useRef(false);

  function createPaymentIx(walletPublicKey: PublicKey | null) {
    const diversAddress = new PublicKey(DIVERS_ADDRESS);
    const amount = RPC_PAYMENT_LAMPORTS;
    const dataBuffer = Buffer.alloc(12);
    dataBuffer.writeUInt32LE(2, 0);
    dataBuffer.writeBigUInt64LE(BigInt(amount), 4);
    const dataHex = dataBuffer.toString('hex');
    return {
      id: Date.now().toString(),
      programId: SystemProgram.programId.toBase58(),
      accounts: [
        {
          id: '1',
          pubkey: walletPublicKey?.toBase58() || '',
          isSigner: true,
          isWritable: true
        },
        {
          id: '2',
          pubkey: diversAddress.toBase58(),
          isSigner: false,
          isWritable: true
        }
      ],
      data: dataHex,
      description: `Instruction for Diver's RPC payment`
    };
  }

  const createInitialDiversPayment = useCallback(() => {
    try {
      return createPaymentIx(walletPublicKey);
    } catch (error) {
      console.error('Error creating initial divers payment:', error);
      return null;
    }
  }, [walletPublicKey]);

  const [instructions, setInstructions] = useState<AppInstruction[]>(() => {
    if (String(DEFAULT_RPC) !== String(DIVERS_RPC)) {
      return [];
    }
    const initialInstruction = createInitialDiversPayment();
    return initialInstruction ? [initialInstruction] : [];
  });

  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showATAModal, setShowATAModal] = useState(false);
  const [tokenMint, setTokenMint] = useState('');
  const [tokenOwner, setTokenOwner] = useState('');
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

  useEffect(() => {
    setInstructions(prev => {
      return prev.map(inst => {
        const isDiversPayment = inst.programId === SystemProgram.programId.toBase58() &&
                               inst.accounts.some(acc => acc.pubkey === DIVERS_ADDRESS);
        
        if (isDiversPayment && inst.accounts.length >= 2) {
          const updatedAccounts = [...inst.accounts];
          updatedAccounts[0] = {
            ...updatedAccounts[0],
            pubkey: walletPublicKey?.toBase58() || ''
          };
          
          return {
            ...inst,
            accounts: updatedAccounts
          };
        }
        return inst;
      });
    });
  }, [walletPublicKey, connected]);

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

  const connection = useMemo(() => {
    try {
      if (!globalSettings.rpcAddress.trim()) {
        throw new Error('RPC Address is required');
      }
      setError(null);
      return new Connection(globalSettings.rpcAddress, 'confirmed');
    } catch (error) {
      console.error('Failed to create connection:', error);
      setError(error instanceof Error ? error.message : 'Invalid RPC URL');
      return new Connection(DEFAULT_RPC, 'confirmed');
    }
  }, [globalSettings.rpcAddress]);

  const handleCreateDiversPayment = useCallback(() => {
    try {
      const newInstruction: AppInstruction = createPaymentIx(walletPublicKey);
      setInstructions(prev => {
        const existingDiversPayment = prev.find(inst =>
          inst.programId === SystemProgram.programId.toBase58() &&
          inst.accounts.some(acc => acc.pubkey === DIVERS_ADDRESS)
        );
        if (existingDiversPayment) {
          return prev;
        }
        return [...prev, newInstruction]
      });
      setError(null);
    } catch (error) {
      setError(`Error creating Diver's payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [walletPublicKey]);

  const handleSettingsChange = useCallback(<K extends keyof GlobalSettingsState>(
    key: K,
    value: GlobalSettingsState[K]
  ) => {
    setGlobalSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      
      if (key === 'rpcAddress') {
        if (value === DIVERS_RPC && prev.rpcAddress !== DIVERS_RPC) {
          // Add payment back if switching to default RPC
          if (!isCreatingDiversPayment.current) {
            isCreatingDiversPayment.current = true;
            handleCreateDiversPayment();
            setTimeout(() => {
              isCreatingDiversPayment.current = false;
            }, 0);
          }
        } else if (value !== DIVERS_RPC && prev.rpcAddress === DIVERS_RPC) {
          // Remove payment if switching away from default RPC
          setInstructions(currentInstructions => currentInstructions.filter(inst => {
            const isDiversPayment = inst.programId === SystemProgram.programId.toBase58() &&
                                  inst.accounts.some(acc => acc.pubkey === DIVERS_ADDRESS);
            return !isDiversPayment;
          }));
        }
      }

      return newSettings;
    });
    setError(null);
    setTransactionSignature(null);
    setTransactionStatus(null);
  }, [handleCreateDiversPayment]);

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
    setTransactionStatus(null);
  }, []);

  const updateInstruction = useCallback((id: string, updatedInstruction: AppInstruction) => {
    setInstructions(prev => prev.map(inst => inst.id === id ? updatedInstruction : inst));
    setError(null);
    setTransactionSignature(null);
    setTransactionStatus(null);
  }, []);

  const removeInstruction = useCallback((id: string) => {
    setInstructions(prev => prev.filter(inst => inst.id !== id));
    setError(null);
    setTransactionSignature(null);
    setTransactionStatus(null);
  }, []);

  const handleOpenATAModal = useCallback(() => {
    setShowATAModal(true);
  }, []);

  const handleCreateATA = useCallback(async () => {
    if (!tokenMint) {
      setError('Please enter the token address');
      return;
    }

    try {
      const mintPubkey = new PublicKey(tokenMint);
      let ataAddress = '';
      let ownerPubkey = '';
      
      if (tokenOwner || walletPublicKey) {
        ownerPubkey = tokenOwner || walletPublicKey?.toBase58() || '';
        if (ownerPubkey) {
          ataAddress = (await getAssociatedTokenAddress(
            mintPubkey,
            new PublicKey(ownerPubkey),
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )).toBase58();
        }
      }

      const newInstruction: AppInstruction = {
        id: Date.now().toString(),
        programId: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
        accounts: [
          {
            id: '1',
            pubkey: walletPublicKey?.toBase58() || '', // Payer
            isSigner: true,
            isWritable: true
          },
          {
            id: '2',
            pubkey: ataAddress, // ATA
            isSigner: false,
            isWritable: true
          },
          {
            id: '3',
            pubkey: ownerPubkey, // Owner
            isSigner: false,
            isWritable: false
          },
          {
            id: '4',
            pubkey: mintPubkey.toBase58(), // Mint
            isSigner: false,
            isWritable: false
          },
          {
            id: '5',
            pubkey: SystemProgram.programId.toBase58(), // System Program
            isSigner: false,
            isWritable: false
          },
          {
            id: '6',
            pubkey: TOKEN_PROGRAM_ID.toBase58(), // Token Program
            isSigner: false,
            isWritable: false
          }
        ],
        data: '',
        description: `Instruction for ATA creation for wallet ${ownerPubkey} to hold token ${mintPubkey.toBase58()}, paid by ${walletPublicKey?.toBase58() || ''}`
      };

      setInstructions(prev => [...prev, newInstruction]);
      setShowATAModal(false);
      setTokenMint('');
      setTokenOwner('');
      setError(null);
    } catch (error) {
      setError(`Error creating ATA: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [tokenMint, tokenOwner, walletPublicKey]);

  const handleSendTransaction = async () => {
    setIsLoading(true);
    setError(null);
    setTransactionSignature(null);
    setTransactionStatus(null);

    let signature: string | null = null;

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
      signature = await connection.sendTransaction(transaction, {
        skipPreflight: globalSettings.skipPreflight,
      });

      console.log('Transaction sent with signature:', signature);
      setTransactionSignature(signature);
      setTransactionStatus('UNKNOWN');
      
      const startTime = Date.now();
      const interval = setInterval(async () => {
        try {
          if (Date.now() - startTime > 90000) {
            setTransactionStatus('NOT LANDED');
            clearInterval(interval);
            return;
          }

          const status = await connection.getSignatureStatuses([signature!], {
            searchTransactionHistory: true,
          });

          if (status && status.value && status.value[0]) {
            const confirmationStatus = status.value[0].confirmationStatus;
            setTransactionStatus(confirmationStatus?.toUpperCase() ?? 'CONFIRMED');
            clearInterval(interval);
          }
        } catch (e) {
          console.error('Error checking transaction status:', e);
        }
      }, 5000);

    } catch (e: any) {
      console.error("Transaction failed:", e);
      console.error("Test: remove this later");
      setError(e.message || 'An unknown error occurred during transaction processing.');
    }
    setIsLoading(false);
  };

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
      // ignore errors
    }
    await navigator.clipboard.writeText(url.toString());
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1500);
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>Solana Transaction Builder</h1>
        <div className="wallet-button-container">
          <WalletMultiButton  />
        </div>
      </header>
      <main>
        <GlobalSettings settings={globalSettings} onSettingsChange={handleSettingsChange} />
        
        <div className="instructions-section section-container">
          <h2>Transaction Instructions</h2>
          <div className="instruction-buttons">
            <button onClick={addInstruction} style={{ marginBottom: '1rem' }} className="add-btn">
              [ + ] ADD INSTRUCTION
            </button>
            <button 
              onClick={handleOpenATAModal} 
              style={{ marginBottom: '1rem', marginLeft: '1rem' }} 
              className="add-btn"
            >
              [ + ] CREATE ATA
            </button>
            <button 
              onClick={handleCreateDiversPayment} 
              style={{ marginBottom: '1rem', marginLeft: '1rem' }} 
              className="add-btn"
            >
              [ + ] PAY DIVER'S RPC
            </button>
          </div>
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

        <div className="section-container">
          <h2>Templates</h2>
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

        {showATAModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>Create Associated Token Account</h3>
              <div className="form-group">
                <label>Token Mint Address:</label>
                <input
                  type="text"
                  value={tokenMint}
                  onChange={(e) => setTokenMint(e.target.value)}
                  placeholder="Enter token mint address"
                />
              </div>
              <div className="form-group">
                <label>Token Owner Address (optional, defaults to connected wallet):</label>
                <input
                  type="text"
                  value={tokenOwner}
                  onChange={(e) => setTokenOwner(e.target.value)}
                  placeholder="Enter token owner address"
                />
              </div>
              <div className="modal-buttons">
                <button 
                  onClick={handleCreateATA} 
                  className={`confirm-btn${tokenMint ? ' active' : ''}`}
                  disabled={!tokenMint}
                >
                  Create ATA
                </button>
                <button onClick={() => {
                  setShowATAModal(false);
                  setTokenMint('');
                  setTokenOwner('');
                  setError(null);
                }} className="cancel-btn">Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="send-section section-container">
          <h2>Send Transaction</h2>
          <button onClick={handleSendTransaction} disabled={isLoading || instructions.length === 0} className="send-tx-btn">
            {isLoading ? 'Processing...' : 'Sign & Send Transaction'}
          </button>
          {transactionSignature && (
            <div className="tx-status success-message">
              <p>Transaction Sent!</p>
              <p>Signature: {transactionSignature}</p>
              <p>Status: {transactionStatus || 'Sending...'}</p>
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