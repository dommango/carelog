import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CareLog',
    short_name: 'CareLog',
    description: 'Family care activity log',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6efe4',
    theme_color: '#fffdf9',
    icons: [
      {
        src: '/icon-192x192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-512x512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  };
}
