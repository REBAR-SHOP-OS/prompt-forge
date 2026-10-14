export type LibraryDocument = Record<string, string>;

export const MAX_LIBRARY_STATE_BYTES = 450 * 1024;

const CACHEABLE_PREFIXES = [
  "preview-state",
  "pending-end-appends",
  "pending-start-prepends",
  "workspace-hidden-jobs",
  "workspace-hidden-images",
  "workspace-active-jobs",
  "workspace-active-images",
] as const;

type StorageWriter = Pick<Storage, "setItem">;

export interface LibraryCompactionResult {
  state: LibraryDocument;
  byteSize: number;
  keyCount: number;
  changed: boolean;
  droppedKeys: string[];
  withinBudget: boolean;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isInlineImage(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim());
}

function isDurableReference(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("data:") &&
    !value.startsWith("blob:");
}

function compactJsonValue(value: unknown, property?: string, parent?: Record<string, unknown>): unknown {
  if (isInlineImage(value)) {
    if (property === "thumbnail_url") return null;
    if ((property === "url" || property === "src") && isDurableReference(parent?.storage_path)) {
      return parent?.storage_path;
    }
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item) => compactJsonValue(item));
  }
  if (typeof value === "object" && value !== null) {
    const source = value as Record<string, unknown>;
    const compacted: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      compacted[key] = compactJsonValue(item, key, source);
    }
    return compacted;
  }
  return value;
}

export function compactSerializedLibraryValue(raw: string): { value: string; changed: boolean } {
  if (isInlineImage(raw)) return { value: "", changed: true };
  try {
    const compacted = JSON.stringify(compactJsonValue(JSON.parse(raw)));
    return { value: compacted, changed: compacted !== raw };
  } catch {
    return { value: raw, changed: false };
  }
}

function prefixFor(key: string): string {
  const separator = key.indexOf(":");
  return separator >= 0 ? key.slice(0, separator) : key;
}

function measure(state: LibraryDocument): { serialized: string; byteSize: number } {
  const serialized = JSON.stringify(state);
  return { serialized, byteSize: byteLength(serialized) };
}

export function compactLibraryDocument(
  document: LibraryDocument,
  budgetBytes = MAX_LIBRARY_STATE_BYTES,
): LibraryCompactionResult {
  const state: LibraryDocument = {};
  let changed = false;
  for (const [key, raw] of Object.entries(document)) {
    const compacted = compactSerializedLibraryValue(raw);
    state[key] = compacted.value;
    changed ||= compacted.changed;
  }

  const droppedKeys: string[] = [];
  let measured = measure(state);
  if (measured.byteSize > budgetBytes) {
    for (const prefix of CACHEABLE_PREFIXES) {
      const matchingKeys = Object.keys(state)
        .filter((key) => prefixFor(key) === prefix)
        .sort();
      for (const key of matchingKeys) {
        delete state[key];
        droppedKeys.push(key);
        changed = true;
      }
      measured = measure(state);
      if (measured.byteSize <= budgetBytes) break;
    }
  }

  return {
    state,
    byteSize: measured.byteSize,
    keyCount: Object.keys(state).length,
    changed,
    droppedKeys,
    withinBudget: measured.byteSize <= budgetBytes,
  };
}

export function writeCompactedLibraryValue(
  storage: StorageWriter,
  key: string,
  value: unknown,
): boolean {
  const serialized = JSON.stringify(compactJsonValue(value));
  try {
    storage.setItem(key, serialized);
    return true;
  } catch {
    console.warn("library-state local write failed", {
      operation: "local-write",
      byteSize: byteLength(serialized),
      keyCount: 1,
    });
    return false;
  }
}
