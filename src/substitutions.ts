import { z } from 'zod';

import type { VocabularyRef } from './lookup.js';

/** Recipe-line alternatives and shared food defaults use the same shape. */
export const substitutionsParam = z
  .array(
    z
      .object({
        substitute_food: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .optional()
          .describe('Existing substitute food name, plural, alias, or UUID'),
        note: z
          .string()
          .trim()
          .max(1000)
          .optional()
          .describe(
            'Free-text alternative or a qualification on the substitute food'
          ),
      })
      .refine((value) => value.substitute_food !== undefined || !!value.note, {
        message: 'A substitution needs a substitute_food or a nonempty note.',
      })
  )
  .max(50)
  .optional()
  .describe(
    'Replacement alternatives; [] clears the list. Each entry needs substitute_food, note, or both.'
  );

export type Substitution = NonNullable<
  z.infer<typeof substitutionsParam>
>[number];

export function substitutionFoods(
  values: readonly Substitution[] | undefined
): string[] {
  return (values ?? []).flatMap((value) =>
    value.substitute_food === undefined ? [] : [value.substitute_food]
  );
}

/** Resolve before mapping: unknown foods must fail before any recipe is created. */
export function mapSubstitutions(
  values: readonly Substitution[],
  foods: ReadonlyMap<string, VocabularyRef>
): Record<string, unknown>[] {
  return values.map((value) => {
    const food =
      value.substitute_food === undefined
        ? undefined
        : foods.get(value.substitute_food.trim());
    if (value.substitute_food !== undefined && food === undefined) {
      throw new Error('Substitute food was not resolved before mapping');
    }
    return {
      ...(food === undefined ? {} : { substituteFoodId: food.id }),
      ...(value.note === undefined ? {} : { note: value.note }),
    };
  });
}
