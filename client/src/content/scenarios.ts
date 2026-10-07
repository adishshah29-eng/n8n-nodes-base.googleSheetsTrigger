import type { Scenario } from '../engine/types';

// Eager glob: scenarios are bundled into the app, so they are available offline with no fetch.
const modules = import.meta.glob<Scenario>('../../../content/scenarios/*.json', { eager: true, import: 'default' });

export const scenarios: Scenario[] = Object.values(modules).sort((a, b) => a.id.localeCompare(b.id));
