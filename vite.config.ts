import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [react()],
      define: {
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || 'AIzaSyBW3xtitMUiJTOsSD22SPB4TW9sUPy983M'),
        'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || 'AIzaSyBW3xtitMUiJTOsSD22SPB4TW9sUPy983M'),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || 'AIzaSyBW3xtitMUiJTOsSD22SPB4TW9sUPy983M')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
