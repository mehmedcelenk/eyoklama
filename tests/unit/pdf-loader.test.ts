/**
 * Unit Tests for PDF Engine Loader Subsystem
 * Vibecoding-Safe Native DOM Architecture
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensurePdfMake } from '../../src/shared/pdf-loader';

describe('PDF Loader Subsystem (ensurePdfMake)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses existing window.pdfMake if available', async () => {
    const mockPdfMake = {
      createPdf: vi.fn().mockReturnValue({ download: vi.fn() })
    };
    (window as any).pdfMake = mockPdfMake;

    const instance = await ensurePdfMake();
    expect(instance).toBe(mockPdfMake);
    expect(instance.createPdf).toBeDefined();
  });

  it('loads pdfMake and attaches roboto vfs fonts if window.pdfMake is not set', async () => {
    delete (window as any).pdfMake;

    const instance = await ensurePdfMake();
    expect(instance).toBeDefined();
    expect(typeof instance.createPdf).toBe('function');
    expect(instance.vfs).toBeDefined();
    expect(Object.keys(instance.vfs).length).toBeGreaterThan(0);
    expect((window as any).pdfMake).toBe(instance);
  });
});
