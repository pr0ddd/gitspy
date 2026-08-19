import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Banner, useBannerUpdate } from '@/widgets/Banner';
import { BannerGallery } from './BannerGallery';
import * as ipc from '@/shared/api/ipc';
import '@/shared/config/i18n';
import '@/index.css';

function BannerWindow() {
  return <Banner update={useBannerUpdate()} />;
}

const gallery = new URLSearchParams(window.location.search).has('gallery');
const root = document.getElementById('root')!;

if (gallery) {
  createRoot(root).render(
    <StrictMode>
      <BannerGallery />
    </StrictMode>,
  );
} else {
  createRoot(root).render(
    <StrictMode>
      <BannerWindow />
    </StrictMode>,
  );
  requestAnimationFrame(() => {
    requestAnimationFrame(() => void ipc.bannerReady().catch(() => undefined));
  });
}
