import type { CallLog } from '../types';

export const CALL_LOG_KEY = (exchangeId: string) => `skillswap_call_logs_${exchangeId}`;

export function readLogs(exchangeId: string): CallLog[] {
  try {
    return JSON.parse(localStorage.getItem(CALL_LOG_KEY(exchangeId)) || '[]') as CallLog[];
  } catch {
    return [];
  }
}

export function writeLogs(exchangeId: string, logs: CallLog[]): void {
  try {
    localStorage.setItem(CALL_LOG_KEY(exchangeId), JSON.stringify(logs.slice(0, 100)));
  } catch {
    // Storage full — the in-memory view still shows this session's calls.
  }
}

export function recordLog(exchangeId: string, entry: CallLog): void {
  writeLogs(exchangeId, [entry, ...readLogs(exchangeId)]);
}

export function allLogs(): { exchangeId: string; log: CallLog }[] {
  const out: { exchangeId: string; log: CallLog }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('skillswap_call_logs_')) continue;
    const exchangeId = key.slice('skillswap_call_logs_'.length);
    for (const log of readLogs(exchangeId)) out.push({ exchangeId, log });
  }
  return out.sort((a, b) => new Date(b.log.createdAt).getTime() - new Date(a.log.createdAt).getTime());
}

export function deleteLog(exchangeId: string, logId: string): void {
  writeLogs(exchangeId, readLogs(exchangeId).filter((l) => l.id !== logId));
}