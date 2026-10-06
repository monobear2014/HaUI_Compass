import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  async redirects() {
    // There is no account recovery service in the student demo.
    return [
      { source: "/forgot-password", destination: "/login", permanent: false },
    ];
  },
};
export default config;
