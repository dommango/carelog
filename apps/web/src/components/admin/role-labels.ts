/**
 * What each role is called and what it lets someone do, in the words a family
 * member would use. The caregivers list used to print the raw enum value
 * ("caregiver", "viewer"), and the invite form spelled the same three roles out
 * separately — so they could drift apart and say different things.
 */
export type RoleLabel = {
  id: 'caregiver' | 'viewer' | 'admin';
  label: string;
  can: string;
};

export const ROLE_LABELS: readonly RoleLabel[] = [
  { id: 'caregiver', label: 'Caregiver', can: 'can log care and see everything' },
  { id: 'viewer', label: 'Viewer', can: 'can read the log, but not add to it' },
  { id: 'admin', label: 'Admin', can: 'can also manage templates, schedules and people' },
];

export function roleLabel(role: string): string {
  return ROLE_LABELS.find((entry) => entry.id === role)?.label ?? role;
}
