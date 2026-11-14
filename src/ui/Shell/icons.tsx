import type { ReactNode } from 'react';

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="shell-ic"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const CloseIcon = () => (
  <Svg>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </Svg>
);
export const CollapseIcon = () => (
  <Svg>
    <path d="M8.5 3.5L4 8l4.5 4.5M12.5 3.5L8 8l4.5 4.5" />
  </Svg>
);
export const ExpandIcon = () => (
  <Svg>
    <path d="M7.5 3.5L12 8l-4.5 4.5M3.5 3.5L8 8l-4.5 4.5" />
  </Svg>
);
export const ShareIcon = () => (
  <Svg>
    <path d="M8 10V2.5M5 5.5l3-3 3 3M3 9v4.5h10V9" />
  </Svg>
);
export const MenuIcon = () => (
  <Svg>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </Svg>
);
export const UpIcon = () => (
  <Svg>
    <path d="M3.5 10l4.5-4.5 4.5 4.5" />
  </Svg>
);
export const DownIcon = () => (
  <Svg>
    <path d="M3.5 6l4.5 4.5L12.5 6" />
  </Svg>
);
