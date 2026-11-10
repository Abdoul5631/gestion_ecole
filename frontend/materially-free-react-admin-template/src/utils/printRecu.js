/** Impression d’un reçu de scolarité (fenêtre navigateur). Fonctionne après rechargement. */
import { couleursImpression } from 'utils/couleurs';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const formatFcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} F CFA`;

export const formatDateFr = (iso) => {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
};

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
  'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function sousMille(n) {
  if (n < 20) return UNITES[n];
  if (n < 70) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return DIZAINES[d] + (u === 1 ? ' et un' : u ? `-${UNITES[u]}` : '');
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${UNITES[n - 60]}`;
  if (n < 100) return n === 80 ? 'quatre-vingts' : `quatre-vingt-${UNITES[n - 80]}`;
  const c = Math.floor(n / 100);
  const r = n % 100;
  const tete = c === 1 ? 'cent' : `${UNITES[c]} cent`;
  return r ? `${tete} ${sousMille(r)}` : (c > 1 ? `${tete}s` : tete);
}

// Devant « mille », quatre-vingts et deux cents perdent leur s
const sansS = (txt) => txt.replace(/quatre-vingts$/, 'quatre-vingt').replace(/cents$/, 'cent');

/** 1 → « un franc CFA », 10000 → « dix mille francs CFA » */
export const francsEnLettres = (n) => `${enLettres(n)} franc${Number(n) >= 2 ? 's' : ''} CFA`;

/** 150000 → « cent cinquante mille » (pour la ligne « arrêté à la somme de »). */
export function enLettres(nombre) {
  const n = Math.floor(Number(nombre) || 0);
  if (n === 0) return 'zéro';
  const parts = [];
  const millions = Math.floor(n / 1000000);
  const milliers = Math.floor((n % 1000000) / 1000);
  const reste = n % 1000;
  if (millions) parts.push(`${sousMille(millions)} million${millions > 1 ? 's' : ''}`);
  if (milliers) parts.push(milliers === 1 ? 'mille' : `${sansS(sousMille(milliers))} mille`);
  if (reste) parts.push(sousMille(reste));
  return parts.join(' ');
}

// Une image enregistrée côté serveur (/media/...) doit être absolue pour s'afficher dans la fenêtre d'impression
export const absolue = (u) => (u && String(u).startsWith('/') ? `${window.location.origin}${u}` : u || '');

/**
 * Reçu imprimé sur une DEMI feuille A4 (la moitié haute ; on découpe selon le trait pointillé).
 * Signature : celle du comptable qui a encaissé (nom, prénom et image réglés une fois dans « Ma signature »).
 * Cachet : celui de l'école (paramètres de l'école).
 */
export function imprimerRecu(paiement, ecole = {}, { duplicata = false } = {}) {
  const teinte = couleursImpression();
  if (!paiement) return;
  const provisoire = !!paiement._pending; // encaissé hors ligne : le serveur n'a pas encore attribué de numéro
  const copie = duplicata && !provisoire;
  const nomEcole = ecole.nom_ecole || 'Complexe Scolaire Wend-Panga';
  const ligneAdresse = [ecole.adresse, ecole.ville].filter(Boolean).join(' — ');
  const logo = absolue(ecole.logo_url || ecole.logo);
  const tampon = absolue(ecole.tampon_url);
  const signature = absolue(paiement.recu_par_signature);
  const montant = formatFcfa(paiement.montant);
  const heure = paiement.created_at
    ? ` à ${new Date(paiement.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    : '';
  const eleve = `${paiement.eleve_prenom || ''} ${paiement.eleve_nom || ''}`.trim() || '—';
  const refMode = ['MOBILE', 'VIREMENT', 'CHEQUE'].includes(paiement.mode);
  const lignes = [
    ['Élève', `${eleve}${paiement.eleve_matricule ? ` (${paiement.eleve_matricule})` : ''}`],
    ['Classe', `${paiement.classe_nom || '—'}${paiement.annee_libelle ? ` — ${paiement.annee_libelle}` : ''}`],
    paiement.parent_nom && ['Parent / tuteur', paiement.parent_nom],
    paiement.versement_libelle && ['Versement', paiement.versement_libelle],
    ['Date', `${formatDateFr(paiement.date_paiement)}${heure}`],
    ['Mode', paiement.mode_libelle || paiement.mode || '—'],
    paiement.commentaire && [refMode ? 'Référence' : 'Observation', paiement.commentaire],
  ].filter(Boolean);
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Reçu ${esc(paiement.numero_recu)}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; font-size: 12.5px; }
    /* demi feuille A4 : 194 mm de large sur 138 mm de haut */
    .page { width: 194mm; height: 138mm; border: 1.5px solid ${teinte.fonce}; padding: 5mm 7mm; display: flex; flex-direction: column; position: relative; overflow: hidden; }
    .entete { display: flex; align-items: center; gap: 10px; padding-bottom: 5px; border-bottom: 2px solid ${teinte.fonce}; }
    .entete img.logo { height: 56px; width: auto; }
    .ecole { flex: 1; }
    .nom-ecole { font-size: 17px; font-weight: bold; text-transform: uppercase; color: ${teinte.fonce}; letter-spacing: .4px; }
    .sub { font-size: 10.5px; color: #444; margin-top: 1px; }
    .titre { text-align: right; }
    .titre h1 { font-size: 15px; text-transform: uppercase; color: ${teinte.fonce}; letter-spacing: .6px; }
    .titre .num { font-size: 13.5px; font-weight: bold; margin-top: 2px; }
    .dup { position: absolute; top: 4mm; right: 7mm; font-size: 9px; font-weight: bold; color: #b71c1c; border: 1px solid #b71c1c; padding: 1px 6px; letter-spacing: 1px; }
    .corps { display: flex; gap: 14px; margin-top: 8px; flex: 1; align-items: stretch; }
    .col-infos { flex: 1.15; display: flex; }
    .col-montant { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    table.infos { width: 100%; height: 100%; border-collapse: collapse; }
    table.infos td { padding: 3px 4px; border-bottom: 1px dotted #bbb; vertical-align: middle; }
    table.infos td.lbl { width: 34%; color: #444; font-weight: bold; }
    .montant { border: 2px solid #2e7d32; background: #f1f8f2; text-align: center; padding: 8px 6px; flex: 1.2; display: flex; flex-direction: column; justify-content: center; }
    .montant .lab { font-size: 10px; text-transform: uppercase; color: #444; letter-spacing: .5px; }
    .montant .val { font-size: 28px; font-weight: bold; color: #2e7d32; line-height: 1.2; }
    .montant .lettres { font-size: 11px; font-style: italic; color: #333; margin-top: 3px; }
    .sit { flex: 1; display: flex; }
    table.situation { width: 100%; height: 100%; border-collapse: collapse; }
    table.situation td { padding: 4px 8px; border: 1px solid ${teinte.moyen}; vertical-align: middle; }
    table.situation td:last-child { text-align: right; font-weight: bold; white-space: nowrap; }
    table.situation tr.reste td { background: ${teinte.clair}; color: ${teinte.fonce}; }
    .signatures { display: flex; justify-content: space-between; gap: 14px; margin-top: 4px; }
    .zone { width: 47%; text-align: center; }
    .zone .tit { font-weight: bold; font-size: 11px; }
    .cadre { height: 24mm; display: flex; align-items: center; justify-content: center; color: #999; font-size: 9px; }
    .cadre.pointille { border: 1px dashed #aaa; }
    .cadre img { max-height: 23mm; max-width: 100%; }
    .zone .nom { font-weight: bold; font-size: 11.5px; border-top: 1px solid #555; padding-top: 2px; }
    .mention { font-size: 9px; color: #555; text-align: center; font-style: italic; margin-top: 3px; }
    .coupe { width: 194mm; margin-top: 4mm; border-top: 1px dashed #888; text-align: center; font-size: 9px; color: #888; padding-top: 1px; }
    @media print { .page { width: 194mm; } }
  </style>
</head>
<body>
  <div class="page">
    ${copie ? '<div class="dup">DUPLICATA</div>' : ''}
    <div class="entete">
      ${logo ? `<img class="logo" src="${esc(logo)}" alt="">` : ''}
      <div class="ecole">
        <div class="nom-ecole">${esc(nomEcole)}</div>
        ${ecole.slogan ? `<div class="sub">${esc(ecole.slogan)}</div>` : ''}
        ${ligneAdresse ? `<div class="sub">${esc(ligneAdresse)}${ecole.telephone ? ` — Tél. ${esc(ecole.telephone)}` : ''}</div>` : (ecole.telephone ? `<div class="sub">Tél. ${esc(ecole.telephone)}</div>` : '')}
      </div>
      <div class="titre">
        <h1>${provisoire ? 'Reçu provisoire' : 'Reçu de paiement'}</h1>
        <div class="num">${provisoire ? 'Sans numéro' : `N° ${esc(paiement.numero_recu || '—')}`}</div>
      </div>
    </div>
    <div class="corps">
      <div class="col-infos">
        <table class="infos">
          ${lignes.map(([k, v]) => `<tr><td class="lbl">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
        </table>
      </div>
      <div class="col-montant">
        <div class="montant">
          <div class="lab">Montant reçu</div>
          <div class="val">${esc(montant)}</div>
          <div class="lettres">Arrêté à la somme de : ${esc(francsEnLettres(paiement.montant))}</div>
        </div>
        ${paiement.montant_du ? `<div class="sit"><table class="situation">
          <tr><td>Scolarité totale</td><td>${esc(formatFcfa(paiement.montant_du))}</td></tr>
          <tr><td>Total payé à ce jour</td><td>${esc(formatFcfa(paiement.cumul_paye))}</td></tr>
          <tr class="reste"><td>Reste à payer</td><td>${Number(paiement.reste_apres) === 0 ? 'SOLDÉ' : esc(formatFcfa(paiement.reste_apres))}</td></tr>
        </table></div>` : ''}
      </div>
    </div>
    <div class="signatures">
      <div class="zone">
        <div class="tit">Le comptable</div>
        <div class="cadre${signature ? '' : ' pointille'}">${signature ? `<img src="${esc(signature)}" alt="Signature">` : 'Signature'}</div>
        <div class="nom">${esc(paiement.recu_par_nom || '')}&nbsp;</div>
      </div>
      <div class="zone">
        <div class="tit">Cachet de l’école</div>
        <div class="cadre${tampon ? '' : ' pointille'}">${tampon ? `<img src="${esc(tampon)}" alt="Cachet">` : 'Cachet'}</div>
        <div class="nom">&nbsp;</div>
      </div>
    </div>
    <p class="mention">${provisoire
    ? 'Reçu établi sans connexion. Le numéro définitif sera attribué à la synchronisation ; le reçu définitif pourra alors être imprimé.'
    : `${copie ? 'Duplicata d’un reçu déjà délivré. ' : ''}Conservez ce reçu — il peut être réimprimé depuis l’application.`}</p>
  </div>
  <div class="coupe">✂ découper ici</div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) {
    window.alert('Autorisez les fenêtres pop-up pour imprimer le reçu.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // laisse le temps au logo, à la signature et au cachet de se charger avant d'imprimer
  const lancer = () => w.print();
  const images = Array.from(w.document.images);
  if (!images.length) setTimeout(lancer, 300);
  else {
    let restantes = images.length;
    const fini = () => { restantes -= 1; if (restantes <= 0) setTimeout(lancer, 150); };
    images.forEach((img) => { if (img.complete) fini(); else { img.onload = fini; img.onerror = fini; } });
    setTimeout(() => { if (restantes > 0) lancer(); }, 4000);
  }
}
