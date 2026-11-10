/**
 * Ouvre dans un nouvel onglet un PDF demandé avec le jeton de connexion.
 * `requete` est une promesse axios (responseType: 'blob'). En cas d'erreur, le message du serveur est relu
 * (il arrive sous forme de blob JSON) et renvoyé dans l'exception.
 */
export default async function ouvrirPdf(requete) {
  const fenetre = window.open('', '_blank'); // ouvert tout de suite pour ne pas être bloqué par le navigateur
  try {
    const res = await requete;
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    if (fenetre) fenetre.location.href = url;
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (err) {
    if (fenetre) fenetre.close();
    let message = 'Impossible de générer le PDF.';
    try {
      const texte = await err.response?.data?.text?.();
      if (texte) message = JSON.parse(texte).detail || message;
    } catch { /* message par défaut */ }
    throw new Error(message);
  }
}
