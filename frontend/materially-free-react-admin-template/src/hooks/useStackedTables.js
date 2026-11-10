import { useEffect } from 'react';
import useIsMobile from './useIsMobile';

const MIN_COLONNES = 3;

/** Libellés de colonnes (dernière ligne de l'en-tête, colSpan développé). */
function libellesColonnes(table) {
  const rows = table.tHead ? table.tHead.rows : [];
  const last = rows[rows.length - 1];
  if (!last) return null;
  const labels = [];
  Array.from(last.cells).forEach((th) => {
    const text = (th.textContent || '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < (th.colSpan || 1); i += 1) labels.push(text);
  });
  return labels;
}

/** Cellule sans aucun contenu visible (ni texte, ni champ, ni bouton, ni image). */
function estVide(td) {
  if ((td.textContent || '').trim()) return false;
  return !td.querySelector('input, select, textarea, button, img, svg, canvas');
}

function empiler(table) {
  if (table.closest('[data-no-stack]') || table.hasAttribute('data-no-stack')) return;
  // Tableaux « document » (bulletin, reçus, grilles imprimables) : bordures en style inline,
  // à garder intacts pour l'affichage et l'export PDF.
  if (/border-collapse/i.test(table.getAttribute('style') || '')) return;
  const labels = libellesColonnes(table);
  if (!labels || labels.length < MIN_COLONNES) return;

  Array.from(table.tBodies).forEach((tbody) => {
    Array.from(tbody.rows).forEach((tr) => {
      let col = 0;
      const cells = Array.from(tr.cells);
      // grille (ex. emploi du temps) : ligne dont toutes les cellules, sauf la 1re, sont vides → masquée
      const ligneVide = cells.length >= MIN_COLONNES && cells.slice(1).every(estVide);
      if (ligneVide) tr.setAttribute('data-empty', '1');
      else tr.removeAttribute('data-empty');
      cells.forEach((td) => {
        if (estVide(td)) td.setAttribute('data-empty', '1');
        else td.removeAttribute('data-empty');
        if (td.colSpan > 1) {
          td.setAttribute('data-span', '1');
        } else {
          const label = labels[col] || '';
          td.setAttribute('data-label', label);
          if (/^actions?$/i.test(label)) td.setAttribute('data-actions', '1');
        }
        col += td.colSpan || 1;
      });
    });
  });
  table.setAttribute('data-stack', '1');
}

function retirer() {
  document.querySelectorAll('table[data-stack]').forEach((t) => t.removeAttribute('data-stack'));
}

/**
 * Sur téléphone, transforme les tableaux larges (≥ 3 colonnes) en cartes :
 * une ligne = une carte, chaque cellule affiche son libellé de colonne.
 * Exclure un tableau : attribut data-no-stack sur le <table> ou un parent.
 */
export default function useStackedTables() {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile) {
      retirer();
      return undefined;
    }

    let frame = 0;
    const scan = () => {
      frame = 0;
      document.querySelectorAll('table').forEach(empiler);
    };
    const planifier = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };

    scan();
    const observer = new MutationObserver(planifier);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      retirer();
    };
  }, [isMobile]);
}
