// Trimestre proposé par défaut : le premier de l'année scolaire en cours (champ `annee_active` fourni par l'API)
export const trimestreParDefaut = (items) => {
  const liste = Array.isArray(items) ? items : [];
  return liste.find((t) => t.annee_active && t.is_active) || liste.find((t) => t.annee_active) || null;
};

// Valeur prête pour un <Select> : identifiant du trimestre par défaut, ou '' s'il n'y en a pas
export const idTrimestreParDefaut = (items) => trimestreParDefaut(items)?.id ?? '';

// Trimestres de l'année en cours uniquement (si aucune année n'est marquée en cours, on garde la liste telle quelle)
export const trimestresEnCours = (items) => {
  const liste = Array.isArray(items) ? items : [];
  const courants = liste.filter((t) => t.annee_active);
  return courants.length ? courants : liste;
};
