/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing the workspace shared package (TS source) directly.
  transpilePackages: ["@shadow/shared"],
};

export default nextConfig;
