const scale = BigInt(1_000_000_000);

export function formatCredits(units: string): string {
  const value = BigInt(units);
  const absolute = value < BigInt(0) ? -value : value;
  const fraction = (absolute % scale).toString().padStart(9, "0").replace(/0+$/, "");
  return `${value < BigInt(0) ? "-" : ""}$${absolute / scale}.${fraction.padEnd(2, "0")}`;
}

export const orderLabels = {
  creating: "正在创建",
  pending: "待支付",
  paid: "已到账",
  expired: "已过期",
  review: "待核查",
} as const;

export const networkLabels = {
  tron: "TRON (TRC20)",
  ethereum: "Ethereum (ERC20)",
  bsc: "BNB Smart Chain (BEP20)",
} as const;
