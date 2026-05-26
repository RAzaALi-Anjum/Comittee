/**
 * utils/walletManager.js
 * ──────────────────────────────────────────────────────────────────────────
 * HD wallet derivation from a BIP-39 mnemonic persisted in expo-secure-store.
 * Exposes:
 *   getWallet()         → ethers.HDNodeWallet  (connected to Hardhat RPC)
 *   signTransaction()   → signed tx hex string
 *   getEscrowContract() → ethers.Contract instance for CommitteeEscrow
 * ──────────────────────────────────────────────────────────────────────────
 */

import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

// Polyfill for ethers v6 secure random number generator in React Native/Expo
if (typeof global.crypto !== "object") {
  global.crypto = {};
}
if (typeof global.crypto.getRandomValues !== "function") {
  global.crypto.getRandomValues = (array) => {
    return Crypto.getRandomValues(array);
  };
}

import { ethers } from "ethers";

// ── Config ─────────────────────────────────────────────────────────────────
// Replace HARDHAT_RPC with your LAN IP when testing on a physical device.
// e.g., "http://192.168.1.100:8545"
const HARDHAT_RPC = "http://127.0.0.1:8545";

// ⚠  Replace this with the address printed by `npx hardhat run scripts/deploy.js`
// Default is the first Hardhat deterministic address (only valid for fresh local node).
const ESCROW_CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const DERIVATION_PATH = "m/44'/60'/0'/0/0";
const MNEMONIC_KEY    = "committee_wallet_mnemonic";

// Minimal ABI — only the functions/events the frontend calls
export const ESCROW_ABI = [
  "function depositToPool(uint256 committeeId) payable",
  "function releasePayout(uint256 committeeId, address winner)",
  "function getPoolBalance(uint256 committeeId) view returns (uint256)",
  "event Deposited(uint256 indexed committeeId, address indexed depositor, uint256 amount)",
  "event PayoutReleased(uint256 indexed committeeId, address indexed winner, uint256 amount)",
];

// ── Singleton provider ─────────────────────────────────────────────────────
let _provider = null;
let _wallet   = null;

function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(HARDHAT_RPC);
  }
  return _provider;
}

// ── Mnemonic helpers ───────────────────────────────────────────────────────
async function loadOrCreateMnemonic() {
  let mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY);
  if (!mnemonic) {
    // Generate a fresh random wallet and persist its mnemonic
    const fresh = ethers.Wallet.createRandom();
    mnemonic = fresh.mnemonic.phrase;
    await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic);
  }
  return mnemonic;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns a connected HD wallet. Creates and persists the mnemonic on first
 * call; subsequent calls return the cached wallet.
 */
export async function getWallet() {
  if (_wallet) return _wallet;
  const mnemonic  = await loadOrCreateMnemonic();
  const hdNode    = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, DERIVATION_PATH);
  _wallet         = hdNode.connect(getProvider());
  return _wallet;
}

/**
 * Signs a raw transaction object. Primarily used for custom tx assembly.
 * @param {ethers.TransactionRequest} txRequest
 * @returns {Promise<string>} Signed tx hex string
 */
export async function signTransaction(txRequest) {
  const wallet = await getWallet();
  return wallet.signTransaction(txRequest);
}

/**
 * Returns a CommitteeEscrow Contract instance connected to the signer.
 */
export async function getEscrowContract() {
  const wallet = await getWallet();
  return new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, wallet);
}

/**
 * Returns a read-only Contract instance (no signer needed for view calls).
 */
export function getEscrowContractReadOnly() {
  return new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, getProvider());
}

/**
 * Convenience: call depositToPool and wait for 1 confirmation.
 * @param {string|number} committeeId  Numeric committee ID
 * @param {string}        etherAmount  Amount in ETH string, e.g. "0.01"
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export async function depositToPool(committeeId, etherAmount) {
  const contract = await getEscrowContract();
  const tx = await contract.depositToPool(committeeId, {
    value: ethers.parseEther(String(etherAmount)),
  });
  return tx.wait(1);
}

/**
 * Returns the on-chain pool balance for a committee in ETH (string).
 */
export async function getPoolBalance(committeeId) {
  const contract = getEscrowContractReadOnly();
  const wei = await contract.getPoolBalance(committeeId);
  return ethers.formatEther(wei);
}
