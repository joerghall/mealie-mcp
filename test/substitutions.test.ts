import { afterEach, describe, expect, it, vi } from 'vitest';

import { foodSummary, recipeDetail } from '../src/shape.js';
import {
  callsOf,
  callText,
  confirmed,
  connect,
  GENERIC,
  mockFetch,
} from './harness.js';

const PRIMARY = { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Milk' };
const ALTERNATIVE = {
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  name: 'Oat milk',
  aliases: [{ name: 'oat drink' }],
};
afterEach(() => vi.restoreAllMocks());

describe('ingredient substitutions', () => {
  it('resolves food names and aliases before creating a recipe and writes food and note alternatives', async () => {
    const spy = mockFetch([
      PRIMARY,
      { items: [ALTERNATIVE] },
      'substitution-recipe',
      GENERIC,
    ]);
    const { isError } = await callText(await connect(), 'create_recipe', {
      name: 'Substitution recipe',
      ingredients: [
        {
          quantity: 2,
          food: PRIMARY.id,
          substitutions: [
            { substitute_food: 'oat drink', note: 'Unsweetened' },
            { note: 'Water in a pinch' },
          ],
        },
      ],
    });
    expect(isError).toBe(false);
    const calls = callsOf(spy);
    expect(calls.map((call) => call.method)).toEqual([
      'GET',
      'GET',
      'POST',
      'PATCH',
    ]);
    expect(calls[3]!.body).toMatchObject({
      recipeIngredient: [
        {
          food: PRIMARY,
          substitutions: [
            { substituteFoodId: ALTERNATIVE.id, note: 'Unsweetened' },
            { note: 'Water in a pinch' },
          ],
        },
      ],
    });
  });

  it('applies recipe substitution replacements only after confirmation and supports clearing', async () => {
    const spy = mockFetch([
      ALTERNATIVE,
      GENERIC,
      ALTERNATIVE,
      GENERIC,
      GENERIC,
      GENERIC,
      GENERIC,
      GENERIC,
    ]);
    const client = await connect();
    expect(
      (
        await confirmed(client, 'update_recipe', {
          recipe: 'substitution-recipe',
          ingredients: [
            {
              note: 'Milk',
              substitutions: [{ substitute_food: ALTERNATIVE.id }],
            },
          ],
        })
      ).isError
    ).toBe(false);
    expect(
      callsOf(spy).filter((call) => call.method === 'PATCH')[0]!.body
    ).toMatchObject({
      recipeIngredient: [
        { substitutions: [{ substituteFoodId: ALTERNATIVE.id }] },
      ],
    });
    expect(
      (
        await confirmed(client, 'update_recipe', {
          recipe: 'substitution-recipe',
          ingredients: [{ note: 'Milk', substitutions: [] }],
        })
      ).isError
    ).toBe(false);
    expect(callsOf(spy).at(-1)!.body).toMatchObject({
      recipeIngredient: [{ substitutions: [] }],
    });
    await client.close();
  });

  it('creates shared food defaults after resolving existing substitute foods', async () => {
    const spy = mockFetch([ALTERNATIVE, GENERIC]);
    const { isError } = await callText(await connect(), 'create_food', {
      name: 'Milk',
      substitutions: [
        { substitute_food: ALTERNATIVE.id },
        { note: 'Water if necessary' },
      ],
    });
    expect(isError).toBe(false);
    expect(callsOf(spy)[1]!.body).toEqual({
      name: 'Milk',
      substitutions: [
        { substituteFoodId: ALTERNATIVE.id },
        { note: 'Water if necessary' },
      ],
    });
  });

  it('writes note-only alternatives without vocabulary lookups', async () => {
    const spy = mockFetch(['substitution-recipe', GENERIC]);
    expect(
      (
        await callText(await connect(), 'create_recipe', {
          name: 'Substitution recipe',
          ingredients: [
            {
              note: 'Stock',
              substitutions: [{ note: 'Water and a bouillon cube' }],
            },
          ],
        })
      ).isError
    ).toBe(false);
    expect(callsOf(spy).map((call) => call.method)).toEqual(['POST', 'PATCH']);
  });

  it.each([{}, { note: '   ' }, { substitute_food: '' }])(
    'rejects empty alternatives before any write: %j',
    async (substitution) => {
      const spy = mockFetch();
      const client = await connect();
      expect(
        (
          await callText(client, 'create_recipe', {
            name: 'Invalid',
            ingredients: [{ note: 'Milk', substitutions: [substitution] }],
          })
        ).isError
      ).toBe(true);
      expect(
        (
          await callText(client, 'create_food', {
            name: 'Invalid',
            substitutions: [substitution],
          })
        ).isError
      ).toBe(true);
      expect(spy).not.toHaveBeenCalled();
      await client.close();
    }
  );

  it('rejects unknown substitutes before creating recipes or foods', async () => {
    const spy = mockFetch({ items: [] });
    const client = await connect();
    const substitutions = [{ substitute_food: 'Unobtainium' }];
    for (const [tool, args] of [
      [
        'create_recipe',
        { name: 'Invalid', ingredients: [{ note: 'Milk', substitutions }] },
      ],
      ['create_food', { name: 'Invalid', substitutions }],
    ] as const) {
      const result = await callText(client, tool, args);
      expect(result.isError).toBe(true);
      expect(result.text).toContain('No food in this Mealie matches');
    }
    expect(callsOf(spy).every((call) => call.method === 'GET')).toBe(true);
    await client.close();
  });

  it('exposes recipe alternatives and shared food defaults separately without recursion', () => {
    const substitution = {
      substituteFoodId: ALTERNATIVE.id,
      substituteFood: {
        ...ALTERNATIVE,
        substitutions: [{ note: 'Do not recurse' }],
      },
      note: 'Unsweetened',
    };
    const expected = [
      {
        substituteFoodId: ALTERNATIVE.id,
        substituteFood: { id: ALTERNATIVE.id, name: ALTERNATIVE.name },
        note: 'Unsweetened',
      },
    ];
    const detail = recipeDetail({
      recipeIngredient: [
        {
          food: { ...PRIMARY, substitutions: [substitution] },
          substitutions: [{ note: 'Water' }],
        },
      ],
    });
    expect(detail.recipeIngredient).toEqual([
      expect.objectContaining({
        substitutions: [{ note: 'Water' }],
        foodSubstitutions: expected,
      }),
    ]);
    expect(
      foodSummary({ ...PRIMARY, substitutions: [substitution] })
    ).toMatchObject({ substitutions: expected });
  });
});
