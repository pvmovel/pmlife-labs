// O conteúdo da demo, tipado (uma escola de idiomas inventada).
import raw from '../Content/world.json';
import type { Building } from '../Domain/Plaza';
import type { ItemStatus } from '../Domain/KeyboardList';
import type { EnrollMethod, EnrollStatus } from '../Domain/Enrollment';
import type { Language } from './i18n/I18n';

export type Texts = Record<Language, string>;
export interface Course {
  readonly id: string;
  readonly title: Texts;
}
export interface Phase {
  readonly id: string;
  readonly title: Texts;
  readonly status: ItemStatus;
  readonly requires?: string;
}
export interface Offer {
  readonly course: string;
  readonly method: EnrollMethod;
  readonly status: EnrollStatus;
}
export interface World {
  readonly school: Texts;
  readonly buildings: readonly Building[];
  readonly start: { x: number; y: number };
  readonly courses: readonly Course[];
  readonly phasesCourse: string;
  readonly phases: readonly Phase[];
  readonly offers: readonly Offer[];
}

export const WORLD = raw as World;
