import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // عنوان الخادم قابل للتغيير عبر .env (VITE_API_TARGET) بدل تعديل الملف.
  const apiTarget = env.VITE_API_TARGET || "http://127.0.0.1:8010";

  return {
    resolve: {
      preserveSymlinks: true,
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-editor": [
              "@tiptap/react",
              "@tiptap/starter-kit",
              "@tiptap/extension-placeholder",
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: false,
        },
      },
    },
  };
});
