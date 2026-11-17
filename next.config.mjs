/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["pg", "ioredis", "bullmq", "@azure/msal-node"],
  },
};

export default nextConfig;
