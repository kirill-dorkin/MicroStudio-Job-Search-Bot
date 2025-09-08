/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["*"] }
  },
  transpilePackages: [
    '@jobspy/storage',
    '@jobspy/shared-texts',
    '@jobspy/jobspy-js',
    '@jobspy/bot-logic',
    '@jobspy/fx'
  ]
};

export default nextConfig;
