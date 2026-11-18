import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  fallbacks: {
    document: "/offline",
  },
  publicExcludes: ["!models/**/*"],
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        // Self-hosted CLIP vision model & ONNX Runtime WASM files
        urlPattern: /^\/models\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "local-ml-models",
          expiration: {
            maxEntries: 16,
            maxAgeSeconds: 90 * 24 * 60 * 60,
          },
        },
      },
      {
        // Cache Supabase Storage product images for offline thumbnails
        urlPattern:
          /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "product-images-cache",
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
      {
        // Never cache Supabase API / auth / storage requests
        urlPattern: /^https:\/\/[^/]+\.supabase\.co\/.*/i,
        handler: "NetworkOnly",
      },
      {
        // Never cache Next.js API routes
        urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
      {
        // HTML page navigations: try network with fast 1.5s fallback to cache
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "NetworkFirst",
        options: {
          cacheName: "pages-navigate",
          networkTimeoutSeconds: 1.5,
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
      {
        // App Router RSC payloads
        urlPattern: ({ request, sameOrigin, url }) =>
          sameOrigin &&
          !url.pathname.startsWith("/api/") &&
          request.headers.get("RSC") === "1",
        handler: "NetworkFirst",
        options: {
          cacheName: "pages-rsc",
          networkTimeoutSeconds: 1.5,
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
      {
        // Static JS and CSS
        urlPattern: /\.(?:js|css|less)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-assets",
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          },
        },
      },
      {
        // Static images
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-images",
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
      {
        // Static fonts
        urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-fonts",
          expiration: {
            maxEntries: 16,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer, webpack }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@stoprocent/bluetooth-hci-socket": false,
      "@stoprocent/noble": false,
      "xpc-connection": false,
      sharp: false,
      "onnxruntime-node": false,
    };
    if (!isServer) {
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /node_ble_impl|node_serial_impl/,
          require.resolve("./empty.js")
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
