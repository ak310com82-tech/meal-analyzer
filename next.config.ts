import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp はネイティブモジュールなのでバンドルせずに読み込む
  serverExternalPackages: ["sharp"],
  poweredByHeader: false,
};

export default nextConfig;
