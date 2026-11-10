// Toute erreur est expliquée à l'utilisateur en français, en une phrase claire (jamais « Request failed with status code 500 »).

const CHAMPS = {
  matricule: 'Matricule', nom: 'Nom', prenom: 'Prénom', username: 'Identifiant', password: 'Mot de passe', email: 'E-mail',
  telephone: 'Téléphone', telephone_parent: 'Téléphone du parent', date_naissance: 'Date de naissance', sexe: 'Sexe',
  classe: 'Classe', niveau: 'Niveau', matiere: 'Matière', trimestre: 'Trimestre', montant: 'Montant', date: 'Date',
  coefficient: 'Coefficient', libelle: 'Libellé', titre: 'Titre', message: 'Message', photo: 'Photo', logo: 'Logo',
  nom_ecole: "Nom de l'école", date_debut: 'Date de début', date_fin: 'Date de fin', type: 'Type', mode: 'Mode de paiement',
};

const PAR_STATUT = {
  400: 'Les informations saisies ne sont pas valides. Vérifiez les champs puis réessayez.',
  401: "Votre session a expiré. Reconnectez-vous pour continuer.",
  403: "Vous n'avez pas le droit d'effectuer cette action avec votre compte.",
  404: 'Cet élément est introuvable. Il a peut-être été supprimé ou déplacé.',
  405: "Cette action n'est pas possible à cet endroit.",
  408: 'Le serveur a mis trop de temps à répondre. Réessayez.',
  409: "Cette action est en conflit avec des données existantes. Rechargez la page puis réessayez.",
  413: 'Le fichier envoyé est trop volumineux. Choisissez un fichier plus léger.',
  415: "Ce type de fichier n'est pas accepté. Choisissez un autre fichier.",
  422: 'Les informations saisies ne sont pas valides. Vérifiez les champs puis réessayez.',
  429: 'Trop de tentatives en peu de temps. Patientez un instant puis réessayez.',
  500: "Une erreur est survenue sur le serveur. L'équipe technique en a été informée. Réessayez dans un instant.",
  502: "Le serveur est momentanément injoignable. Réessayez dans quelques instants.",
  503: "Le service est momentanément indisponible (maintenance ou forte charge). Réessayez dans quelques instants.",
  504: 'Le serveur a mis trop de temps à répondre. Réessayez dans quelques instants.',
};

export const MESSAGE_RESEAU = 'Connexion impossible : vérifiez votre connexion internet, puis réessayez.';
export const MESSAGE_LENT = 'Le serveur met trop de temps à répondre. Vérifiez votre connexion puis réessayez.';

const libelleChamp = (cle) => CHAMPS[cle] || '';
const aplatir = (v) => (Array.isArray(v) ? v.map(aplatir).filter(Boolean).join(' ') : (v && typeof v === 'object' ? Object.values(v).map(aplatir).join(' ') : String(v ?? '')));
const ANGLAIS = /\b(the|this field|is required|may not|invalid|error|failed|not found|permission|unauthorized|forbidden|server)\b/i;

/** Message lisible pour une erreur de requête (axios) ou une erreur JavaScript. `defaut` : phrase propre à l'écran, utilisée si rien de mieux. */
export function messageErreur(err, defaut = '') {
  if (!err) return defaut || PAR_STATUT[500];
  const reponse = err.response;
  if (!reponse) {
    if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) return MESSAGE_LENT;
    if (err.isAxiosError || err.code === 'ERR_NETWORK' || /network/i.test(err.message || '')) return MESSAGE_RESEAU;
    const m = String(err.message || '');
    return m && !ANGLAIS.test(m) ? m : defaut || "Une erreur inattendue est survenue. Rechargez la page et réessayez.";
  }
  const { status, data } = reponse;
  if (data && typeof data === 'object') {
    if (typeof data.detail === 'string' && data.detail && !ANGLAIS.test(data.detail)) return data.detail;
    if (Array.isArray(data) && data.length) return aplatir(data);
    const parties = [];
    Object.entries(data).forEach(([cle, valeur]) => {
      if (cle === 'detail' || cle === 'code') return;
      const texte = aplatir(valeur).trim();
      if (!texte) return;
      const nom = cle === 'non_field_errors' ? '' : libelleChamp(cle);
      parties.push(nom ? `${nom} : ${texte}` : texte);
    });
    if (parties.length) return parties.join(' · ');
  }
  if (typeof data === 'string' && data.length < 200 && !/<\w+/.test(data) && !ANGLAIS.test(data)) return data;
  return PAR_STATUT[status] || (status >= 500 ? PAR_STATUT[500] : defaut || PAR_STATUT[400]);
}
