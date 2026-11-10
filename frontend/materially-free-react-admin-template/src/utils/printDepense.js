/** Reçu de dépense (bon de caisse) : la pièce justificative d'une sortie d'argent, sur une demi-feuille A4. */
import { absolue, formatDateFr, formatFcfa, francsEnLettres } from 'utils/printRecu';
import { couleursImpression } from 'utils/couleurs';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function imprimerDepense(d, ecole = {}, { duplicata = false } = {}) {
  const teinte = couleursImpression();
  if (!d) return;
  const nomEcole = ecole.nom_ecole || 'Complexe Scolaire Wend-Panga';
  const adresse = [ecole.adresse, ecole.ville].filter(Boolean).join(' — ');
  const logo = absolue(ecole.logo_url || ecole.logo);
  const tampon = absolue(ecole.tampon_url);
  const signature = absolue(d.saisi_par_signature);
  const refMode = ['MOBILE', 'VIREMENT', 'CHEQUE'].includes(d.mode);
  const lignes = [
    ['Payé à', d.beneficiaire || '—'],
    ['Motif', d.libelle],
    ['Catégorie', d.categorie_libelle],
    ['Date', formatDateFr(d.date_depense)],
    ['Mode de paiement', d.mode_libelle],
    d.commentaire && [refMode ? 'Référence' : 'Remarque', d.commentaire],
  ].filter(Boolean);
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Reçu de dépense ${esc(d.numero)}</title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; font-size: 12.5px; }
  .page { width: 194mm; height: 138mm; border: 1.5px solid #b71c1c; padding: 5mm 7mm; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .entete { display: flex; align-items: center; gap: 10px; padding-bottom: 5px; border-bottom: 2px solid #b71c1c; }
  .entete img.logo { height: 56px; width: auto; }
  .ecole { flex: 1; }
  .nom-ecole { font-size: 17px; font-weight: bold; text-transform: uppercase; color: ${teinte.fonce}; letter-spacing: .4px; }
  .sub { font-size: 10.5px; color: #444; margin-top: 1px; }
  .titre { text-align: right; }
  .titre h1 { font-size: 15px; text-transform: uppercase; color: #b71c1c; letter-spacing: .6px; }
  .titre .num { font-size: 13.5px; font-weight: bold; margin-top: 2px; }
  .dup { position: absolute; top: 4mm; right: 7mm; font-size: 9px; font-weight: bold; color: #b71c1c; border: 1px solid #b71c1c; padding: 1px 6px; letter-spacing: 1px; }
  .corps { display: flex; gap: 14px; margin-top: 8px; flex: 1; align-items: stretch; }
  .col-infos { flex: 1.15; display: flex; }
  .col-montant { flex: 1; display: flex; flex-direction: column; gap: 8px; }
  table.infos { width: 100%; height: 100%; border-collapse: collapse; }
  table.infos td { padding: 3px 4px; border-bottom: 1px dotted #bbb; vertical-align: middle; }
  table.infos td.lbl { width: 34%; color: #444; font-weight: bold; }
  .montant { border: 2px solid #b71c1c; text-align: center; padding: 8px 6px; flex: 1.2; display: flex; flex-direction: column; justify-content: center; }
  .montant .lab { font-size: 10px; text-transform: uppercase; color: #444; letter-spacing: .5px; }
  .montant .val { font-size: 28px; font-weight: bold; color: #b71c1c; line-height: 1.2; }
  .montant .lettres { font-size: 11px; font-style: italic; color: #333; margin-top: 3px; }
  .attest { font-size: 11px; color: #333; flex: 1; display: flex; align-items: center; }
  .signatures { display: flex; justify-content: space-between; gap: 10px; margin-top: 4px; }
  .zone { width: 32%; text-align: center; }
  .zone .tit { font-weight: bold; font-size: 11px; }
  .cadre { height: 24mm; display: flex; align-items: center; justify-content: center; color: #999; font-size: 9px; }
  .cadre.pointille { border: 1px dashed #aaa; }
  .cadre img { max-height: 23mm; max-width: 100%; }
  .zone .nom { font-weight: bold; font-size: 11.5px; border-top: 1px solid #555; padding-top: 2px; min-height: 14px; }
  .mention { font-size: 9px; color: #555; text-align: center; font-style: italic; margin-top: 3px; }
  .coupe { width: 194mm; margin-top: 4mm; border-top: 1px dashed #888; text-align: center; font-size: 9px; color: #888; padding-top: 1px; }
</style></head>
<body>
  <div class="page">
    ${duplicata ? '<div class="dup">DUPLICATA</div>' : ''}
    <div class="entete">
      ${logo ? `<img class="logo" src="${esc(logo)}" alt="">` : ''}
      <div class="ecole">
        <div class="nom-ecole">${esc(nomEcole)}</div>
        ${adresse ? `<div class="sub">${esc(adresse)}${ecole.telephone ? ` — Tél. ${esc(ecole.telephone)}` : ''}</div>` : ''}
      </div>
      <div class="titre">
        <h1>Reçu de dépense</h1>
        <div class="num">N° ${esc(d.numero || '—')}</div>
      </div>
    </div>
    <div class="corps">
      <div class="col-infos">
        <table class="infos">${lignes.map(([k, v]) => `<tr><td class="lbl">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      </div>
      <div class="col-montant">
        <div class="montant">
          <div class="lab">Montant payé</div>
          <div class="val">${esc(formatFcfa(d.montant))}</div>
          <div class="lettres">Arrêté à la somme de : ${esc(francsEnLettres(d.montant))}</div>
        </div>
        <p class="attest">Je soussigné(e) reconnais avoir reçu la somme indiquée ci-dessus de ${esc(nomEcole)}.</p>
      </div>
    </div>
    <div class="signatures">
      <div class="zone">
        <div class="tit">Le bénéficiaire</div>
        <div class="cadre pointille">Nom et signature</div>
        <div class="nom">${esc(d.beneficiaire || '')}&nbsp;</div>
      </div>
      <div class="zone">
        <div class="tit">Le comptable</div>
        <div class="cadre${signature ? '' : ' pointille'}">${signature ? `<img src="${esc(signature)}" alt="Signature">` : 'Signature'}</div>
        <div class="nom">${esc(d.saisi_par_nom || '')}&nbsp;</div>
      </div>
      <div class="zone">
        <div class="tit">Cachet de l’école</div>
        <div class="cadre${tampon ? '' : ' pointille'}">${tampon ? `<img src="${esc(tampon)}" alt="Cachet">` : 'Cachet'}</div>
        <div class="nom">&nbsp;</div>
      </div>
    </div>
    <p class="mention">${duplicata ? 'Duplicata. ' : ''}Pièce justificative de dépense — à conserver avec les documents comptables.</p>
  </div>
  <div class="coupe">✂ découper ici</div>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) {
    window.alert('Autorisez les fenêtres pop-up pour imprimer le reçu.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
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
