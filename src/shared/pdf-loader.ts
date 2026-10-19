/**
 * PDF Engine Dynamic Loader
 * Vibecoding-Safe Native DOM Architecture
 * Shared Utility Layer (Layer 0) - Zero dependency on higher tiers
 */

let cachedPdfMake: any = null;

/**
 * Lazily loads and initializes pdfMake with Roboto VFS fonts.
 * Works offline in PWA and in Node/test environments.
 */
export async function ensurePdfMake(): Promise<any> {
  const win = typeof window !== 'undefined' ? (window as any) : {};

  if (win.pdfMake && typeof win.pdfMake.createPdf === 'function') {
    return win.pdfMake;
  }

  if (cachedPdfMake && typeof cachedPdfMake.createPdf === 'function') {
    if (typeof window !== 'undefined') {
      (window as any).pdfMake = cachedPdfMake;
    }
    return cachedPdfMake;
  }

  try {
    // Dynamic import to keep initial bundle small and load on-demand
    const [pdfMakeModule, pdfFontsModule] = await Promise.all([
      import('pdfmake/build/pdfmake'),
      import('pdfmake/build/vfs_fonts')
    ]);

    const pdfMake = (pdfMakeModule as any).default || pdfMakeModule;
    const fonts = (pdfFontsModule as any).default || pdfFontsModule;
    const vfs = fonts?.pdfMake?.vfs || fonts?.vfs || fonts;

    if (vfs) {
      pdfMake.vfs = vfs;
    }

    cachedPdfMake = pdfMake;
    if (typeof window !== 'undefined') {
      (window as any).pdfMake = pdfMake;
    }

    return pdfMake;
  } catch (err) {
    console.error('[eYoklama] Error loading pdfMake module:', err);
    throw new Error('PDF modülü yüklenemedi.');
  }
}
