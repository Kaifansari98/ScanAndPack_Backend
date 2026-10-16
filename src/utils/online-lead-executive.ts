// Only pass active sales executives belonging to the lead's vendor and target store.
export function resolveOnlineLeadExecutive<T extends { id: number }>(executives: T[], configuredId: number | null): T | null {
  if (executives.length === 1) return executives[0];
  return executives.find((executive) => executive.id === configuredId) ?? null;
}
