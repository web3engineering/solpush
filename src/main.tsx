import './polyfills';
import React, { useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './App.css'
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import {
  WalletModalProvider,
} from '@solana/wallet-adapter-react-ui'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  // Add other wallets you want to support
} from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

// Default styles that can be overridden by your App.css
import '@solana/wallet-adapter-react-ui/styles.css'

const Main = () => {
  // Can be set to 'devnet', 'testnet', or 'mainnet-beta'
  // Or use a custom RPC endpoint
  const network = WalletAdapterNetwork.Mainnet // Or Devnet, Testnet. Or use globalSettings.rpcAddress from App.tsx context if more dynamic
  const endpoint = useMemo(() => clusterApiUrl(network), [network])

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter({ network }),
      new SolflareWalletAdapter({ network }),
      // Add more wallets here
    ],
    [network]
  )

  return (
    <React.StrictMode>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect={false}>
          <WalletModalProvider>
            <App />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </React.StrictMode>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Main />) 