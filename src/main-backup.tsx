// Backup of original main.tsx
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { ThemeProvider } from '@/hooks/use-theme'
import App from './App.tsx'
import './index.css'

// Initialize application
console.log('Starting app initialization...');

try {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error('Root element not found');
  }
  
  console.log('Creating React root...');
  createRoot(root).render(
    <StrictMode>
      <ThemeProvider defaultTheme="dark">
        <App />
      </ThemeProvider>
    </StrictMode>
  );
  console.log('App rendered successfully');
} catch (error) {
  console.error('Failed to initialize app:', error);
}
