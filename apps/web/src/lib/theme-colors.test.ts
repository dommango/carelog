import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { themeColors } from './theme-colors';

const TOKEN_VARS: Record<keyof typeof themeColors, string> = {
  sand: '--sand',
  card: '--card',
  ink: '--ink',
  inkSoft: '--ink-soft',
  inkFaint: '--ink-faint',
  line: '--line',
  accent: '--accent',
  accentStrong: '--accent-strong',
  accentDeep: '--accent-deep',
  caregiver: '--caregiver',
  tier2: '--tier-2',
};

describe('themeColors', () => {
  it('mirrors tokens.css exactly', () => {
    const css = readFileSync(
      fileURLToPath(new URL('../styles/tokens.css', import.meta.url)),
      'utf8'
    );

    for (const [key, cssVar] of Object.entries(TOKEN_VARS)) {
      const match = css.match(new RegExp(`${cssVar}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
      expect(match, `${cssVar} not found as a hex value in tokens.css`).not.toBeNull();
      expect(match![1].toLowerCase(), `${cssVar} drifted from themeColors.${key}`).toBe(
        themeColors[key as keyof typeof themeColors]
      );
    }
  });
});
