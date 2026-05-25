/**
 * useZones：异步加载 zones.json，加载失败给出 fallback 与 warning
 * --------------------------------------------------
 * 加载完成前 status='loading'；
 * 成功 status='ready'，doc 为 ZonesDoc；
 * 失败 status='fallback'，doc 为内置最小 fallback（仅一个空场，避免崩页）。
 */

import { useEffect, useState } from 'react';
import { validateZonesDoc, type ZonesDoc } from './zones.schema';

const ZONES_URL = '/assets/teahouse-room/bg/zones.json';

/** 极简兜底：屏幕中央一片站立区，覆盖 1280×720，没有任何 block 与 seat */
const FALLBACK_DOC: ZonesDoc = {
  viewport: { w: 1280, h: 720 },
  zones: [
    {
      id: 'fallback-stand',
      type: 'stand',
      polygon: [
        [200, 540],
        [1080, 540],
        [1080, 640],
        [200, 640],
      ],
      motion: 'idle',
      label: 'fallback',
    },
  ],
};

export type ZonesStatus = 'loading' | 'ready' | 'fallback';

export interface UseZonesResult {
  status: ZonesStatus;
  doc: ZonesDoc;
  error?: string;
  /** 触发重新拉取（标注器导出后用） */
  reload: () => void;
}

export function useZones(): UseZonesResult {
  const [status, setStatus] = useState<ZonesStatus>('loading');
  const [doc, setDoc] = useState<ZonesDoc>(FALLBACK_DOC);
  const [error, setError] = useState<string | undefined>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetch(`${ZONES_URL}?t=${tick}`, { cache: 'no-cache' })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(json => {
        if (cancelled) return;
        const validated = validateZonesDoc(json);
        setDoc(validated);
        setStatus('ready');
        setError(undefined);
      })
      .catch(err => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn('[useZones] 加载 zones.json 失败，使用 fallback：', err);
        setDoc(FALLBACK_DOC);
        setStatus('fallback');
        setError(String(err));
      });
    return () => { cancelled = true; };
  }, [tick]);

  return {
    status,
    doc,
    error,
    reload: () => setTick(x => x + 1),
  };
}
