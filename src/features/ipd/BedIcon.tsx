interface Props {
  className?: string;
  decorative?: boolean;
}

export function BedIcon({ className, decorative = true }: Props) {
  return <svg
    className={className}
    viewBox="0 0 32 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden={decorative || undefined}
    role={decorative ? undefined : "img"}
  >
    {!decorative && <title>Cama</title>}
    <path d="M3 3v18M29 11v10M3 17h26" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 9.5h7.5c2.2 0 4 1.8 4 4V17H5V9.5Z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M16.5 12h8.2c2.4 0 4.3 1.9 4.3 4.3v.7H16.5v-5Z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M7 21v-4M26 21v-4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>;
}
