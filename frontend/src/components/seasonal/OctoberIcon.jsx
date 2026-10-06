// A small hand-inked pumpkin glyph. Asymmetric lobes and fine hatching match
// the hero's storybook illustration without sacrificing rating readability.
export default function OctoberIcon({ className = '' }) {
  return <svg className={`october-icon ${className}`} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path className="pumpkin-stem" d="M29.8 20c-.6-5.3-1.2-9.2 4.9-13.8l4 3.3c-4.8 2.6-5.4 6.1-4.2 10.9Z" />
    <path className="pumpkin-body" d="M31.1 21.1c-6.2-4.8-12.5-3.9-17.3.2C7.9 23.1 4.5 29.8 5.3 38.3 4.8 48.5 13.8 55.1 23.8 55.8c3.1 1.2 6.5.5 8.7-.3 5.1 1.6 10.8.7 14.4-1.9 8.5-2.4 12.6-9 11.5-17.7.8-7.7-3.6-13.6-8.3-15-5.9-4.6-12.6-4.1-19 .2Z" />
    <path className="pumpkin-rib" d="M26.8 21.2c-7.1 8-8.3 24.3-2.1 32.4m12.1-32.8c6.5 9 9.3 23.1 3 33.3M31.3 22.8c-1.4 8.2-.2 21.4 1.1 30.6M17.2 24.4c-5.6 6.4-5.5 18.8-1.1 25.3m33-25c4.4 5.4 6 16.7 1.5 24.1" />
    <path className="pumpkin-hatching" d="m10.5 39 2 4m-1-9 1.2 3m4.6 10 2.2 3m26.3-.4 2.1-2.7m4.6-9 .4 3" />
  </svg>;
}
