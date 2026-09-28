import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/compass-api/:path*",
        destination: `${process.env.COMPASS_API_URL || "http://127.0.0.1:8000"}/api/v1/:path*`,
      },
    ];
  },
};
export default config;
