import React from 'react';
import { BarChart3, Bell, Cloud, Droplets, Package, Receipt, ShieldCheck, Smartphone, Tag, Truck, Users, Wallet } from 'lucide-react';
import type { FeatureIcon } from '../../constants/landingContent';

const MAP: Record<FeatureIcon, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  receipt: Receipt, package: Package, tag: Tag, truck: Truck, shield: ShieldCheck, users: Users,
  chart: BarChart3, wallet: Wallet, droplets: Droplets, bell: Bell, phone: Smartphone, cloud: Cloud,
};

export const LandingIcon: React.FC<{ name: FeatureIcon; size?: number }> = ({ name, size = 22 }) => {
  const Icon = MAP[name] || Package;
  return <Icon size={size} strokeWidth={2} />;
};
