import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadMedia } from '../lib/media';

type Props = {
  supabase: SupabaseClient | null;
  label: string;
  folder: string;
  value?: string | null;
  onChange: (url: string | null) => void;
  setNotice: (v: string) => void;
  disabled?: boolean;
};

export default function ImageField({ supabase, label, folder, value, onChange, setNotice, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file || disabled) return;
    if (!supabase) {
      const local = URL.createObjectURL(file);
      onChange(local);
      setNotice('Image attached in demo mode (not uploaded).');
      return;
    }
    setBusy(true);
    const result = await uploadMedia(supabase, file, folder);
    setBusy(false);
    if ('error' in result) setNotice(result.error);
    else {
      onChange(result.url);
      setNotice('Image uploaded.');
    }
  };

  return (
    <div className="image-field">
      <span className="image-field-label">{label}</span>
      <div className="image-field-body">
        <div className="image-field-preview">
          {value ? <img src={value} alt="" /> : <ImagePlus size={22} />}
        </div>
        <div className="image-field-actions">
          <button
            className="outline-btn small"
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={14} /> {busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}
          </button>
          {value && (
            <button
              className="outline-btn small"
              type="button"
              disabled={disabled || busy}
              onClick={() => onChange(null)}
            >
              <Trash2 size={14} /> Clear
            </button>
          )}
          <input
            ref={inputRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              void pick(f);
            }}
          />
        </div>
      </div>
    </div>
  );
}
