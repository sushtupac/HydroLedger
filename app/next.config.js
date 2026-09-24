/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: { serverComponentsExternalPackages: ["@coral-xyz/anchor", "@solana/web3.js", "@solana/spl-token", "tweetnacl"] },
  webpack: (config) => { config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, os: false }; return config; },
};
