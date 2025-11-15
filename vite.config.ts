
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Optimize build for better face-api.js support
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          faceapi: ['face-api.js'],
          firebase: ['firebase/app', 'firebase/storage'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  },
  // Configure server headers for better loading of model files
  optimizeDeps: {
    exclude: ['face-api.js'], // Prevent face-api.js from being pre-bundled
  },
  // Better handle of large model files
  css: {
    devSourcemap: true,
  },
}));
