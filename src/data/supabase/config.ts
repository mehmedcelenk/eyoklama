/**
 * Supabase Backend & Multi-Institution Configuration
 * Vibecoding-Safe Native DOM Architecture
 * Supports true single-database multi-tenant SaaS routing
 */

export interface InstitutionConfig {
  id: string;
  slug: string;
  name: string;
  brandTitle: string;
  supabaseUrl: string;
  supabaseKey: string;
  description?: string;
}

export const CANONICAL_SUPABASE_URL = 'https://pdvwyfolkyuqipfwbggb.supabase.co';
export const CANONICAL_SUPABASE_KEY = 'sb_publishable_wzer9xrRSfmFieTPg-xb1A_kg10P-pF';

export const INSTITUTION_STORAGE_KEY = 'eyoklama_v3_selected_institution';

export const KNOWN_INSTITUTIONS: Record<string, Partial<InstitutionConfig>> = {
  bahibkk: {
    id: 'kurum1',
    slug: 'bahibkk',
    name: 'Bahibkk Okulu',
    brandTitle: 'eYoklama · Bahibkk',
    description: 'Birincil Okul / Kurum'
  },
  default: {
    id: 'kurum1',
    slug: 'default',
    name: 'Bahibkk Okulu',
    brandTitle: 'eYoklama · Bahibkk',
    description: 'Birincil Okul / Kurum'
  },
  kurum2: {
    id: 'kurum2',
    slug: 'kurum2',
    name: '2. Kurum',
    brandTitle: 'eYoklama · 2. Kurum',
    description: 'İkinci Okul / Kurum'
  }
};

/**
 * Detects the active institution slug from URL params, subdomain, or localStorage.
 */
export function getActiveInstitutionSlug(): string {
  if (typeof window !== 'undefined') {
    // 1. URL Query Parameter (?k=kurum2 veya ?kurum=kurum2)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryParam = urlParams.get('k') || urlParams.get('kurum') || urlParams.get('inst');
      if (queryParam) {
        const slug = queryParam.trim().toLowerCase();
        localStorage.setItem(INSTITUTION_STORAGE_KEY, slug);
        return slug;
      }
    } catch {
      // ignore
    }

    // 2. Subdomain check (örn: kurum2.eyoklama.com)
    try {
      const host = window.location.hostname;
      const parts = host.split('.');
      if (parts.length > 2) {
        const sub = parts[0]?.toLowerCase();
        if (sub && sub !== 'www' && sub !== 'app') {
          return sub;
        }
      }
    } catch {
      // ignore
    }

    // 3. Saved preference in localStorage
    try {
      const saved = localStorage.getItem(INSTITUTION_STORAGE_KEY);
      if (saved && saved.trim()) {
        return saved.trim().toLowerCase();
      }
    } catch {
      // ignore
    }
  }

  return 'default';
}

/**
 * Returns full configuration object for the active institution.
 * Dynamically supports any institution slug without requiring code redeployment.
 */
export function getActiveInstitution(): InstitutionConfig {
  const slug = getActiveInstitutionSlug();
  const known = KNOWN_INSTITUTIONS[slug];

  return {
    id: known?.id || slug,
    slug,
    name: known?.name || (slug === 'default' ? '1. Kurum' : `${slug.toUpperCase()} Kurumu`),
    brandTitle: known?.brandTitle || (slug === 'default' ? 'eYoklama' : `eYoklama · ${slug.toUpperCase()}`),
    supabaseUrl: CANONICAL_SUPABASE_URL,
    supabaseKey: CANONICAL_SUPABASE_KEY,
    description: known?.description || 'Kurumsal Yoklama Sistemi'
  };
}

/**
 * Manually switches active institution slug.
 */
export function setActiveInstitution(slug: string): void {
  if (typeof localStorage !== 'undefined' && slug) {
    localStorage.setItem(INSTITUTION_STORAGE_KEY, slug.trim().toLowerCase());
  }
}

// Backward-compatible exports
export const INSTITUTIONS: Record<string, InstitutionConfig> = {
  default: getActiveInstitution(),
  kurum2: {
    id: 'kurum2',
    slug: 'kurum2',
    name: '2. Kurum',
    brandTitle: 'eYoklama · 2. Kurum',
    supabaseUrl: CANONICAL_SUPABASE_URL,
    supabaseKey: CANONICAL_SUPABASE_KEY
  }
};
export const SUPABASE_URL = CANONICAL_SUPABASE_URL;
export const SUPABASE_KEY = CANONICAL_SUPABASE_KEY;
