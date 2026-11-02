"use client";

import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { Profile } from "../accountApi";

export interface CustomerSession {
  profile: Profile;
  refreshProfile: () => Promise<Profile>;
  clearSession: () => void;
  collapsed: boolean;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
}

export const CustomerSessionContext = createContext<CustomerSession | null>(null);
export const useCustomerSession = () => useContext(CustomerSessionContext);
