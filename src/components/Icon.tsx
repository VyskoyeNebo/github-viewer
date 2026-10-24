import type { CSSProperties } from 'react';

export function Icon({ name, size = 20, className, style }: { name: 'github' | 'repo' | 'refresh' | 'logout' | 'lock' | 'star' | 'search' | 'arrow' | 'shield'; size?: number; className?: string; style?: CSSProperties }) {
  const paths = {
    github: <><path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7M15 22v-3.8c0-1 .1-1.5-.5-2.1 3.3-.4 6.8-1.6 6.8-7.4 0-1.6-.6-2.9-1.5-3.9.1-.4.6-1.9-.1-3.8 0 0-1.2-.4-3.9 1.5a13.3 13.3 0 0 0-7.1 0C6 0.6 4.8 1 4.8 1c-.7 1.9-.3 3.4-.1 3.8C3.7 5.8 3.1 7.1 3.1 8.7c0 5.8 3.5 7 6.8 7.4-.4.4-.6 1-.6 1.8V22" /></>,
    repo: <><path d="M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 17h16M7 7h6M7 10h4" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2l1 4M4 12l1 4a8 8 0 0 0 13 2" /></>,
    logout: <><path d="M9 4H4v16h5M10 12h11M17 8l4 4-4 4" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    shield: <><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name]}</svg>;
}
