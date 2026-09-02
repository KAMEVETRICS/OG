export function parseChainScanAgentIds(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const result = (raw as { result?: unknown }).result;
  if (typeof result !== 'object' || result === null) return [];
  const list = (result as { list?: unknown }).list;
  if (!Array.isArray(list)) return [];
  return [
    ...new Set(
      list.flatMap((item) => {
        if (typeof item !== 'object' || item === null) return [];
        const tokenId = (item as { tokenId?: unknown }).tokenId;
        if (typeof tokenId === 'string' && /^[1-9][0-9]{0,77}$/.test(tokenId)) {
          return [tokenId];
        }
        if (typeof tokenId === 'number' && Number.isSafeInteger(tokenId) && tokenId > 0) {
          return [String(tokenId)];
        }
        return [];
      }),
    ),
  ];
}
