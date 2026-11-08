import { describe, expect, it } from 'vitest';
import { validateImageFile } from './media';

describe('validateImageFile', () => {
  it('accepts png under size limit', () => {
    const file = new File([new Uint8Array(100)], 'logo.png', { type: 'image/png' });
    expect(validateImageFile(file)).toBeNull();
  });

  it('rejects unsupported mime', () => {
    const file = new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' });
    expect(validateImageFile(file)).toMatch(/PNG/);
  });

  it('rejects oversized files', () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    expect(validateImageFile(file)).toMatch(/2 MB/);
  });
});
