import React from 'react';
import { AppInstruction, AppAccountMeta } from '../types';

interface InstructionEditorProps {
  instruction: AppInstruction;
  onUpdateInstruction: (id: string, updatedInstruction: AppInstruction) => void;
  onRemoveInstruction: (id: string) => void;
  index: number;
}

const InstructionEditor: React.FC<InstructionEditorProps> = (
  { instruction, onUpdateInstruction, onRemoveInstruction, index }
) => {
  const handleInputChange = (field: keyof AppInstruction, value: any) => {
    onUpdateInstruction(instruction.id, { ...instruction, [field]: value });
  };

  const handleAccountChange = (accIndex: number, field: keyof AppAccountMeta, value: any) => {
    const updatedAccounts = instruction.accounts.map((acc, i) => 
      i === accIndex ? { ...acc, [field]: value } : acc
    );
    onUpdateInstruction(instruction.id, { ...instruction, accounts: updatedAccounts });
  };

  const addAccount = () => {
    const newAccount: AppAccountMeta = {
      id: Date.now().toString(), // Simple unique ID for account
      pubkey: '',
      isSigner: false,
      isWritable: false,
    };
    onUpdateInstruction(instruction.id, { 
      ...instruction, 
      accounts: [...instruction.accounts, newAccount]
    });
  };

  const removeAccount = (accIndex: number) => {
    const updatedAccounts = instruction.accounts.filter((_, i) => i !== accIndex);
    onUpdateInstruction(instruction.id, { ...instruction, accounts: updatedAccounts });
  };

  return (
    <div className="instruction-editor section-container-item">
      <div className="instruction-header">
        <h4>Instruction #{index + 1}</h4>
        <button onClick={() => onRemoveInstruction(instruction.id)} className="remove-btn small-btn">
          Remove Instruction
        </button>
      </div>

      <div className="form-group">
        <label htmlFor={`programId-${instruction.id}`}>Program ID:</label>
        <input
          type="text"
          id={`programId-${instruction.id}`}
          value={instruction.programId}
          onChange={(e) => handleInputChange('programId', e.target.value)}
          placeholder="Enter Program ID (Base58)"
        />
      </div>

      <div className="form-group">
        <label>Accounts:</label>
        {instruction.accounts.map((acc, accIndex) => (
          <div key={acc.id} className="account-item">
            <span className="account-index">#{accIndex + 1}</span>
            <input
              type="text"
              value={acc.pubkey}
              onChange={(e) => handleAccountChange(accIndex, 'pubkey', e.target.value)}
              placeholder="Public Key (Base58)"
              className="account-pubkey"
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={acc.isSigner}
                onChange={(e) => handleAccountChange(accIndex, 'isSigner', e.target.checked)}
              /> Signer
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={acc.isWritable}
                onChange={(e) => handleAccountChange(accIndex, 'isWritable', e.target.checked)}
              /> Writable
            </label>
            <button onClick={() => removeAccount(accIndex)} className="remove-btn-small">
              Remove Account
            </button>
          </div>
        ))}
        <button onClick={addAccount} className="add-btn small-btn" style={{ marginTop: '0.5rem'}}>
          [+] Add Account
        </button>
      </div>

      <div className="form-group">
        <label htmlFor={`data-${instruction.id}`}>Instruction Data (Hex or UTF-8):</label>
        <textarea
          id={`data-${instruction.id}`}
          value={instruction.data}
          onChange={(e) => handleInputChange('data', e.target.value)}
          rows={3}
          placeholder="Enter data as Hex string (e.g., 0x010203) or UTF-8 string"
        />
      </div>
    </div>
  );
};

export default InstructionEditor; 