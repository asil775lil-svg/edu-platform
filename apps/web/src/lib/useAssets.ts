import { useEffect, useState } from "react";
import { api } from "./api";

/** صلاحية الرابط الموقّع 15 دقيقة؛ نجدّده بعد 10 دقائق حتى لا تنكسر الصور في جلسة طويلة. */
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { url: string; at: number }>();

function cached(sha256: string): string | null {
  const hit = cache.get(sha256);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(sha256);
    return null;
  }
  return hit.url;
}

/** يحوّل بصمة وسيط إلى رابط موقّع صالح للعرض. */
export function useAssetUrl(sha256: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (sha256 ? cached(sha256) : null));

  useEffect(() => {
    if (!sha256) {
      setUrl(null);
      return;
    }
    const hit = cached(sha256);
    if (hit) {
      setUrl(hit);
      return;
    }
    let alive = true;
    api.assets
      .get(sha256)
      .then((asset) => {
        cache.set(sha256, { url: asset.url, at: Date.now() });
        if (alive) setUrl(asset.url);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [sha256]);

  return url;
}
