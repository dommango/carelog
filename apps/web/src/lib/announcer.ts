type AnnouncementListener = (message: string) => void;

const listeners = new Set<AnnouncementListener>();

export function announce(message: string): void {
  for (const listener of listeners) {
    listener(message);
  }
}

export function subscribeToAnnouncements(listener: AnnouncementListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
