/**
 * SEO.jsx — Reusable per-page meta tag manager
 *
 * Uses react-helmet-async to inject <title>, <meta>, canonical,
 * Open Graph, Twitter Card, and optional noindex into <head>.
 *
 * Usage:
 *   <SEO
 *     title="Track Your Shipment | JMove Logistics"
 *     description="Enter your waybill number to track your JMove Logistics shipment in real time across Nigeria."
 *     canonical="https://jmovelogistics.com/track"
 *   />
 *
 * For private/auth pages use:  <SEO noindex />
 */

import { Helmet } from 'react-helmet-async';

const SITE_NAME    = 'JMove Logistics';
const BASE_URL     = 'https://www.jmovelogistics.com';
const DEFAULT_IMG  = `${BASE_URL}/og-image.jpg`;   // 1200×630 social share image

export default function SEO({
  title,
  description,
  canonical,
  image      = DEFAULT_IMG,
  noindex    = false,
  type       = 'website',
  jsonLd     = null,          // pass a plain JS object for JSON-LD injection
}) {
  const fullTitle = title
    ? `${title} | ${SITE_NAME}`
    : `${SITE_NAME} — On Time. Everytime. | Nigeria Haulage & Logistics`;

  const fullCanonical = canonical ? `${BASE_URL}${canonical}` : null;

  return (
    <Helmet>
      {/* ── Primary ── */}
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {noindex
        ? <meta name="robots" content="noindex, nofollow" />
        : <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
      }
      {fullCanonical && <link rel="canonical" href={fullCanonical} />}

      {/* ── Open Graph ── */}
      <meta property="og:type"        content={type} />
      <meta property="og:site_name"   content={SITE_NAME} />
      {fullTitle    && <meta property="og:title"       content={fullTitle} />}
      {description  && <meta property="og:description" content={description} />}
      {fullCanonical && <meta property="og:url"        content={fullCanonical} />}
      <meta property="og:image"       content={image} />
      <meta property="og:image:width"  content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale"      content="en_NG" />

      {/* ── Twitter Card ── */}
      <meta name="twitter:card"        content="summary_large_image" />
      <meta name="twitter:site"        content="@JMoveLogistics" />
      {fullTitle    && <meta name="twitter:title"       content={fullTitle} />}
      {description  && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image"       content={image} />

      {/* ── JSON-LD structured data ── */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
