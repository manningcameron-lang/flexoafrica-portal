// Plate catalog used by the public configurator.
// Three tiers: Crystal (premium HD), Surface Engineered (mid-tier), Standard.
// Fourteen specs total. Brand names intentionally not exposed publicly.

// Default public list rate, in ZAR per cm squared.
// PLACEHOLDER - Cam to set the real value.
export const PUBLIC_SELL_RATE_PER_CM2 = 0.99;

// Express (rush) uplift, percent on top of base.
export const RUSH_UPLIFT_PERCENT = 25;

// VAT percent.
export const VAT_PERCENT = 15;

export const TIERS = ["Crystal", "Surface Engineered", "Standard"];

// Thickness conversions: thou to mm. (1 thou = 0.0254 mm)
export const PLATE_TYPES = [
  // Crystal tier (premium HD photopolymer)
  { id: "C-45",  tier: "Crystal", name: "Crystal 45 thou", thicknessMm: 1.14, useCase: "Fine detail labels, premium flexible packaging" },
  { id: "C-67",  tier: "Crystal", name: "Crystal 67 thou", thicknessMm: 1.70, useCase: "Premium flexible packaging" },

  // Surface Engineered tier (mid-grade)
  { id: "SE-45",  tier: "Surface Engineered", name: "Surface Engineered 45 thou",  thicknessMm: 1.14, useCase: "Cleaner ink lay, fine-line packaging" },
  { id: "SE-67",  tier: "Surface Engineered", name: "Surface Engineered 67 thou",  thicknessMm: 1.70, useCase: "Mid-thickness flexible packaging" },
  { id: "SE-100", tier: "Surface Engineered", name: "Surface Engineered 100 thou", thicknessMm: 2.54, useCase: "Corrugated, board" },
  { id: "SE-112", tier: "Surface Engineered", name: "Surface Engineered 112 thou", thicknessMm: 2.84, useCase: "Heavier flexible, light corrugated" },
  { id: "SE-125", tier: "Surface Engineered", name: "Surface Engineered 125 thou", thicknessMm: 3.18, useCase: "Corrugated, post-print" },

  // Standard tier (digital photopolymer)
  { id: "S-45",  tier: "Standard", name: "Standard 45 thou",  thicknessMm: 1.14, useCase: "General flexible packaging, labels" },
  { id: "S-67",  tier: "Standard", name: "Standard 67 thou",  thicknessMm: 1.70, useCase: "Mid-thickness flexible packaging" },
  { id: "S-100", tier: "Standard", name: "Standard 100 thou", thicknessMm: 2.54, useCase: "Corrugated, board" },
  { id: "S-112", tier: "Standard", name: "Standard 112 thou", thicknessMm: 2.84, useCase: "Heavier flexible, light corrugated" },
  { id: "S-125", tier: "Standard", name: "Standard 125 thou", thicknessMm: 3.18, useCase: "Corrugated, post-print" },
  { id: "S-185", tier: "Standard", name: "Standard 185 thou", thicknessMm: 4.70, useCase: "Heavy corrugated" },
  { id: "S-250", tier: "Standard", name: "Standard 250 thou", thicknessMm: 6.35, useCase: "Thick corrugated, specialty" },
];

export const SUBSTRATE_OPTIONS = [
  { id: "film", label: "Flexible film" },
  { id: "label", label: "Label stock" },
  { id: "corrugated", label: "Corrugated" },
  { id: "paper", label: "Paper or board" },
  { id: "other", label: "Other" },
];
