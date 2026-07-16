import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { FormView } from '../../components/ui/FormView';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import type { User } from '../../types';
import { getMe, updateMe, uploadMyPhoto, resolvePhotoUrl } from '../../api/userManagementApi';
import { ApiError } from '../../api/client';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function MyProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMe().then(setUser).catch((e) => setError(e.message));
  }, []);

  if (!user) return <div>Loading...</div>;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await updateMe({ name: user.name, address: user.address ?? undefined, mobile: user.mobile ?? undefined });
      setUser(updated);
      setSaved(true);
      setError('');
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_PHOTO_BYTES) {
      setError('Photo must be 5MB or smaller.');
      return;
    }

    setUploading(true);
    try {
      const updated = await uploadMyPhoto(file);
      setUser(updated);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  };

  const photoUrl = resolvePhotoUrl(user.photoUrl);

  return (
    <FormView title="My Profile" actions={<Button onClick={handleSave} loading={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>}>
      <div className="p-6 space-y-6 max-w-xl">
        {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 rounded-lg">{error}</div>}
        {saved && <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 p-3 rounded-lg">Profile updated.</div>}

        <div className="flex items-center gap-4">
          <div className="relative">
            {photoUrl ? (
              <img src={photoUrl} alt={user.name} className="w-20 h-20 rounded-full object-cover border border-border" />
            ) : (
              <Avatar name={user.name} className="w-20 h-20 text-xl" />
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-50"
              aria-label="Change photo"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handlePhotoSelected} />
          </div>
          {uploading && <span className="text-sm text-foreground/60">Uploading...</span>}
        </div>

        <Input label="Name" value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} />
        <Input label="Address" value={user.address ?? ''} onChange={(e) => setUser({ ...user, address: e.target.value })} />
        <Input label="Mobile Number" value={user.mobile ?? ''} onChange={(e) => setUser({ ...user, mobile: e.target.value })} />
        <Input label="Email (read-only)" value={user.email} disabled />
        <Input label="Position (set by Admin only)" value={user.position ?? ''} disabled />
      </div>
    </FormView>
  );
}
