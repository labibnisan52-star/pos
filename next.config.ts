import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
});

const nextConfig: NextConfig = {
  webpack: (config, { isServer, webpack }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@stoprocent/bluetooth-hci-socket": false,
      "@stoprocent/noble": false,
      "xpc-connection": false,
    };
    if (!isServer) {
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /node_ble_impl|node_serial_impl/,
          require.resolve('./empty.js')
        )
      );
      
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        os: false,
        path: false,
        crypto: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default withPWA(nextConfig);
