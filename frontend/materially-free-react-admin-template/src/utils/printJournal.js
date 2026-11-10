/** Impression du journal de caisse d'un jour : toutes les entrées, toutes les sorties, les totaux et les signatures. */
import { formatDateFr, formatFcfa } from 'utils/printRecu';
import { couleursImpression } from 'utils/couleurs';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function imprimerJournal(journal, ecole = {}, caissier = '') {
  const teinte = couleursImpression();
  if (!journal) return;
  const lignesEntrees = journal.entrees.map((p) => `<tr>
      <td>${esc(p.numero_recu)}</td>
      <td>${esc(`${p.eleve_prenom || ''} ${p.eleve_nom || ''}`.trim())}<br><small>${esc(p.classe_nom || '')}</small></td>
      <td>${esc(p.versement_libelle || '')}</td>
      <td>${esc(p.mode_libelle || '')}${p.commentaire ? `<br><small>${esc(p.commentaire)}</small>` : ''}</td>
      <td class="num">${esc(formatFcfa(p.montant))}</td></tr>`).join('');
  const lignesSorties = journal.sorties.map((d) => `<tr>
      <td colspan="3">${esc(d.libelle)}${d.beneficiaire ? `<br><small>Payé à : ${esc(d.beneficiaire)}</small>` : ''}</td>
      <td>${esc(d.categorie_libelle)} · ${esc(d.mode_libelle)}</td>
      <td class="num">${esc(formatFcfa(d.montant))}</td></tr>`).join('');
  const parMode = journal.entrees_par_mode.map((m) => `<tr><td>${esc(m.libelle)}</td><td class="num">${esc(formatFcfa(m.total))}</td></tr>`).join('');
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Journal de caisse ${esc(journal.date)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #111; padding: 12mm; font-size: 12px; }
  h1 { font-size: 16px; text-align: center; text-transform: uppercase; color: ${teinte.fonce}; }
  .sub { text-align: center; color: #444; margin: 2px 0 10px; }
  h2 { font-size: 13px; margin: 14px 0 4px; color: ${teinte.fonce}; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: ${teinte.clair}; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr.total td { font-weight: bold; background: #f5f5f5; }
  small { color: #555; }
  .signatures { display: flex; justify-content: space-between; margin-top: 28px; }
  .signatures div { width: 44%; text-align: center; }
  .signatures .cadre { height: 60px; border: 1px dashed #888; margin-top: 4px; }
</style></head><body>
  <h1>${esc(ecole.nom_ecole || 'Journal de caisse')}</h1>
  <p class="sub">Journal de caisse du ${esc(formatDateFr(journal.date))}${caissier ? ` — tenu par ${esc(caissier)}` : ''}</p>
  <h2>Entrées (scolarité encaissée)</h2>
  <table><tr><th>Reçu</th><th>Élève</th><th>Versement</th><th>Mode / référence</th><th class="num">Montant</th></tr>
    ${lignesEntrees || '<tr><td colspan="5">Aucun encaissement ce jour.</td></tr>'}
    <tr class="total"><td colspan="4">Total des entrées</td><td class="num">${esc(formatFcfa(journal.total_entrees))}</td></tr>
  </table>
  ${parMode ? `<table style="margin-top:6px;width:50%"><tr><th>Par mode de paiement</th><th class="num">Total</th></tr>${parMode}</table>` : ''}
  <h2>Sorties (dépenses)</h2>
  <table><tr><th colspan="3">Motif</th><th>Catégorie · mode</th><th class="num">Montant</th></tr>
    ${lignesSorties || '<tr><td colspan="5">Aucune dépense ce jour.</td></tr>'}
    <tr class="total"><td colspan="4">Total des sorties</td><td class="num">${esc(formatFcfa(journal.total_sorties))}</td></tr>
  </table>
  <h2>Résultat du jour</h2>
  <table style="width:50%"><tr class="total"><td>Entrées − sorties</td><td class="num">${esc(formatFcfa(journal.solde))}</td></tr></table>
  <div class="signatures">
    <div>Le comptable<div class="cadre"></div></div>
    <div>Le directeur (visa)<div class="cadre"></div></div>
  </div>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=900');
  if (!w) {
    window.alert('Autorisez les fenêtres pop-up pour imprimer le journal.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
