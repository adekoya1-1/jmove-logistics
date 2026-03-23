/**
 * JMove Logistics — Logo Component
 * Uses the actual logo image files served from /public/
 * variant: "orange-white" | "dark" | "white-bg"
 */
export default function JMoveLogo({ variant = 'dark', height = 36, className = '' }) {
  const src = variant === 'orange-white' || variant === 'white'
    ? '/logo-orange-white.png'
    : '/logo-dark.png';

  // For white variant on dark bg, show the orange-white version
  return (
    <img
      src={src}
      alt="JMove Logistics"
      height={height}
      className={className}
      style={{
        height,
        width: 'auto',
        objectFit: 'contain',
        display: 'block',
        // Remove jpeg white bg for dark variant using mix-blend if needed
        ...(variant === 'sidebar' ? { filter: 'brightness(0) invert(1)' } : {}),
      }}
    />
  );
}
