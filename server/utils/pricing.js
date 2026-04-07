/**
 * JMove Logistics Constants (Direction-Based)
 * ─────────────────────────────────────────────────────────────
 */

export const DIRECTIONS = [
  'North West', 'North East', 'North Central', 
  'South West', 'South East', 'South South'
];

export const STATE_DIRECTIONS = {
  // South West
  lagos: { name: 'Lagos', direction: 'South West' },
  ogun:  { name: 'Ogun', direction: 'South West' },
  oyo:   { name: 'Oyo', direction: 'South West' },
  osun:  { name: 'Osun', direction: 'South West' },
  ondo:  { name: 'Ondo', direction: 'South West' },
  ekiti: { name: 'Ekiti', direction: 'South West' },
  
  // North Central (including FCT)
  fct:      { name: 'FCT (Abuja)', direction: 'North Central' },
  kogi:     { name: 'Kogi', direction: 'North Central' },
  kwara:    { name: 'Kwara', direction: 'North Central' },
  plateau:  { name: 'Plateau', direction: 'North Central' },
  niger:    { name: 'Niger', direction: 'North Central' },
  benue:    { name: 'Benue', direction: 'North Central' },
  nasarawa: { name: 'Nasarawa', direction: 'North Central' },
  
  // South East
  enugu:   { name: 'Enugu', direction: 'South East' },
  anambra: { name: 'Anambra', direction: 'South East' },
  ebonyi:  { name: 'Ebonyi', direction: 'South East' },
  imo:     { name: 'Imo', direction: 'South East' },
  abia:    { name: 'Abia', direction: 'South East' },
  
  // South South
  rivers:      { name: 'Rivers', direction: 'South South' },
  delta:       { name: 'Delta', direction: 'South South' },
  akwa_ibom:   { name: 'Akwa Ibom', direction: 'South South' },
  cross_river: { name: 'Cross River', direction: 'South South' },
  bayelsa:     { name: 'Bayelsa', direction: 'South South' },
  edo:         { name: 'Edo', direction: 'South South' },
  
  // North East
  borno:   { name: 'Borno', direction: 'North East' },
  adamawa: { name: 'Adamawa', direction: 'North East' },
  yobe:    { name: 'Yobe', direction: 'North East' },
  taraba:  { name: 'Taraba', direction: 'North East' },
  bauchi:  { name: 'Bauchi', direction: 'North East' },
  gombe:   { name: 'Gombe', direction: 'North East' },
  
  // North West
  kano:    { name: 'Kano', direction: 'North West' },
  kaduna:  { name: 'Kaduna', direction: 'North West' },
  katsina: { name: 'Katsina', direction: 'North West' },
  jigawa:  { name: 'Jigawa', direction: 'North West' },
  kebbi:   { name: 'Kebbi', direction: 'North West' },
  sokoto:  { name: 'Sokoto', direction: 'North West' },
  zamfara: { name: 'Zamfara', direction: 'North West' },
};

export const getCityList = () =>
  Object.entries(STATE_DIRECTIONS).map(([key, val]) => ({ key, ...val }));

