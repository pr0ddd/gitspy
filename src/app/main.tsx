import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Boundary } from '@/widgets/Boundary';
import '@/i18n';
import '@/index.css';

if (import.meta.env.VITE_SPIKE === 'term') {
  void import('@/dev/termProbe').then((probe) => probe.mountProbe());
} else if (import.meta.env.VITE_SPIKE === 'acp') {
  void import('@/dev/acpProbe').then((probe) => probe.mountProbe());
} else if (import.meta.env.VITE_SPIKE === 'csp') {
  void import('@/dev/cspProbe').then((probe) => probe.mountProbe());
} else {
  if (import.meta.env.DEV) {
    void import('@/dev/dragProbe').then((probe) => probe.startDragProbe());
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Boundary>
        <App />
      </Boundary>
    </StrictMode>,
  );
}
