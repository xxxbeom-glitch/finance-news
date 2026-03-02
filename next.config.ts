import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow larger request bodies for PDF/image uploads (10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
