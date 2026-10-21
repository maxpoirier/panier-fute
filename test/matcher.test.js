import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INGREDIENTS, INGREDIENTS_BY_ID, REGULAR_PRICES } from '../public/lib/catalog/ingredients.js';
import { RECIPES } from '../public/lib/catalog/recipes.js';
import { matchIngredients } from '../public/lib/matcher.js';
import { normalize } from '../public/lib/text.js';

const match = (name) => matchIngredients(normalize(name));

test('matches real flyer names to ingredients', () => {
  assert.deepEqual(match('POITRINES DE POULET FRAIS DÉSOSSÉES'), ['poulet_poitrine']);
  assert.deepEqual(match('HAUTS DE CUISSES DE POULET DÉSOSSÉS SANS PEAU'), ['poulet_cuisses']);
  assert.deepEqual(match('BŒUF HACHÉ MAIGRE'), ['boeuf_hache']);
  assert.deepEqual(match('ŒUFS BLANCS COMPLIMENTS POULES EN LIBERTÉ'), ['oeufs']);
  assert.deepEqual(match('SAUCE SOJA KIKKOMAN'), ['sauce_soya']);
  assert.deepEqual(match("HUILE D'OLIVE GALLO"), ['huile_olive']);
  assert.deepEqual(match('sauce pour pâtes Sélection du Jardin Catelli | Catelli Garden Select pasta sauce'), ['sauce_tomate']);
  assert.deepEqual(match('CAROTTES OU OIGNONS JAUNES DÉLICES DU MARCHÉ'), ['oignon_jaune', 'carotte']);
});

test('ignores look-alikes that are not the ingredient', () => {
  assert.deepEqual(match("BOUILLON CAMPBELL'S"), ['bouillon_poulet', 'bouillon_boeuf', 'bouillon_legumes']);
  assert.deepEqual(match('salade césar au poulet'), []);
  assert.deepEqual(match('laitue duo Gen V | butter lettuce'), ['laitue']);
  assert.deepEqual(match('Fond de teint Fit Me'), []);
  assert.deepEqual(match('Détergent lessive liquide Lemon Aide'), []);
  assert.deepEqual(match('pains de beauté Ivory'), []);
  assert.deepEqual(match('PÂTÉS IMPÉRIAUX PAGODA'), []);
  assert.deepEqual(match('POMMES DE TERRE SUPERFRIES MCCAIN'), []);
  assert.deepEqual(match('Boisson gazeuse Coca-Cola zéro sucre'), []);
  assert.deepEqual(match('Litière suivi de la santé Special Kitty | cat litter'), []);
});

test('tells pasta shapes, butters, rice and pork cuts apart', () => {
  assert.deepEqual(match('PÂTES ALIMENTAIRES CATELLI'), ['pates_longues', 'pates_courtes']);
  assert.deepEqual(match('RIGATONI BARILLA'), ['pates_courtes']);
  assert.deepEqual(match('SPAGHETTINI CATELLI'), ['pates_longues']);
  assert.deepEqual(match('NOUILLES AUX OEUFS NO YOLKS'), ['nouilles_oeufs']);
  assert.deepEqual(match('Beurre Gay Lea'), ['beurre_sale']);
  assert.deepEqual(match('BEURRE NON SALÉ LACTANTIA'), ['beurre_non_sale']);
  assert.deepEqual(match('Tilda basmati rice'), ['riz_basmati']);
  assert.deepEqual(match('RIZ DAINTY'), ['riz_blanc']);
  assert.deepEqual(match('CÔTELETTES DE LONGE DE PORC FRAIS'), ['porc_cotelettes']);
  assert.deepEqual(match('FILETS DE PORC FRAIS'), ['porc_filet']);
  assert.deepEqual(match("MOUTARDE PRÉPARÉE FRENCH'S"), ['moutarde_jaune']);
  assert.deepEqual(match('VINAIGRE BLANC PUR SANS NOM'), ['vinaigre_blanc']);
  assert.deepEqual(match('SUSHI À LA MAISON RICE VINEGAR'), ['vinaigre_riz']);
});

test('every recipe ingredient and substitute exists in the catalogue', () => {
  for (const recipe of RECIPES) {
    for (const { id, alt } of recipe.ingredients) {
      for (const candidate of [id, ...alt]) {
        assert.ok(INGREDIENTS_BY_ID.has(candidate), `${recipe.id} uses unknown ingredient ${candidate}`);
      }
    }
    assert.ok(
      recipe.ingredients.some((entry) => entry.main),
      `${recipe.id} has no main ingredient`,
    );
  }
});

test('every ingredient has a regular price estimate', () => {
  for (const { id } of INGREDIENTS) {
    assert.ok(REGULAR_PRICES[id] > 0, `${id} has no regular price`);
  }
});

test('every recipe serves at least 4', () => {
  for (const recipe of RECIPES) assert.ok(recipe.servings >= 4, `${recipe.id} serves ${recipe.servings}`);
});

test('ignores lamb chops and milk jugs', () => {
  assert.deepEqual(match("CÔTELETTES DE LONGE D'AGNEAU ASSAISONNÉES"), []);
  assert.deepEqual(match('PICHET À LAIT AVEC OUVRE-SAC EVERYDAY ESSENTIALS'), []);
});

test('new catalogue ingredients skip snacks and kids products', () => {
  assert.deepEqual(match('TREMPETTES 200/227 G OU BOUCHÉES NAAN 200 G PC'), []);
  assert.deepEqual(match('GRUAU AU FRIGO OU GRANOLA BIOLOGIQUES OATBOX'), []);
  assert.deepEqual(match('YOGOURT IOGÖ NANÖ POCHETTES (4 x 90 g)'), []);
  assert.deepEqual(match('PAINS PITA SANABEL'), ['pita']);
  assert.deepEqual(match('GRUAU QUAKER'), ['gruau']);
  assert.deepEqual(match('PORC HACHÉ MAIGRE'), ['porc_hache']);
  assert.deepEqual(match('DINDE OU POULET HACHÉ MIEUX-ÊTRE'), ['dinde_hachee']);
});

test('herbs and spices are filed under « Épices et fines herbes », not with the vegetables', () => {
  for (const id of ['persil', 'coriandre', 'basilic', 'ciboulette', 'aneth', 'menthe', 'thym', 'origan', 'cumin', 'epices_steak']) {
    assert.equal(INGREDIENTS_BY_ID.get(id).cat, 'epice', id);
  }
  assert.equal(INGREDIENTS_BY_ID.get('gingembre').cat, 'legume', 'fresh ginger root stays with the produce');
  assert.deepEqual(match('GINGEMBRE MOULU CLUB HOUSE'), ['gingembre_moulu']);
  assert.deepEqual(match('AIL EN POUDRE'), ['poudre_ail']);
  assert.deepEqual(match('RADIS EN FEUILLES MENTHE'), []);
});
