import type { SVGProps } from 'react';

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconStar({
  filled = false,
  ...props
}: SVGProps<SVGSVGElement> & { filled?: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden
      {...props}
    >
      <path
        d="M8 1.8l1.86 3.97 4.34.58-3.17 3.02.8 4.31L8 11.6l-3.83 2.08.8-4.31L1.8 6.35l4.34-.58L8 1.8z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconChev({
  dir = 'right',
  ...props
}: SVGProps<SVGSVGElement> & { dir?: 'right' | 'down' | 'up' | 'left' }) {
  const rot = dir === 'down' ? 90 : dir === 'left' ? 180 : dir === 'up' ? -90 : 0;
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      style={{ transform: `rotate(${rot}deg)`, transition: 'transform 120ms' }}
      {...props}
    >
      <path
        d="M3.5 2l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconTerm(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden {...props}>
      <path
        d="M2 3l3 3-3 3M6 10h6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconEdit(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden {...props}>
      <path
        d="M9 2.5l2.5 2.5L4 12.5H1.5V10L9 2.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconHistory(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden {...props}>
      <path
        d="M2.3 6.5a4.7 4.7 0 109.4 0 4.7 4.7 0 00-9.4 0zM7 4v2.7l1.7 1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.5 4.5l1-1.5 1.5 1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconPlay(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden {...props}>
      <path d="M2 1.5v7l6-3.5-6-3.5z" />
    </svg>
  );
}

export function IconPause(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden {...props}>
      <rect x="2" y="1.5" width="2" height="7" />
      <rect x="6" y="1.5" width="2" height="7" />
    </svg>
  );
}

export function IconHelp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden {...props}>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5.4 5.3c.2-1 1.1-1.5 2-1.3.9.2 1.4 1 1.1 1.8-.2.6-.8.9-1.2 1.1-.3.2-.4.5-.4.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="7" cy="10" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden {...props}>
      <circle cx="7" cy="7" r="2.1" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7 1.3v1.4M7 11.3v1.4M12.7 7h-1.4M2.7 7H1.3M10.6 3.4l-1 1M4.4 9.6l-1 1M10.6 10.6l-1-1M4.4 4.4l-1-1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden {...props}>
      <path d="M5 1.5v7M1.5 5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconX(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden {...props}>
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconFocus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden {...props}>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="7" cy="7" r="1.4" fill="currentColor" />
      <path
        d="M7 1v1.6M7 11.4V13M1 7h1.6M11.4 7H13"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
