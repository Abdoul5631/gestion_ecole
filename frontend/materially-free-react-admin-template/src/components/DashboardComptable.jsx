import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PaymentsIcon from '@mui/icons-material/Payments';
import AddCardIcon from '@mui/icons-material/AddCard';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import ErrorIcon from '@mui/icons-material/Error';
import api from 'services/api';
import { fcfa } from 'components/CartesFinances';

/* ── Couleurs : palette de référence (catégorielle slots 1-2, statuts fixes), en clair et en sombre ── */
export const CLAIR = {
  surface: '#fcfcfb', texte: '#0b0b0b', secondaire: '#52514e', discret: '#898781', grille: '#e1e0d9', axe: '#c3c2b7',
  bord: 'rgba(11,11,11,0.10)', entrees: '#2a78d6', sorties: '#eb6834', piste: '#cde2fb', bonTexte: '#006300', critiqueTexte: '#d03b3b',
};
export const SOMBRE = {
  surface: '#1a1a19', texte: '#f0efec', secondaire: '#c3c2b7', discret: '#898781', grille: '#2c2c2a', axe: '#383835',
  bord: 'rgba(255,255,255,0.10)', entrees: '#3987e5', sorties: '#d95926', piste: '#184f95', bonTexte: '#0ca30c', critiqueTexte: '#e66767',
};
export const STATUT = { solde: '#0ca30c', partiel: '#fab219', impaye: '#d03b3b' };

const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const moisCourt = (m) => MOIS[Number(m.split('-')[1]) - 1];
const moisLong = (m) => `${MOIS[Number(m.split('-')[1]) - 1]} ${m.split('-')[0]}`;
const compact = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${+(n / 1e3).toFixed(0)} K` : `${n}`);
const jourFr = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };

/** Plafond « rond » de l'axe (1, 2, 5 × 10^k) et 4 graduations. */
function echelle(max) {
  if (!max) return { max: 1, ticks: [0, 1] };
  const p = 10 ** Math.floor(Math.log10(max));
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s * 4 >= max) || 10 * p;
  return { max: pas * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * pas) };
}

function useLargeur(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Barre à coin arrondi de 4 px côté donnée, carrée sur la ligne de base. */
const cheminBarre = (x, y, w, h, r = 4) => {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
};

export function Panneau({ c, titre, sousTitre, action, children, sx }) {
  return (
    <Box sx={{ bgcolor: c.surface, border: `1px solid ${c.bord}`, borderRadius: '14px', p: { xs: 2, sm: 2.5 }, minWidth: 0, ...sx }}>
      {(titre || action) && (
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1} mb={1.5}>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 15, color: c.texte }}>{titre}</Typography>
            {sousTitre && <Typography sx={{ fontSize: 12.5, color: c.secondaire }}>{sousTitre}</Typography>}
          </Box>
          {action}
        </Box>
      )}
      {children}
    </Box>
  );
}

/** Courbe de tendance minuscule : trait 2 px, point final de 8 px cerclé de la couleur de surface. */
function Sparkline({ points, couleur, c }) {
  const W = 92;
  const H = 34;
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const x = (i) => 4 + (i * (W - 8)) / (points.length - 1);
  const y = (v) => (max === min ? H / 2 : H - 5 - ((v - min) / (max - min)) * (H - 10));
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg width={W} height={H} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={d} fill="none" stroke={couleur} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="4" fill={couleur} stroke={c.surface} strokeWidth="2" />
    </svg>
  );
}

export function Tuile({ c, libelle, valeur, detail, couleur, points, children }) {
  return (
    <Box sx={{ bgcolor: c.surface, border: `1px solid ${c.bord}`, borderRadius: '14px', p: { xs: 1.75, sm: 2.25 }, minWidth: 0 }}>
      <Box display="flex" alignItems="center" gap={0.75} mb={0.75}>
        <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: couleur, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 13, color: c.secondaire, fontWeight: 600 }}>{libelle}</Typography>
      </Box>
      <Box display="flex" alignItems="flex-end" justifyContent="space-between" gap={1}>
        <Typography sx={{ fontSize: { xs: 22, sm: 26 }, fontWeight: 700, lineHeight: 1.15, color: c.texte, wordBreak: 'break-word' }}>{valeur}</Typography>
        {points && <Sparkline points={points} couleur={couleur} c={c} />}
      </Box>
      {detail && <Typography sx={{ fontSize: 12.5, color: c.secondaire, mt: 0.75 }}>{detail}</Typography>}
      {children}
    </Box>
  );
}

/** Colonnes groupées entrées / sorties par mois : survol par groupe, légende, vue en tableau. */
function GraphiqueMois({ c, mois }) {
  const zone = useRef(null);
  const largeur = useLargeur(zone);
  const [actif, setActif] = useState(null);
  const [vue, setVue] = useState('graphique');
  const H = 260;
  const marge = { g: 46, d: 6, h: 10, b: 28 };
  const donnees = mois.slice(-6);
  const { max, ticks } = echelle(Math.max(0, ...donnees.flatMap((m) => [m.entrees, m.sorties])));
  const iw = Math.max(0, largeur - marge.g - marge.d);
  const ih = H - marge.h - marge.b;
  const bande = donnees.length ? iw / donnees.length : 0;
  const larg = Math.max(6, Math.min(24, (bande * 0.7 - 2) / 2));
  const yv = (v) => marge.h + ih - (v / max) * ih;

  return (
    <Panneau c={c} titre="Entrées et sorties par mois" sousTitre="Argent reçu des parents et argent dépensé par l'école"
      action={<Button size="small" onClick={() => setVue(vue === 'graphique' ? 'tableau' : 'graphique')} sx={{ color: c.secondaire, textTransform: 'none' }}>
        {vue === 'graphique' ? 'Voir en tableau' : 'Voir le graphique'}
      </Button>}>
      <Box display="flex" gap={2.5} mb={1} flexWrap="wrap">
        {[['Entrées', c.entrees], ['Sorties', c.sorties]].map(([nom, col]) => (
          <Box key={nom} display="flex" alignItems="center" gap={0.75}>
            <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: col }} />
            <Typography sx={{ fontSize: 13, color: c.secondaire }}>{nom}</Typography>
          </Box>
        ))}
      </Box>

      {donnees.length === 0 && <Typography sx={{ color: c.secondaire, py: 4, textAlign: 'center' }}>Aucun mouvement pour l’instant.</Typography>}

      {donnees.length > 0 && vue === 'tableau' && (
        <Box component="div" sx={{ overflowX: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 0, minWidth: 380, fontSize: 13.5 }}>
            {['Mois', 'Entrées', 'Sorties', 'Différence'].map((h, i) => (
              <Box key={h} sx={{ py: 0.75, fontWeight: 700, color: c.secondaire, textAlign: i ? 'right' : 'left', borderBottom: `1px solid ${c.grille}` }}>{h}</Box>
            ))}
            {[...donnees].reverse().map((m) => [
              <Box key={`${m.mois}a`} sx={{ py: 0.75, color: c.texte, borderBottom: `1px solid ${c.grille}` }}>{moisLong(m.mois)}</Box>,
              <Box key={`${m.mois}b`} sx={{ py: 0.75, textAlign: 'right', color: c.texte, borderBottom: `1px solid ${c.grille}`, fontVariantNumeric: 'tabular-nums' }}>{fcfa(m.entrees)}</Box>,
              <Box key={`${m.mois}c`} sx={{ py: 0.75, textAlign: 'right', color: c.texte, borderBottom: `1px solid ${c.grille}`, fontVariantNumeric: 'tabular-nums' }}>{fcfa(m.sorties)}</Box>,
              <Box key={`${m.mois}d`} sx={{ py: 0.75, textAlign: 'right', fontWeight: 700, color: m.entrees - m.sorties < 0 ? c.critiqueTexte : c.bonTexte, borderBottom: `1px solid ${c.grille}`, fontVariantNumeric: 'tabular-nums' }}>
                {m.entrees - m.sorties < 0 ? '- ' : '+ '}{fcfa(Math.abs(m.entrees - m.sorties))}
              </Box>,
            ])}
          </Box>
        </Box>
      )}

      {donnees.length > 0 && vue === 'graphique' && (
        <Box ref={zone} sx={{ position: 'relative', width: '100%' }} onPointerLeave={() => setActif(null)}>
          {largeur > 0 && (
            <svg width={largeur} height={H} role="img" aria-label="Entrées et sorties par mois">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={marge.g} x2={largeur - marge.d} y1={yv(t)} y2={yv(t)} stroke={t === 0 ? c.axe : c.grille} strokeWidth="1" />
                  <text x={marge.g - 8} y={yv(t) + 4} textAnchor="end" fontSize="11.5" fill={c.discret} style={{ fontVariantNumeric: 'tabular-nums' }}>{compact(t)}</text>
                </g>
              ))}
              {donnees.map((m, i) => {
                const x0 = marge.g + i * bande;
                const cx = x0 + bande / 2;
                const en = (actif === i);
                return (
                  <g key={m.mois}>
                    {en && <rect x={x0 + 2} y={marge.h} width={bande - 4} height={ih} fill={c.grille} opacity="0.55" rx="6" />}
                    <path d={cheminBarre(cx - larg - 1, yv(m.entrees), larg, marge.h + ih - yv(m.entrees))} fill={c.entrees} opacity={actif === null || en ? 1 : 0.55} />
                    <path d={cheminBarre(cx + 1, yv(m.sorties), larg, marge.h + ih - yv(m.sorties))} fill={c.sorties} opacity={actif === null || en ? 1 : 0.55} />
                    <text x={cx} y={H - 9} textAnchor="middle" fontSize="12" fill={en ? c.texte : c.secondaire} fontWeight={en ? 700 : 400}>{moisCourt(m.mois)}</text>
                    <rect x={x0} y={marge.h} width={bande} height={ih + marge.b} fill="transparent" tabIndex={0} style={{ outline: 'none', cursor: 'default' }}
                      aria-label={`${moisLong(m.mois)} : entrées ${fcfa(m.entrees)}, sorties ${fcfa(m.sorties)}`}
                      onPointerMove={() => setActif(i)} onPointerEnter={() => setActif(i)} onFocus={() => setActif(i)} onBlur={() => setActif(null)} onClick={() => setActif(i)} />
                  </g>
                );
              })}
            </svg>
          )}
          {actif !== null && donnees[actif] && largeur > 0 && (
            <Box sx={{
              position: 'absolute', top: 8, pointerEvents: 'none', zIndex: 2, minWidth: 170,
              left: Math.min(Math.max(marge.g + actif * bande + bande / 2 - 85, 4), largeur - 178),
              bgcolor: c.surface, border: `1px solid ${c.axe}`, borderRadius: '10px', p: 1.25, boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
            }}>
              <Typography sx={{ fontSize: 12, color: c.secondaire, mb: 0.5 }}>{moisLong(donnees[actif].mois)}</Typography>
              {[['Entrées', donnees[actif].entrees, c.entrees], ['Sorties', donnees[actif].sorties, c.sorties]].map(([nom, v, col]) => (
                <Box key={nom} display="flex" alignItems="center" gap={1} py={0.15}>
                  <Box sx={{ width: 12, height: 3, borderRadius: 2, bgcolor: col }} />
                  <Typography sx={{ fontWeight: 700, fontSize: 14, color: c.texte, fontVariantNumeric: 'tabular-nums' }}>{fcfa(v)}</Typography>
                  <Typography sx={{ fontSize: 12, color: c.secondaire }}>{nom}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Panneau>
  );
}

/** État des familles : barre empilée soldés / partiels / impayés + jauge de recouvrement. */
function EtatFamilles({ c, bilan }) {
  const d = bilan.dossiers || {};
  const total = d.total || 0;
  const lignes = [
    { cle: 'solde', libelle: 'Soldés', n: d.solde || 0, col: STATUT.solde, icone: <CheckCircleIcon sx={{ fontSize: 18, color: STATUT.solde }} />, encre: '#ffffff' },
    { cle: 'partiel', libelle: 'En cours (paiement partiel)', n: d.partiel || 0, col: STATUT.partiel, icone: <TimelapseIcon sx={{ fontSize: 18, color: STATUT.partiel }} />, encre: '#0b0b0b' },
    { cle: 'impaye', libelle: 'Impayés', n: d.impaye || 0, col: STATUT.impaye, icone: <ErrorIcon sx={{ fontSize: 18, color: STATUT.impaye }} />, encre: '#ffffff' },
  ];
  const taux = Math.min(100, bilan.taux_recouvrement || 0);
  return (
    <Panneau c={c} titre="Où en sont les familles" sousTitre={`${total} dossier${total > 1 ? 's' : ''} de scolarité cette année`}>
      <Box sx={{ display: 'flex', gap: '2px', height: 24, mb: 1.5 }}>
        {total === 0 && <Box sx={{ flex: 1, bgcolor: c.grille, borderRadius: '4px' }} />}
        {total > 0 && lignes.filter((l) => l.n > 0).map((l, i, arr) => (
          <Box key={l.cle} title={`${l.libelle} : ${l.n}`} sx={{
            flex: l.n, bgcolor: l.col, color: l.encre, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12.5, fontWeight: 700, minWidth: 4,
            borderRadius: `${i === 0 ? 4 : 0}px ${i === arr.length - 1 ? 4 : 0}px ${i === arr.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px`,
          }}>
            {(l.n * 100) / total >= 12 ? l.n : ''}
          </Box>
        ))}
      </Box>
      {lignes.map((l) => (
        <Box key={l.cle} display="flex" alignItems="center" gap={1} py={0.6} sx={{ borderBottom: `1px solid ${c.grille}`, '&:last-of-type': { borderBottom: 0 } }}>
          {l.icone}
          <Typography sx={{ flex: 1, fontSize: 13.5, color: c.texte }}>{l.libelle}</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: 14, color: c.texte, fontVariantNumeric: 'tabular-nums' }}>{l.n}</Typography>
          <Typography sx={{ width: 42, textAlign: 'right', fontSize: 12.5, color: c.secondaire, fontVariantNumeric: 'tabular-nums' }}>
            {total ? Math.round((l.n * 100) / total) : 0} %
          </Typography>
        </Box>
      ))}

      <Box sx={{ mt: 2.25 }}>
        <Box display="flex" justifyContent="space-between" alignItems="baseline" mb={0.75}>
          <Typography sx={{ fontWeight: 700, fontSize: 14, color: c.texte }}>Scolarité encaissée</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: 18, color: c.texte }}>{taux} %</Typography>
        </Box>
        <Box sx={{ height: 10, borderRadius: '5px', bgcolor: c.piste, overflow: 'hidden' }} role="meter" aria-valuenow={taux} aria-valuemin={0} aria-valuemax={100}>
          <Box sx={{ width: `${taux}%`, height: '100%', bgcolor: c.entrees, borderRadius: '5px' }} />
        </Box>
        <Typography sx={{ fontSize: 12.5, color: c.secondaire, mt: 0.75 }}>
          {fcfa(bilan.entrees)} encaissés sur {fcfa(bilan.attendu)} attendus
        </Typography>
      </Box>
    </Panneau>
  );
}

function DernieresOperations({ c, bilan }) {
  const lignes = (bilan.derniers_mouvements || []).slice(0, 5);
  return (
    <Panneau c={c} titre="Dernières opérations" sousTitre="Les plus récentes, entrées et sorties"
      action={<Button component={RouterLink} to="/admin/finances" size="small" sx={{ textTransform: 'none' }}>Voir tout</Button>}>
      {lignes.length === 0 && <Typography sx={{ color: c.secondaire, fontSize: 13.5 }}>Aucune opération pour l’instant.</Typography>}
      {lignes.map((m, i) => (
        <Box key={`${m.horodatage}-${i}`} display="flex" alignItems="center" gap={1.25} py={0.9} sx={{ borderBottom: i < lignes.length - 1 ? `1px solid ${c.grille}` : 0 }}>
          <Box sx={{ width: 34, height: 34, borderRadius: '10px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: m.type === 'entree' ? c.piste : c.grille, color: m.type === 'entree' ? c.entrees : c.sorties, fontWeight: 800, fontSize: 16 }}>
            {m.type === 'entree' ? '↓' : '↑'}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, color: c.texte }}>{m.libelle}</Typography>
            <Typography noWrap sx={{ fontSize: 12, color: c.secondaire }}>{jourFr(m.date)} · {m.detail}</Typography>
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', color: m.type === 'entree' ? c.bonTexte : c.critiqueTexte, fontVariantNumeric: 'tabular-nums' }}>
            {m.type === 'entree' ? '+ ' : '- '}{fcfa(m.montant)}
          </Typography>
        </Box>
      ))}
    </Panneau>
  );
}

function PlusGrosRestes({ c, bilan }) {
  const lignes = bilan.plus_gros_restes || [];
  const max = Math.max(1, ...lignes.map((l) => l.reste));
  return (
    <Panneau c={c} titre="Plus gros restes à payer" sousTitre="Les familles à relancer en priorité"
      action={<Button component={RouterLink} to="/admin/caisse" size="small" sx={{ textTransform: 'none' }}>Voir tout</Button>}>
      {lignes.length === 0 && <Typography sx={{ color: c.secondaire, fontSize: 13.5 }}>Tout est réglé : aucun reste à payer.</Typography>}
      {lignes.map((l) => (
        <Box key={l.dossier} sx={{ mb: 1.5 }}>
          <Box display="flex" justifyContent="space-between" alignItems="baseline" gap={1} mb={0.5}>
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, color: c.texte }}>{l.eleve}</Typography>
              <Typography sx={{ fontSize: 12, color: c.secondaire }}>{l.classe}{l.statut === 'PARTIEL' ? ' · paiement partiel' : ' · rien payé'}</Typography>
            </Box>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: c.texte, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fcfa(l.reste)}</Typography>
          </Box>
          <Box sx={{ height: 8, bgcolor: c.grille, borderRadius: '0 4px 4px 0' }}>
            <Box sx={{ width: `${Math.max(3, (l.reste * 100) / max)}%`, height: '100%', bgcolor: c.entrees, borderRadius: '0 4px 4px 0' }} />
          </Box>
        </Box>
      ))}
    </Panneau>
  );
}

export default function DashboardComptable() {
  const theme = useTheme();
  const c = theme.palette.mode === 'dark' ? SOMBRE : CLAIR;
  const [bilan, setBilan] = useState(null);
  const [prenom, setPrenom] = useState('');
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    api.get('/depenses/bilan/').then((r) => setBilan(r.data)).catch((e) => setErreur(e.response?.data?.detail || 'Impossible de charger les chiffres de la caisse.'));
    api.get('/auth/me/').then((r) => setPrenom(r.data.first_name || '')).catch(() => {});
  }, []);

  const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const jourTexte = aujourdhui.charAt(0).toUpperCase() + aujourdhui.slice(1);
  const mois = bilan?.par_mois || [];
  const cumul = (() => { let t = 0; return mois.map((m) => { t += m.entrees - m.sorties; return t; }); })();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 22, sm: 26 }, fontWeight: 700, color: c.texte, lineHeight: 1.2 }}>
            {prenom ? `Bonjour ${prenom}` : 'Caisse'}
          </Typography>
          <Typography sx={{ color: c.secondaire, fontSize: 14 }}>{jourTexte} · situation de la caisse de l’école</Typography>
        </Box>
        <Box display="flex" gap={1} flexWrap="wrap">
          <Button component={RouterLink} to="/admin/caisse" variant="contained" startIcon={<PaymentsIcon />}>Encaisser</Button>
          <Button component={RouterLink} to="/admin/finances" variant="outlined" startIcon={<AddCardIcon />}>Noter une dépense</Button>
          <Button component={RouterLink} to="/admin/finances" variant="outlined" startIcon={<ReceiptLongIcon />}>Journal de caisse</Button>
        </Box>
      </Box>

      {erreur && <Alert severity="error" sx={{ mb: 2 }}>{erreur}</Alert>}
      {!bilan && !erreur && <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>}

      {bilan && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: { xs: 1.25, sm: 2 }, mb: 2 }}>
            <Tuile c={c} libelle="Entrées de l’année" valeur={fcfa(bilan.entrees)} couleur={c.entrees} points={mois.map((m) => m.entrees)}
              detail={`Aujourd’hui : ${fcfa(bilan.aujourdhui?.entrees)} · ${bilan.aujourdhui?.nb_recus || 0} reçu${(bilan.aujourdhui?.nb_recus || 0) > 1 ? 's' : ''}`} />
            <Tuile c={c} libelle="Sorties de l’année" valeur={fcfa(bilan.sorties)} couleur={c.sorties} points={mois.map((m) => m.sorties)}
              detail={`Aujourd’hui : ${fcfa(bilan.aujourdhui?.sorties)}`} />
            <Tuile c={c} libelle="Solde en caisse" valeur={`${bilan.solde < 0 ? '- ' : ''}${fcfa(Math.abs(bilan.solde))}`} couleur={bilan.solde < 0 ? STATUT.impaye : STATUT.solde} points={cumul}
              detail={`Ce mois : ${(bilan.ce_mois?.entrees || 0) - (bilan.ce_mois?.sorties || 0) < 0 ? '- ' : '+ '}${fcfa(Math.abs((bilan.ce_mois?.entrees || 0) - (bilan.ce_mois?.sorties || 0)))}`} />
            <Tuile c={c} libelle="Reste à recouvrer" valeur={fcfa(bilan.reste_a_recouvrer)} couleur={STATUT.partiel}
              detail={`${bilan.dossiers?.impaye || 0} impayé${(bilan.dossiers?.impaye || 0) > 1 ? 's' : ''} · ${bilan.dossiers?.partiel || 0} en cours`} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.7fr 1fr' }, gap: 2, mb: 2 }}>
            <GraphiqueMois c={c} mois={mois} />
            <EtatFamilles c={c} bilan={bilan} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
            <DernieresOperations c={c} bilan={bilan} />
            <PlusGrosRestes c={c} bilan={bilan} />
          </Box>
        </>
      )}
    </Box>
  );
}
