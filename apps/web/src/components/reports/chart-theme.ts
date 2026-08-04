import { themeColors } from '@/lib/theme-colors';

export const gridStroke = themeColors.line;

export const axisTick = { fill: themeColors.inkSoft, fontSize: 13 } as const;

export const seriesColors = {
  meals: themeColors.accent,
  hydration: themeColors.caregiver,
} as const;

export const tooltipStyles = {
  contentStyle: {
    background: themeColors.card,
    border: `1px solid ${themeColors.line}`,
    borderRadius: 10,
    fontFamily: 'Mulish, sans-serif',
    fontSize: 13,
  },
  labelStyle: { color: themeColors.ink, fontWeight: 700 },
  itemStyle: { color: themeColors.ink },
} as const;
