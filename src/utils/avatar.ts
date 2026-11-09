/** Profile avatar choice (presentation only, stored on this device). */
export const AVATAR_KEY = 'hh_profile_avatar';
export const AVATAR_EVENT = 'hh-avatar-change';

export type AvatarId =
  | 'admin'
  | 'user'
  | 'initial'
  | 'droplets'
  | 'truck'
  | 'store'
  | 'package'
  | 'briefcase'
  | 'smile'
  | 'star'
  | 'leaf'
  | 'sun'
  | 'coffee'
  | 'rocket'
  | 'crown';

export const AVATAR_IDS: AvatarId[] = [
  'admin', 'user', 'initial', 'droplets', 'truck', 'store', 'package',
  'briefcase', 'smile', 'star', 'leaf', 'sun', 'coffee', 'rocket', 'crown',
];

export const DEFAULT_AVATAR: AvatarId = 'admin';

export function readAvatar(): AvatarId {
  try {
    const v = localStorage.getItem(AVATAR_KEY) as AvatarId | null;
    // Migrate legacy 'droplets' default to 'admin' person avatar
    if (!v || v === 'droplets') {
      return 'admin';
    }
    return AVATAR_IDS.includes(v) ? v : DEFAULT_AVATAR;
  } catch {
    return DEFAULT_AVATAR;
  }
}

export function writeAvatar(id: AvatarId): void {
  try {
    localStorage.setItem(AVATAR_KEY, id);
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
  window.dispatchEvent(new Event(AVATAR_EVENT));
}

export function subscribeAvatar(cb: () => void): () => void {
  window.addEventListener(AVATAR_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(AVATAR_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}
