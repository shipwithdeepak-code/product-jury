import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILD_LIMITATIONS,
  REQUIRED_LIMITATION_CONTENTS,
  STANDING_LIMITATIONS,
  limitationsCoverageGate,
} from '../src/integrity/standingLimitations';
import { StandingLimitations } from '../src/components/StandingLimitations';

/**
 * Group 13 of the Stage 1 brief: standing limitations presence.
 *
 * PRD v1.1.1 §53, TR-6, TR-10, TR-11 and §48's Trust gate. §53's own test is
 * behavioural — "a PM who has used the product three times can still say what
 * it cannot know" — which a unit test cannot assert. What it can assert is
 * that the five required contents are present, that the surface is permanent
 * rather than a first-run modal, and that this build's own gaps are stated.
 */

describe('13 · standing limitations', () => {
  it('covers all five contents §53 requires', () => {
    const gate = limitationsCoverageGate();
    expect(gate.passes, JSON.stringify(gate)).toBe(true);

    const covered = new Set(STANDING_LIMITATIONS.flatMap((p) => p.covers));
    for (const required of REQUIRED_LIMITATION_CONTENTS) {
      expect(covered.has(required), `missing: ${required}`).toBe(true);
    }
  });

  it('fails the gate when a required content is dropped', () => {
    const gate = limitationsCoverageGate(
      STANDING_LIMITATIONS.filter((p) => !p.covers.includes('what_the_confidence_ceiling_means'))
    );
    expect(gate.passes).toBe(false);
  });

  it('is present in the rendered interface without being opened', () => {
    const markup = renderToStaticMarkup(<StandingLimitations />);
    // The bar carries the hardest-to-misread limit even when closed, and the
    // control that opens the rest.
    expect(markup).toMatch(/one frame of your product and none of your users/);
    expect(markup).toMatch(/upper bound set by the evidence/);
    expect(markup).toMatch(/What this cannot know/);
  });

  it('is rendered on every surface, not per screen', () => {
    const app = readFileSync(join(__dirname, '..', 'src/App.tsx'), 'utf8');
    // It sits outside the tab switch, so it is present on the workspace, the
    // results, the refusal and the failure alike (§53: "reachable from every
    // surface without leaving it").
    const afterMain = app.slice(app.indexOf('</main>'));
    expect(afterMain).toContain('<StandingLimitations />');
  });

  it('is not a first-run modal, which §53 rules out explicitly', () => {
    const source = readFileSync(
      join(__dirname, '..', 'src/components/StandingLimitations.tsx'),
      'utf8'
    );
    // It opens only from its own control; nothing sets it open on mount.
    expect(source).toContain('useState(false)');
    expect(source).not.toMatch(/useState\(true\)/);
    expect(source).not.toMatch(/useEffect\(\s*\(\)\s*=>\s*\{\s*setIsOpen\(true\)/);
  });

  it('states what this build in particular does not do (TR-5, §51 always-8)', () => {
    expect(BUILD_LIMITATIONS.length).toBeGreaterThanOrEqual(4);

    const all = BUILD_LIMITATIONS.join(' ');
    // The four things Stage 1 leaves undone, each named where a PM would
    // otherwise read the interface as offering them.
    expect(all).toMatch(/does not yet refuse/i);
    expect(all).toMatch(/do not yet see each other/i);
    expect(all).toMatch(/binding ceiling/i);
    expect(all).toMatch(/Nothing is stored/i);
    expect(all).toMatch(/have not been evaluated/i);
  });

  it('is shown in the panel alongside the permanent text', () => {
    const source = readFileSync(
      join(__dirname, '..', 'src/components/StandingLimitations.tsx'),
      'utf8'
    );
    expect(source).toContain('BUILD_LIMITATIONS');
    expect(source).toContain('STANDING_LIMITATIONS');
  });
});
