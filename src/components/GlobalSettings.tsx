import React from 'react';
import { GlobalSettingsState } from '../types';

interface GlobalSettingsProps {
  settings: GlobalSettingsState;
  onSettingsChange: <K extends keyof GlobalSettingsState>(key: K, value: GlobalSettingsState[K]) => void;
}

const GlobalSettings: React.FC<GlobalSettingsProps> = ({ settings, onSettingsChange }) => {

  const handlePrivateKeyChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onSettingsChange('privateKeys', event.target.value);
  };

  const handleRpcAddressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange('rpcAddress', event.target.value);
  };

  const handleComputeUnitPriceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange('computeUnitPrice', event.target.value === '' ? '' : Number(event.target.value));
  };

  const handleComputeUnitLimitChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange('computeUnitLimit', event.target.value === '' ? '' : Number(event.target.value));
  };

  const handleSkipPreflightChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange('skipPreflight', event.target.checked);
  };

  return (
    <div className="global-settings-form section-container">
      <h2>Global Settings</h2>
      
      <div className="form-group">
        <label htmlFor="privateKeys">Private Keys (Base58, one per line):</label>
        <textarea
          id="privateKeys"
          value={settings.privateKeys}
          onChange={handlePrivateKeyChange}
          rows={3}
          placeholder="Enter private keys, one per line..."
        />
      </div>

      <div className="form-group">
        <label htmlFor="rpcAddress">RPC Address:</label>
        <input
          type="text"
          id="rpcAddress"
          value={settings.rpcAddress}
          onChange={handleRpcAddressChange}
          placeholder="e.g., https://api.mainnet-beta.solana.com"
        />
      </div>

      <div className="form-group">
        <label htmlFor="computeUnitPrice">Compute Unit Price (microLamports):</label>
        <input
          type="number"
          id="computeUnitPrice"
          value={settings.computeUnitPrice}
          onChange={handleComputeUnitPriceChange}
          placeholder="Optional, e.g., 1000"
          min="0"
        />
      </div>

      <div className="form-group">
        <label htmlFor="computeUnitLimit">Compute Unit Limit:</label>
        <input
          type="number"
          id="computeUnitLimit"
          value={settings.computeUnitLimit}
          onChange={handleComputeUnitLimitChange}
          placeholder="Optional, e.g., 200000"
          min="0"
        />
      </div>

      <div className="form-group">
        <label htmlFor="skipPreflight" className="checkbox-label inline-checkbox-label">
          <input
            type="checkbox"
            id="skipPreflight"
            checked={settings.skipPreflight}
            onChange={handleSkipPreflightChange}
          />
          Skip Preflight Checks
        </label>
      </div>
    </div>
  );
};

export default GlobalSettings; 