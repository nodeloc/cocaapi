import type { Order } from "./walletApi";

export function checkoutDeadline(order: Order): number | null {
  const value = order.checkout_expires_at ?? order.expires_at;
  return value ? Date.parse(value) : null;
}

export function checkoutExpired(order: Order, now: number): boolean {
  const until = checkoutDeadline(order);
  return order.status === "pending" && until !== null && (!Number.isFinite(until) || until <= now);
}

export function payableCheckout(order: Order, now = Date.now()): string | null {
  if (
    order.status !== "pending" ||
    !order.checkout_url ||
    checkoutDeadline(order) === null ||
    checkoutExpired(order, now)
  )
    return null;
  try {
    const url = new URL(order.checkout_url);
    return url.protocol === "https:" && !url.username && !url.password ? order.checkout_url : null;
  } catch {
    return null;
  }
}
