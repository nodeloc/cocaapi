"use client";
import { createContext, useContext } from "react";
import type { Profile } from "../accountApi";

export interface CustomerNativeIdentity {
  profile: Profile;
  marker: string;
}
export const CustomerNativeContext = createContext<CustomerNativeIdentity | null>(null);
export const useCustomerNative = () => useContext(CustomerNativeContext);
