import { ImageResponse } from 'next/og';
export const alt = 'Clientlane — Keep client projects moving';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        background: '#f7f8f5',
        width: '100%',
        height: '100%',
        padding: '70px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: '#172b36',
      }}
    >
      <div style={{ fontSize: 36, display: 'flex' }}>clientlane.</div>
      <div
        style={{
          fontSize: 76,
          fontWeight: 700,
          lineHeight: 1.05,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <span>Great client work.</span>
        <span style={{ color: '#116558' }}>Less back-and-forth.</span>
      </div>
      <div style={{ fontSize: 24, display: 'flex' }}>
        Requests · Deliveries · Approvals · A clear next action
      </div>
    </div>,
    { ...size },
  );
}
