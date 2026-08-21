import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
  optimizeDeps: {
    // El paquete compartido es código nuestro, no una dependencia externa: si
    // Vite lo pre-empaqueta, se queda con una copia vieja y la pantalla se cae
    // al añadir algo nuevo a `shared`. Excluyéndolo se lee siempre al día.
    exclude: ['@geovanny/shared'],
  },
  server: {
    port: 5173,
    // El cliente nunca llama a una API externa: todo pasa por nuestro backend (§43).
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Separar vendor mantiene el bundle inicial bajo el presupuesto
        // de 180 KB gzip (ARCHITECTURE.md §7).
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
