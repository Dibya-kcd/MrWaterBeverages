import React, { useSyncExternalStore } from 'react';
import {
  Briefcase, Coffee, Crown, Droplets, Leaf, Package, Rocket, Smile, Star, Store, Sun, Truck, User, UserCheck,
} from 'lucide-react';
import { AvatarId, readAvatar, subscribeAvatar } from '../../utils/avatar';

export const AVATAR_ICONS: Record<Exclude<AvatarId, 'initial'>, React.ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>> = {
  admin: UserCheck,
  user: User,
  droplets: Droplets,
  truck: Truck,
  store: Store,
  package: Package,
  briefcase: Briefcase,
  smile: Smile,
  star: Star,
  leaf: Leaf,
  sun: Sun,
  coffee: Coffee,
  rocket: Rocket,
  crown: Crown,
};

export const useAvatarId = (): AvatarId => useSyncExternalStore(subscribeAvatar, readAvatar, () => 'admin' as AvatarId);

/** Renders the chosen avatar icon (or the initial letter when "initial" is chosen). Fills its parent. */
export const UserAvatar: React.FC<{ initial: string; size?: number; id?: AvatarId }> = ({ initial, size = 18, id }) => {
  const chosen = useAvatarId();
  const pick = id ?? chosen;
  if (pick === 'initial') return <span aria-hidden="true">{initial}</span>;
  const Icon = AVATAR_ICONS[pick];
  return <Icon size={size} strokeWidth={2.2} aria-hidden={true} />;
};
