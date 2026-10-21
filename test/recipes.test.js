import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { INGREDIENTS_BY_ID } from '../public/lib/catalog/ingredients.js';
import { RECIPES } from '../public/lib/catalog/recipes.js';

const DIR = new URL('../public/lib/catalog/recipes/', import.meta.url);
// The original classics include a few longer dishes (lasagne, pâté chinois); every other recipe is quick.
const MAX_MINUTES = 30;
const LONGER_ALLOWED = 'classiques.js';

const themes = await Promise.all(
  (await readdir(DIR))
    .filter((file) => file.endsWith('.js'))
    .map(async (file) => ({ file, recipes: (await import(new URL(file, DIR))).default })),
);

test('every theme file is part of RECIPES', () => {
  assert.equal(
    themes.reduce((sum, theme) => sum + theme.recipes.length, 0),
    RECIPES.length,
  );
});

test('recipe ids and names are unique', () => {
  const ids = new Map();
  const names = new Map();
  for (const { file, recipes } of themes) {
    for (const recipe of recipes) {
      const name = recipe.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      assert.ok(!ids.has(recipe.id), `id "${recipe.id}" in ${file} already used in ${ids.get(recipe.id)}`);
      assert.ok(!names.has(name), `"${recipe.name}" in ${file} already used in ${names.get(name)}`);
      ids.set(recipe.id, file);
      names.set(name, file);
    }
  }
});

for (const { file, recipes } of themes) {
  test(`${file}: every recipe is complete, valid, serves 4+ and is quick`, () => {
    for (const recipe of recipes) {
      const where = `${file} › ${recipe.id}`;
      assert.match(recipe.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${where}: id must be kebab-case`);
      assert.ok(recipe.name?.trim(), `${where}: name`);
      assert.ok(recipe.emoji?.trim(), `${where}: emoji`);
      assert.ok(recipe.servings >= 4, `${where}: serves ${recipe.servings}`);
      assert.ok(Number.isInteger(recipe.time) && recipe.time > 0, `${where}: time`);
      if (file !== LONGER_ALLOWED) assert.ok(recipe.time <= MAX_MINUTES, `${where}: ${recipe.time} min (max ${MAX_MINUTES})`);
      assert.ok(recipe.tags?.length >= 1 && recipe.tags.length <= 4, `${where}: 1 to 4 tags`);
      assert.ok(recipe.steps?.length >= 2 && recipe.steps.length <= 6, `${where}: 2 to 6 steps`);
      for (const step of recipe.steps) assert.ok(step.trim().length > 3, `${where}: empty step`);
      assert.ok(
        recipe.ingredients.some((entry) => entry.main),
        `${where}: needs a main ingredient`,
      );
      assert.ok(recipe.ingredients.length >= 3, `${where}: at least 3 ingredients`);
      const seen = new Set();
      for (const entry of recipe.ingredients) {
        assert.ok(entry.qty?.trim(), `${where}: quantity for ${entry.id}`);
        for (const id of [entry.id, ...entry.alt]) {
          assert.ok(INGREDIENTS_BY_ID.has(id), `${where}: unknown ingredient "${id}"`);
          assert.ok(!seen.has(id), `${where}: "${id}" listed twice`);
          seen.add(id);
        }
      }
    }
  });
}
