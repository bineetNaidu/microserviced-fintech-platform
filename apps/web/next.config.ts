import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@fintech/shared-types', '@fintech/shared-errors', '@fintech/shared-config'],
};

export default nextConfig;
