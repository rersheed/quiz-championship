import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'media';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

export function validateImageFile(file: File): string | null {
  if (!ALLOWED.has(file.type)) return 'Use PNG, JPEG, WebP, GIF, or SVG.';
  if (file.size > MAX_BYTES) return 'Image must be 2 MB or smaller.';
  return null;
}

function extensionFor(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName) && fromName.length <= 5) return fromName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  if (file.type === 'image/svg+xml') return 'svg';
  return 'bin';
}

/** Upload an image to the public media bucket and return its public URL. */
export async function uploadMedia(
  supabase: SupabaseClient,
  file: File,
  folder: string,
): Promise<{ url: string } | { error: string }> {
  const invalid = validateImageFile(file);
  if (invalid) return { error: invalid };

  const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '') || 'misc';
  const path = `${safeFolder}/${crypto.randomUUID()}.${extensionFor(file)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) return { error: 'Upload succeeded but public URL was missing.' };
  return { url: data.publicUrl };
}
