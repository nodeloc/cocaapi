import { translateMessage } from "./messages";

type CopyReference = Readonly<{ owner: unknown; field: PropertyKey }>;
export type CopySource = string | readonly string[] | CopyReference;
type CopyRecord = Readonly<Record<string, string>>;
const copies = new WeakMap<object, CopyRecord>();
type DisplayValue<T> = T extends string ? string : T;

function objectValue(owner: unknown, field: PropertyKey): unknown {
  return owner !== null && typeof owner === "object" ? Reflect.get(owner, field) : undefined;
}

function referenceSource(reference: CopyReference): string | undefined {
  if (reference.owner === null || typeof reference.owner !== "object") return undefined;
  const source = copies.get(reference.owner)?.[String(reference.field)];
  return source !== undefined && objectValue(reference.owner, reference.field) === source ? source : undefined;
}

export function markUiCopy<T extends object>(
  owner: T,
  fields: Readonly<Record<string, CopySource>>,
  inherited: readonly unknown[] = [],
): T {
  const sources = inherited.flatMap((item) =>
    item !== null && typeof item === "object" ? Object.entries(copies.get(item) ?? {}) : [],
  );
  const declared = Object.entries(fields).flatMap(([field, declaration]) => {
    const value = objectValue(owner, field);
    const source = declaredSource(declaration, value);
    return source !== undefined ? [[field, source] as const] : [];
  });
  if (sources.length || declared.length) copies.set(owner, Object.fromEntries([...sources, ...declared]));
  return owner;
}

function declaredSource(declaration: CopySource, value: unknown): string | undefined {
  if (typeof declaration === "string") return declaration;
  if ("owner" in declaration) return referenceSource(declaration);
  return declaration.find((candidate) => candidate === value);
}

export function uiCopySource(owner: unknown, field: PropertyKey): string | undefined {
  return referenceSource({ owner, field });
}

export function localizedProperty<T extends object, K extends keyof T>(owner: T, field: K): DisplayValue<T[K]>;
export function localizedProperty<T extends object, K extends keyof T>(
  owner: T | null | undefined,
  field: K,
): DisplayValue<T[K]> | undefined;
export function localizedProperty<Value>(owner: unknown, field: PropertyKey, current: Value): DisplayValue<Value>;
export function localizedProperty(owner: unknown, field: PropertyKey, current?: unknown): unknown {
  const value = arguments.length >= 3 ? current : objectValue(owner, field);
  const source = uiCopySource(owner, field);
  return source === undefined ? value : translateMessage(source);
}
