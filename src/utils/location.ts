import { LocationKeywords } from '../types';
import { DEFAULT_HUB_KEYWORDS } from '../config/config';

export const HUB_CATEGORY = 'bangalore-ncr';

const DEFAULT_KEYWORDS: LocationKeywords = {
  remote: ['remote'],
  hub: DEFAULT_HUB_KEYWORDS.split(','),
  other: [],
};

// Buckets a job into 'remote' | 'bangalore-ncr' | 'other'. Shared by the aggregator and the
// JSearch fetcher so both sources categorise identically.
//
// A hub city wins over "remote" ("Bengaluru (Hybrid/Remote)" is still a Bangalore job), and
// `extraRemoteText` (e.g. the job title) only counts toward remote, never toward a city.
export function categorizeLocation(
  location: string | undefined,
  keywords: LocationKeywords = DEFAULT_KEYWORDS,
  opts: { isRemote?: boolean; extraRemoteText?: string } = {},
): string {
  const loc = (location ?? '').toLowerCase();
  const kw = {
    remote: keywords.remote.length > 0 ? keywords.remote : DEFAULT_KEYWORDS.remote,
    hub: keywords.hub.length > 0 ? keywords.hub : DEFAULT_KEYWORDS.hub,
  };
  if (loc && kw.hub.some((k) => loc.includes(k))) return HUB_CATEGORY;
  const remoteText = `${loc} ${(opts.extraRemoteText ?? '').toLowerCase()}`;
  if (opts.isRemote || kw.remote.some((k) => remoteText.includes(k))) return 'remote';
  return 'other';
}
