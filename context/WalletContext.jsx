import React, { createContext, useContext, useState } from "react";

const WalletContext = createContext({
  walletReloadKey: 0,
  triggerWalletReload: () => {},
});

export function WalletProvider({ children }) {
  const [walletReloadKey, setWalletReloadKey] = useState(0);

  const triggerWalletReload = () => {
    setWalletReloadKey((prev) => prev + 1);
  };

  return (
    <WalletContext.Provider value={{ walletReloadKey, triggerWalletReload }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWalletReload = () => useContext(WalletContext);
