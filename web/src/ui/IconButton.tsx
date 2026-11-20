import type { ReactNode } from 'react';

export type IconButtonIcon =
  | 'copy'
  | 'check'
  | 'edit'
  | 'trash'
  | 'person-remove'
  | 'upload'
  | 'retry'
  | 'plus'
  | 'reset';

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const ICONS: Record<IconButtonIcon, ReactNode> = {
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" {...STROKE} />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" {...STROKE} />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" {...STROKE} />,
  edit: (
    <>
      <path d="M12 20h9" {...STROKE} />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" {...STROKE} />
    </>
  ),
  trash: (
    <path
      d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"
      {...STROKE}
    />
  ),
  'person-remove': (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...STROKE} />
      <circle cx="9" cy="7" r="4" {...STROKE} />
      <path d="M22 11h-6" {...STROKE} />
    </>
  ),
  upload: (
    <path
      d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
      {...STROKE}
    />
  ),
  retry: (
    <>
      <path d="M23 4v6h-6M1 20v-6h6" {...STROKE} />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" {...STROKE} />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" {...STROKE} />,
  reset: (
    <>
      <path d="M1 4v6h6" {...STROKE} />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" {...STROKE} />
    </>
  ),
};

type Props = {
  icon: IconButtonIcon;
  /** Shown as a hover tooltip and used as the accessible name — no visible text. */
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  className?: string;
};

/**
 * Icon-only action button. The wording lives in the hover tooltip
 * (`data-tip`, CSS in styles.css) and `aria-label` instead of on the button.
 */
export function IconButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
  className,
}: Props) {
  return (
    <button
      type="button"
      className={[
        'btn',
        'btn-ghost',
        'icon-btn',
        danger ? 'icon-btn-danger' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      data-tip={label}
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {ICONS[icon]}
      </svg>
    </button>
  );
}
