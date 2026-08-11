import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/bahmni",
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
  experimental: { externalDir: false },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
    ] }];
  },
};

export default nextConfig;
