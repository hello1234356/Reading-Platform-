import { useId } from 'react';
import vignette from '../../assets/seasonal/october-library-vignette.webp';

// One composed scene, clipped by the existing hero surface. Silent, static,
// noninteractive, and revealed only through the centralized October CSS layer.
export default function OctoberDecorations() {
  const threadId = useId();
  return <span className="october-decoration october-hero" aria-hidden="true">
    <svg className="october-corner-web" viewBox="0 0 180 170" fill="none" focusable="false">
      <defs>
        <linearGradient id={threadId} x1="165" y1="5" x2="38" y2="132" gradientUnits="userSpaceOnUse">
          <stop stopColor="#715744" stopOpacity="0.8" />
          <stop offset="0.65" stopColor="#715744" stopOpacity="0.5" />
          <stop offset="1" stopColor="#715744" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${threadId})`} strokeWidth="0.85" strokeLinecap="round">
        <path d="M188-9C141 3 84 5 18 11M188-9C135 5 77 24 9 46M188-9C143 18 94 54 27 98M188-9C164 34 110 88 62 133M188-9C178 36 139 104 113 158M188-9C192 49 175 116 169 175" />
        <path d="M156 0Q157 7 158 14Q168 14 170 23Q178 23 179 32M130 3Q131 16 135 25Q146 24 149 40Q160 37 165 55Q176 49 183 60M101 5Q102 25 107 36Q121 39 127 58Q144 52 145 84Q163 73 178 92M72 7Q75 36 79 46Q100 52 100 80Q123 73 124 111Q149 93 174 124M43 9Q47 43 52 57Q72 60 74 96Q95 96 96 140Q126 121 171 154" />
        <path d="M177 38q-5 9-6 18M98 80q-9 11-16 19" strokeWidth="0.55" />
      </g>
    </svg>
    <img className="october-vignette" src={vignette} width="768" height="512" alt="" decoding="async" />
  </span>;
}
