/* Cosmetic online variants reuse Arcade assets and encode the rank in the
   existing fighter identifier, so room updates and rematches stay atomic. */
(function (global) {
  'use strict';
  const ranks = global.DojoArcade?.RANKS || [];
  const roster = Object.freeze(Object.fromEntries(['male', 'female'].flatMap(gender => ranks.map(rank => {
    const name = gender === 'male' ? 'CUSTOM UOMO' : 'CUSTOM DONNA';
    return [`custom-${gender}-${rank.index}`, Object.freeze({ name, short: name, rank: rank.label,
      belt: rank.belt, beltColor: rank.beltColor, customGender: gender, rankIndex: rank.index })];
  }))));
  function install(game, characters, art) {
    Object.assign(game.characters, roster); Object.assign(characters, roster);
    for (const [id, fighter] of Object.entries(roster)) art.setCharacter({
      id, name: fighter.name, gender: fighter.customGender, hair: fighter.customGender === 'female' ? 3 : 0,
      rank: ranks[fighter.rankIndex],
    });
  }
  global.DojoOnlineCustom = { roster, install };
  if (typeof module !== 'undefined') module.exports = global.DojoOnlineCustom;
})(typeof window !== 'undefined' ? window : globalThis);
