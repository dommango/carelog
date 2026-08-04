import { describe, expect, it } from 'vitest';
import { Role } from '@carelog/db';
import { ROLE_LABELS, roleLabel } from '@/components/admin/role-labels';

describe('roleLabel', () => {
  it('covers every role the database can hold', () => {
    const covered = ROLE_LABELS.map((entry) => entry.id).sort();
    expect(covered).toEqual(Object.values(Role).sort());
  });

  it('names each role the way the invite form offers it', () => {
    expect(roleLabel('caregiver')).toBe('Caregiver');
    expect(roleLabel('viewer')).toBe('Viewer');
    expect(roleLabel('admin')).toBe('Admin');
  });

  it('shows an unknown role as-is rather than mislabelling it', () => {
    expect(roleLabel('nurse')).toBe('nurse');
  });
});
