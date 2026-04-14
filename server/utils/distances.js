/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DISTANCE CALCULATOR — uses state capital coordinates + Haversine formula
 *  No external API dependency.  Cache per origin-dest pair in memory (TTL 1h).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Approximate coordinates of each Nigerian state capital
const STATE_COORDS = {
  // South West
  'Lagos':           [6.5244,  3.3792],
  'Ogun':            [7.1475,  3.3619],
  'Oyo':             [7.3775,  3.9470],
  'Osun':            [7.7719,  4.5624],
  'Ondo':            [7.2526,  5.1931],
  'Ekiti':           [7.6230,  5.2210],

  // North Central
  'FCT (Abuja)':     [9.0765,  7.3986],
  'Kogi':            [7.7975,  6.7378],
  'Kwara':           [8.5000,  4.5500],
  'Plateau':         [9.9285,  8.8921],
  'Niger':           [9.6140,  6.5568],
  'Benue':           [7.7309,  8.5361],
  'Nasarawa':        [8.4920,  8.5227],

  // South East
  'Enugu':           [6.4584,  7.5464],
  'Anambra':         [6.2094,  7.0727],
  'Ebonyi':          [6.3249,  8.1137],
  'Imo':             [5.4836,  7.0339],
  'Abia':            [5.5287,  7.4862],

  // South South
  'Rivers':          [4.8156,  7.0498],
  'Delta':           [6.1970,  6.7356],
  'Akwa Ibom':       [5.0574,  7.9196],
  'Cross River':     [4.9517,  8.3220],
  'Bayelsa':         [4.9267,  6.2676],
  'Edo':             [6.3350,  5.6279],

  // North East
  'Borno':           [11.8333, 13.1500],
  'Adamawa':         [9.2035,  12.4954],
  'Yobe':            [11.7463, 11.9629],
  'Taraba':          [8.8882,  11.3599],
  'Bauchi':          [10.3100,  9.8439],
  'Gombe':           [10.2872, 11.1705],

  // North West
  'Kano':            [12.0022,  8.5920],
  'Kaduna':          [10.5227,  7.4382],
  'Katsina':         [12.9889,  7.6006],
  'Jigawa':          [11.7105,  9.3420],
  'Kebbi':           [12.4539,  4.1975],
  'Sokoto':          [13.0059,  5.2476],
  'Zamfara':         [12.1628,  6.6640],
};

// ── Haversine formula (returns km) ───────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R  = 6371;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dO = (lon2 - lon1) * Math.PI / 180;
  const a  =
    Math.sin(dL / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── In-memory distance cache (1 h TTL) ───────────────────────────────────────
const _distCache    = new Map();
const DIST_TTL_MS   = 3_600_000;

export function getDistanceKm(originState, destState) {
  const key = `${originState}||${destState}`;
  const cached = _distCache.get(key);
  if (cached && Date.now() - cached.ts < DIST_TTL_MS) return cached.km;

  const o = STATE_COORDS[originState];
  const d = STATE_COORDS[destState];

  if (!o) throw new Error(`No coordinates for origin state: ${originState}`);
  if (!d) throw new Error(`No coordinates for destination state: ${destState}`);

  const km = Math.round(haversine(o[0], o[1], d[0], d[1]));
  _distCache.set(key, { km, ts: Date.now() });
  return km;
}
