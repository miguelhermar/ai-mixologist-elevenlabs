import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Recipe thumbnails come from TheCocktailDB (Phase 2/3 recipe card).
    remotePatterns: [
      { protocol: "https", hostname: "www.thecocktaildb.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
