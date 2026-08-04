// Formatting helpers.
//
// Money arrives as integer minor units and is formatted here — the browser
// never does arithmetic on money that matters, it only renders it.

export const money = (minor: number): string =>
  (minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const shortMoney = (minor: number): string => {
  const major = minor / 100;
  if (Math.abs(major) >= 1_000_000) return `${(major / 1_000_000).toFixed(1)}M`;
  if (Math.abs(major) >= 1_000) return `${(major / 1_000).toFixed(1)}k`;
  return major.toFixed(0);
};

export const percent = (bp: number, digits = 1): string => `${(bp / 100).toFixed(digits)}%`;

export const titleCase = (s: string): string =>
  s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
