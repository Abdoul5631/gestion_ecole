import { useEffect, useState } from 'react';
import api from 'services/api';
import authService from 'services/auth';
import {
  Box, Typography, MenuItem, TextField, Grid, Button,
  CircularProgress, Alert, Card, CardContent, Switch, FormControlLabel
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { classeService, eleveService, trimestreService, anneeService, parametresService, bulletinService } from 'services/api';
import { imprimerBulletin } from 'utils/printBulletin';
import { nuances } from 'utils/couleurs';

import ScrollableDoc from 'components/ScrollableDoc';
function getMentionGenerale(moy) {
  if (moy >= 16) return 'Félicitations';
  if (moy >= 14) return 'Encouragement';
  if (moy >= 12) return 'Tableau d\'honneur';
  if (moy >= 10) return 'Satisfaisant doit continuer';
  if (moy >= 8)  return 'Peut Mieux Faire';
  if (moy >= 5)  return 'Insuffisant';
  return 'Risque de Redoubler';
}

const MENTIONS_LEFT = [
  'Satisfaisant doit continuer',
  'Peut Mieux Faire',
  'Insuffisant',
  'Risque de Redoubler',
  'Risque l\'exclusion',
];
const MENTIONS_RIGHT = [
  'Félicitations',
  'Encouragement',
  'Tableau d\'honneur',
  'Avertissement',
  'Blâme',
];

function fmt(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') return val.toFixed(2);
  return val;
}

// ─── Composant bulletin imprimable (exporté pour réutilisation) ─
export function BulletinPrint(props) {
  return <ScrollableDoc><BulletinPrintDoc {...props} /></ScrollableDoc>;
}

function BulletinPrintDoc({ data, ecole = {} }) {
  const mention = getMentionGenerale(data.moyenne_generale);
  // couleur de l'école (assombrie si trop claire pour un texte blanc) ; nuances pour les fonds
  const c = nuances(ecole.couleur_primaire || '#1f3a5f');
  const bord = '#c3c8cf';
  const fille = data.eleve.sexe === 'F';
  const rangTexte = (r, f = false) => (r == null ? '—' : r === 1 ? (f ? '1ère' : '1er') : `${r}e`);
  const couleurMoy = (m) => ((m ?? 0) >= 10 ? '#0b6b2f' : '#b42318');

  const td = { border: `1px solid ${bord}`, padding: '4px 6px', fontSize: '11.5px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' };
  const th = { ...td, background: '#f1f3f6', color: '#3b4250', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.3px', padding: '6px 4px', borderBottom: `2px solid ${c.main}` };
  const gauche = { ...td, textAlign: 'left' };
  const etiquette = { fontSize: '9.5px', color: '#5b6472', textTransform: 'uppercase', letterSpacing: '0.4px' };
  const encadre = { border: `1px solid ${bord}`, borderRadius: 6, padding: '8px 10px' };

  // moyenne de chaque groupe de matières (littéraires, scientifiques, autres)
  const GROUPES = { LITTERATURE: 'Matières littéraires', SCIENTIFIQUE: 'Matières scientifiques', AUTRES: 'Autres matières' };
  const parGroupe = [];
  data.disciplines.forEach((d) => {
    let g = parGroupe.find((x) => x.type === d.matiere_type);
    if (!g) { g = { type: d.matiere_type, lignes: [] }; parGroupe.push(g); }
    g.lignes.push(d);
  });
  const moyenneGroupe = (lignes) => {
    const coef = lignes.reduce((t, d) => t + Number(d.coef || 0), 0);
    const pts = lignes.reduce((t, d) => t + Number(d.moy_coef || 0), 0);
    return coef ? pts / coef : null;
  };

  const ville = ecole.ville || '';
  const aujourdhui = new Date().toLocaleDateString('fr-FR');
  const stats = data.stats_classe;

  return (
    <div id="bulletin-print" style={{
      fontFamily: 'Arial, Helvetica, sans-serif', color: '#14181f', padding: '18px 20px', maxWidth: 820,
      margin: '0 auto', border: '1px solid #d0d4da', background: '#fff', boxSizing: 'border-box',
    }}>
      {/* ─── En-tête officiel ─── */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ width: '38%', verticalAlign: 'top', fontSize: '11px', lineHeight: 1.45 }}>
              {ecole.direction_regionale && <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '10.5px' }}>{ecole.direction_regionale}</div>}
              {ecole.direction_provinciale && <div style={{ textTransform: 'uppercase', fontSize: '10.5px' }}>{ecole.direction_provinciale}</div>}
              <div style={{ fontWeight: 800, fontSize: '13px', marginTop: 4, color: c.dark }}>{ecole.nom_ecole || 'Établissement'}</div>
              <div style={{ color: '#4a5260' }}>
                {[ecole.boite_postale, ecole.ville].filter(Boolean).join(' · ')}
              </div>
              {ecole.telephone && <div style={{ color: '#4a5260' }}>Tél. : {ecole.telephone}</div>}
              {ecole.email && <div style={{ color: '#4a5260' }}>{ecole.email}</div>}
            </td>
            <td style={{ width: '24%', textAlign: 'center', verticalAlign: 'middle' }}>
              {ecole.logo_url && (
                <img src={ecole.logo_url} alt="Logo" crossOrigin="anonymous"
                  style={{ width: 78, height: 78, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
              )}
              {ecole.devise && <div style={{ fontSize: '10px', fontStyle: 'italic', color: '#4a5260', marginTop: 4 }}>« {ecole.devise} »</div>}
            </td>
            <td style={{ width: '38%', verticalAlign: 'top', textAlign: 'right' }}>
              <div style={{ display: 'inline-block', textAlign: 'center', border: `1.5px solid ${c.main}`, borderRadius: 6, padding: '6px 14px' }}>
                <div style={{ ...etiquette, color: c.dark }}>Année scolaire</div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: c.dark }}>{data.trimestre.annee}</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ─── Titre ─── */}
      <div style={{
        marginTop: 12, marginBottom: 10, background: c.main, color: '#fff', textAlign: 'center', padding: '6px 10px',
        borderRadius: 4, fontWeight: 700, fontSize: '14px', letterSpacing: '1.5px', textTransform: 'uppercase',
        WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
      }}>
        Bulletin de notes · {data.trimestre.nom}
      </div>

      {/* ─── L'élève ─── */}
      <div style={{ ...encadre, display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, padding: '6px 10px' }}>
        {data.eleve.photo_url && (
          <img src={data.eleve.photo_url} alt="" crossOrigin="anonymous"
            style={{ width: 48, height: 58, objectFit: 'cover', borderRadius: 4, border: `1px solid ${bord}`, flexShrink: 0 }} />
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
          <tbody>
            {[
              [['Nom et prénom(s)', `${data.eleve.nom} ${data.eleve.prenom}`], ['Classe', data.classe || '—'], ['Effectif', data.nb_eleves ?? '—']],
              [['Né(e) le', [data.eleve.date_naissance, data.eleve.lieu_naissance && `à ${data.eleve.lieu_naissance}`].filter(Boolean).join(' ') || '—'],
                ['Matricule', data.eleve.matricule], ['Redoublant', data.redoublant ? 'Oui' : 'Non']],
              [['Sexe', data.eleve.sexe === 'M' ? 'Masculin' : data.eleve.sexe === 'F' ? 'Féminin' : '—'], null, null],
            ].map((ligne, i) => (
              <tr key={i}>
                {ligne.map((cellule, j) => (
                  <td key={j} style={{ padding: '2px 6px', width: j === 0 ? '46%' : '27%', whiteSpace: 'nowrap' }}>
                    {cellule && <><span style={{ color: '#5b6472' }}>{cellule[0]} : </span><strong>{cellule[1]}</strong></>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Disciplines ─── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', width: '24%', paddingLeft: 8 }}>Disciplines</th>
            <th style={{ ...th, width: '7%' }}>Devoir</th>
            <th style={{ ...th, width: '7%' }}>Compo.</th>
            <th style={{ ...th, width: '8%' }}>Moy./20</th>
            <th style={{ ...th, width: '6%' }}>Coef.</th>
            <th style={{ ...th, width: '8%' }}>Total</th>
            <th style={{ ...th, width: '6%' }}>Rang</th>
            <th style={{ ...th, width: '22%' }}>Appréciation</th>
            <th style={{ ...th, width: '12%' }}>Signature</th>
          </tr>
        </thead>
        <tbody>
          {parGroupe.map((g) => {
            const mg = moyenneGroupe(g.lignes);
            return [
              <tr key={`g-${g.type}`}>
                <td colSpan={9} style={{ ...gauche, padding: '4px 8px', background: '#fff', borderLeft: `3px solid ${c.main}` }}>
                  <span style={{ fontWeight: 800, fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.6px', color: c.darker }}>
                    {GROUPES[g.type] || g.type}
                  </span>
                  {mg != null && (
                    <span style={{ float: 'right', fontSize: '10.5px', color: '#4a5260' }}>
                      Moyenne du groupe : <strong style={{ color: couleurMoy(mg) }}>{mg.toFixed(2)}</strong>
                    </span>
                  )}
                </td>
              </tr>,
              ...g.lignes.map((d, i) => (
                <tr key={`${g.type}-${d.matiere}`} style={{ background: i % 2 ? '#fafbfc' : '#fff' }}>
                  <td style={{ ...gauche, fontWeight: 600, paddingLeft: 11 }}>{d.matiere}</td>
                  <td style={td}>{fmt(d.devoir)}</td>
                  <td style={td}>{fmt(d.composition)}</td>
                  <td style={{ ...td, fontWeight: 800, color: couleurMoy(d.moy_20) }}>{fmt(d.moy_20)}</td>
                  <td style={td}>{d.coef}</td>
                  <td style={td}>{fmt(d.moy_coef)}</td>
                  <td style={td}>{rangTexte(d.rang)}</td>
                  <td style={{ ...gauche, fontSize: '11px' }}>{d.appreciation}</td>
                  <td style={{ ...td, padding: 1 }}>
                    {d.enseignant_signature_url && (
                      <img src={d.enseignant_signature_url} alt="" crossOrigin="anonymous"
                        style={{ height: 24, maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                    )}
                  </td>
                </tr>
              )),
            ];
          })}
          <tr style={{ background: '#f1f3f6' }}>
            <td colSpan={4} style={{ ...gauche, fontWeight: 800, paddingLeft: 8 }}>Total</td>
            <td style={{ ...td, fontWeight: 800 }}>{data.total_coef}</td>
            <td style={{ ...td, fontWeight: 800 }}>{fmt(data.total_moy_coef)}</td>
            <td colSpan={3} style={td} />
          </tr>
        </tbody>
      </table>

      {/* ─── Résultats du trimestre ─── */}
      <table style={{ width: 'calc(100% + 16px)', borderCollapse: 'separate', borderSpacing: '8px 0', margin: '0 -8px 10px', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
        <tbody>
          <tr>
            <td style={{ ...encadre, width: '26%', textAlign: 'center', background: c.lighter, borderColor: c.light }}>
              <div style={{ ...etiquette, color: c.darker }}>Moyenne du trimestre</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: couleurMoy(data.moyenne_generale) }}>
                {fmt(data.moyenne_generale)}<span style={{ fontSize: '12px', color: '#4a5260' }}> / 20</span>
              </div>
            </td>
            <td style={{ ...encadre, width: '18%', textAlign: 'center' }}>
              <div style={etiquette}>Rang</div>
              <div style={{ fontSize: '20px', fontWeight: 800 }}>
                {rangTexte(data.rang_general, fille)}<span style={{ fontSize: '11px', color: '#4a5260', fontWeight: 600 }}> / {data.nb_eleves ?? '—'}</span>
              </div>
            </td>
            <td style={{ ...encadre, width: '34%' }}>
              <div style={{ ...etiquette, marginBottom: 3 }}>Résultats de la classe</div>
              {stats ? (
                <div style={{ fontSize: '11.5px', lineHeight: 1.6 }}>
                  Moyenne de la classe : <strong>{fmt(stats.moyenne)}</strong><br />
                  Plus forte : <strong>{fmt(stats.plus_forte)}</strong> · Plus faible : <strong>{fmt(stats.plus_faible)}</strong>
                </div>
              ) : <div style={{ fontSize: '11.5px', color: '#8a919c' }}>—</div>}
            </td>
            <td style={{ ...encadre, width: '22%' }}>
              <div style={{ ...etiquette, marginBottom: 3 }}>Assiduité</div>
              <div style={{ fontSize: '11.5px', lineHeight: 1.6 }}>
                Absences : <strong>{data.absences ?? 0}</strong>
                {data.absences_justifiees > 0 && ` (dont ${data.absences_justifiees} justifiée${data.absences_justifiees > 1 ? 's' : ''})`}<br />Retards : <strong>{data.retards ?? 0}</strong>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {data.est_trimestre_3 && data.moyennes_annuelles && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
          <thead>
            <tr><th colSpan={5} style={{ ...th, textAlign: 'left', paddingLeft: 8 }}>Bilan de l’année</th></tr>
            <tr>
              {['1er trimestre', '2e trimestre', '3e trimestre', 'Moyenne annuelle', 'Décision du conseil'].map((t) => (
                <th key={t} style={{ ...td, fontWeight: 700, fontSize: '10.5px', background: '#eef0f3' }}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>{fmt(data.moyennes_annuelles.t1)}</td>
              <td style={td}>{fmt(data.moyennes_annuelles.t2)}</td>
              <td style={td}>{fmt(data.moyennes_annuelles.t3)}</td>
              <td style={{ ...td, fontWeight: 800, fontSize: '13px', color: (data.moyennes_annuelles.annuelle ?? 0) >= (data.decision?.seuil ?? 10) ? '#0b6b2f' : '#b42318' }}>
                {fmt(data.moyennes_annuelles.annuelle)} / 20
              </td>
              <td style={{ ...gauche, fontWeight: 800 }}>
                {data.decision?.libelle || '—'}
                {data.decision?.detail && <div style={{ fontWeight: 400, fontSize: '10px', marginTop: 2 }}>{data.decision.detail}</div>}
                {data.decision?.seuil != null && !data.decision?.niveau_examen && (
                  <div style={{ fontWeight: 400, fontSize: '10px' }}>Seuil : {data.decision.seuil}/20 (moyenne des 3 trimestres)</div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* ─── Mentions du conseil ─── */}
      <div style={{ ...encadre, marginBottom: 10 }}>
        <div style={{ ...etiquette, marginBottom: 5 }}>Décision du conseil de classe</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {MENTIONS_RIGHT.map((m, i) => (
              <tr key={m}>
                {[m, MENTIONS_LEFT[i]].map((x) => x && (
                  <td key={x} style={{ width: '50%', padding: '2px 0', fontSize: '11.5px' }}>
                    <span style={{
                      display: 'inline-block', width: 12, height: 12, border: `1.5px solid ${mention === x ? c.dark : '#8a919c'}`, borderRadius: 2,
                      marginRight: 7, verticalAlign: '-2px', textAlign: 'center', lineHeight: '11px', fontSize: '11px', fontWeight: 800,
                      color: '#fff', background: mention === x ? c.dark : 'transparent', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
                    }}>{mention === x ? '✓' : ''}</span>
                    <span style={{ fontWeight: mention === x ? 800 : 400 }}>{x}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Observations et signatures ─── */}
      <table style={{ width: 'calc(100% + 16px)', borderCollapse: 'separate', borderSpacing: '8px 0', margin: '0 -8px' }}>
        <tbody>
          <tr>
            <td style={{ ...encadre, width: '38%', verticalAlign: 'top', height: 110 }}>
              <div style={etiquette}>Observations du conseil des professeurs</div>
            </td>
            <td style={{ ...encadre, width: '30%', verticalAlign: 'top', textAlign: 'center' }}>
              <div style={etiquette}>Le professeur principal</div>
              {data.professeur_principal?.signature_url
                ? <img src={data.professeur_principal.signature_url} alt="" crossOrigin="anonymous" style={{ maxWidth: '100%', height: 52, objectFit: 'contain', margin: '6px auto 2px', display: 'block' }} />
                : <div style={{ height: 60 }} />}
              <div style={{ borderTop: `1px solid ${bord}`, paddingTop: 3, fontSize: '11px', fontWeight: 700 }}>
                {[data.professeur_principal?.prenom, data.professeur_principal?.nom].filter(Boolean).join(' ') || ' '}
              </div>
            </td>
            <td style={{ ...encadre, width: '32%', verticalAlign: 'top', textAlign: 'center' }}>
              <div style={etiquette}>Le chef d’établissement</div>
              <div style={{ fontSize: '10px', color: '#4a5260', marginTop: 2 }}>{ville ? `Fait à ${ville}, le ${aujourdhui}` : `Le ${aujourdhui}`}</div>
              <div style={{ position: 'relative', height: 66 }}>
                {ecole.tampon_url && (
                  <img src={ecole.tampon_url} alt="" crossOrigin="anonymous"
                    style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', height: 62, maxWidth: '80%', objectFit: 'contain', opacity: 0.85 }} />
                )}
                {ecole.signature_url && (
                  <img src={ecole.signature_url} alt="" crossOrigin="anonymous"
                    style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', height: 40, maxWidth: '90%', objectFit: 'contain' }} />
                )}
              </div>
              <div style={{ borderTop: `1px solid ${bord}`, paddingTop: 3, fontSize: '11px', fontWeight: 700 }}>{ecole.directeur || ' '}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 10, paddingTop: 6, borderTop: `1px solid ${bord}`, fontSize: '9.5px', color: '#6b7280', textAlign: 'center' }}>
        Bulletin à conserver soigneusement : il ne sera pas délivré de duplicata. · {ecole.nom_ecole || ''}
      </div>
    </div>
  );
}

// ─── Classement (palmarès) imprimable d'une classe, du 1er au dernier ─
export function ClassementPrint(props) {
  return <ScrollableDoc><ClassementPrintDoc {...props} /></ScrollableDoc>;
}

function ClassementPrintDoc({ data, ecole = {} }) {
  const tdStyle = { border: '1px solid #333', padding: '3px 6px', fontSize: '12px', textAlign: 'center' };
  const thStyle = { ...tdStyle, background: '#f0f0f0', fontWeight: 'bold' };
  const leftTd = { ...tdStyle, textAlign: 'left' };

  return (
    <Box id="classement-print" sx={{
      fontFamily: 'Arial, sans-serif', p: 2, maxWidth: '700px', margin: '0 auto',
      border: '1px solid #ccc', bgcolor: 'white',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'top', fontSize: '12px' }}>
              <div style={{ fontWeight: 'bold' }}>{ecole.nom_ecole || 'Établissement'}</div>
              {ecole.ville && <div>{ecole.ville}</div>}
            </td>
            <td style={{ width: '50%', textAlign: 'right', verticalAlign: 'top' }}>
              {ecole.logo_url && (
                <img src={ecole.logo_url} alt="Logo" style={{ width: 48, height: 48, objectFit: 'contain' }} />
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: 'center', fontSize: '15px', fontWeight: 'bold',
        textTransform: 'uppercase', border: '2px solid #333',
        padding: '6px', marginBottom: '8px', letterSpacing: '1px' }}>
        Classement de la Classe
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td><strong>Classe :</strong> {data.classe}</td>
            <td><strong>Trimestre :</strong> {data.trimestre.nom} — {data.trimestre.annee}</td>
            <td><strong>Effectif :</strong> {data.nb_eleves}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '10%' }}>Rang</th>
            <th style={{ ...thStyle, width: '20%' }}>Matricule</th>
            <th style={{ ...thStyle, textAlign: 'left', width: '45%' }}>Nom Prénom</th>
            <th style={{ ...thStyle, width: '25%' }}>Moyenne/20</th>
          </tr>
        </thead>
        <tbody>
          {data.classement.map((r, i) => (
            <tr key={r.eleve_id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ ...tdStyle, fontWeight: 'bold' }}>{r.rang}</td>
              <td style={tdStyle}>{r.matricule}</td>
              <td style={leftTd}>{r.nom} {r.prenom}</td>
              <td style={{ ...tdStyle, fontWeight: 'bold',
                color: r.moyenne_generale >= 10 ? '#006600' : '#cc0000' }}>
                {r.moyenne_generale}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}

// ─── Page principale ─────────────────────────────────────────────
export default function Bulletin() {
  const [classes, setClasses] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [trimestres, setTrimestres] = useState([]);
  const [bulletinData, setBulletinData] = useState(null);
  const [selectedClasse, setSelectedClasse] = useState('');
  const [selectedTrimestre, setSelectedTrimestre] = useState('');
  const [annees, setAnnees] = useState([]);
  const [selectedAnnee, setSelectedAnnee] = useState('');
  const [selectedEleve, setSelectedEleve] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ecole, setEcole] = useState({});

  const [classementData, setClassementData] = useState(null);
  const [loadingClassement, setLoadingClassement] = useState(false);
  const [errorClassement, setErrorClassement] = useState('');
  const [publishMsg, setPublishMsg] = useState('');

  const role = authService.getRole();
  const isAdminOrEnseignant = role === 'ADMIN' || role === 'ENSEIGNANT';

  useEffect(() => {
    trimestreService.getAll().then(res => {
      const items = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
      setTrimestres(items);
      const actif = items.find(t => t.annee_active && t.is_active) || items.find(t => t.annee_active) || items[0];
      if (actif) { setSelectedTrimestre(actif.id); setSelectedAnnee(actif.annee_scolaire); }
    });
    anneeService.getAll().then(res => {
      const items = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
      setAnnees([...items].sort((a, b) => String(b.libelle).localeCompare(String(a.libelle))));
    }).catch(() => {});
    parametresService.get().then(res => setEcole(res.data)).catch(() => {});
    if (isAdminOrEnseignant) {
      classeService.getAll().then(res => {
        const items = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
        setClasses(items);
      });
    } else {
      api.get('/auth/me/').then(res => {
        const eleveId = res.data.eleve;
        if (eleveId) setSelectedEleve(eleveId);
      });
    }
  }, []);

  const handleClasseChange = (e) => {
    setSelectedClasse(e.target.value);
    setSelectedEleve('');
    setBulletinData(null);
    setClassementData(null);
    if (e.target.value) {
      eleveService.getAll(`/eleves/?classe_id=${e.target.value}`)
        .then(res => setEleves(Array.isArray(res.data) ? res.data : res.data.results ?? []));
    } else {
      setEleves([]);
    }
  };

  const fetchClassement = () => {
    if (!selectedClasse || !selectedTrimestre) return;
    setLoadingClassement(true);
    setErrorClassement('');
    setClassementData(null);
    api.get(`/notes/classement/?classe_id=${selectedClasse}&trimestre_id=${selectedTrimestre}`)
      .then(res => setClassementData(res.data))
      .catch(() => setErrorClassement('Erreur lors du chargement du classement.'))
      .finally(() => setLoadingClassement(false));
  };

  const fetchBulletin = () => {
    if (!selectedTrimestre || !selectedEleve) return;
    setLoading(true);
    setError('');
    setBulletinData(null);
    api.get(`/notes/bulletin/?eleve_id=${selectedEleve}&trimestre_id=${selectedTrimestre}`)
      .then(res => setBulletinData(res.data))
      .catch(() => setError('Erreur lors du chargement du bulletin.'))
      .finally(() => setLoading(false));
  };

  // L'année en cours est proposée par défaut ; le directeur peut choisir n'importe quelle autre année
  const trimestresVisibles = trimestres.filter(t => !selectedAnnee || t.annee_scolaire === selectedAnnee);

  const changerAnnee = (id) => {
    setSelectedAnnee(id);
    const premier = trimestres.find(t => t.annee_scolaire === id);
    setSelectedTrimestre(premier ? premier.id : '');
    setBulletinData(null);
    setClassementData(null);
  };

  const trimestreChoisi = trimestres.find(t => t.id === selectedTrimestre);
  const bulletinsOuverts = !!trimestreChoisi?.bulletins_ouverts;

  const basculerOuverture = async (ouverts) => {
    try {
      const res = await trimestreService.ouvrirBulletins(selectedTrimestre, ouverts);
      setTrimestres(prev => prev.map(t => (t.id === res.data.id ? { ...t, bulletins_ouverts: res.data.bulletins_ouverts } : t)));
      setPublishMsg(ouverts
        ? 'Bulletins ouverts : les élèves et les parents peuvent maintenant les consulter pour ce trimestre.'
        : 'Bulletins fermés : les élèves et les parents ne les voient plus.');
    } catch {
      setError("Impossible de modifier l'ouverture des bulletins.");
    }
  };

  const handlePublier = async () => {
    if (!selectedTrimestre) return;
    try {
      const res = await bulletinService.publier({
        trimestre_id: selectedTrimestre,
        classe_id: selectedClasse || undefined,
      });
      setPublishMsg(`Bulletin annoncé. Le parent voit le message dans son espace Messages (${res.data.envoyes} message(s)).`);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Impossible de publier le bulletin.');
    }
  };

  const handlePrint = () => imprimerBulletin('bulletin-print', 'Bulletin de notes');

  const handleDownloadPDF = async () => {
    if (!selectedEleve || !selectedTrimestre) return;
    const nom = bulletinData?.eleve ? `${bulletinData.eleve.nom}_${bulletinData.eleve.prenom}` : 'eleve';
    const trim = bulletinData?.trimestre?.nom?.replace(/\s+/g, '_') || 'T1';
    try {
      await bulletinService.telechargerPdf(selectedEleve, selectedTrimestre, `bulletin_${nom}_${trim}.pdf`);
    } catch (e) {
      console.error('Erreur PDF:', e);
      setError('Impossible de télécharger le bulletin PDF.');
    }
  };

  const handlePrintClassement = () => {
    const content = document.getElementById('classement-print');
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Classement</title>
      <style>body{margin:0;font-family:Arial,sans-serif;}@media print{body{margin:0;}}</style>
      </head><body>${content.outerHTML}</body></html>`);
    w.document.close(); w.focus(); w.print(); w.close();
  };

  const handleDownloadPDFClassement = async () => {
    const content = document.getElementById('classement-print');
    if (!content) return;
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'), import('html2canvas')
      ]);
      const canvas = await html2canvas(content, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let yPos = 0;
      let heightLeft = imgH;
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, pageW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        yPos = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, yPos, pageW, imgH);
        heightLeft -= pageH;
      }
      const nomClasse = (classementData?.classe || 'classe').replace(/\s+/g, '_');
      const trim = classementData?.trimestre?.nom?.replace(/\s+/g, '_') || 'T1';
      pdf.save(`classement_${nomClasse}_${trim}.pdf`);
    } catch (e) {
      console.error('Erreur PDF:', e);
    }
  };

  return (
    <Box>
      {/* ─── Sélecteurs (non imprimés) ─── */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">Bulletin de Notes</Typography>
        <Box display="flex" gap={1} flexWrap="wrap">
          {role === 'ADMIN' && (
            <Button size="small" variant="outlined" color="secondary" onClick={handlePublier}
              disabled={!selectedTrimestre || !bulletinsOuverts}>
              Annoncer aux parents
            </Button>
          )}
          {bulletinData && (
            <>
              <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint}>
                Imprimer
              </Button>
              <Button size="small" variant="contained" startIcon={<DownloadIcon />} onClick={handleDownloadPDF}>
                PDF
              </Button>
            </>
          )}
        </Box>
      </Box>

      {role === 'ADMIN' && selectedTrimestre && (
        <Alert severity={bulletinsOuverts ? 'success' : 'warning'} sx={{ mb: 2, alignItems: 'center' }}
          action={(
            <FormControlLabel sx={{ mr: 1 }} label={bulletinsOuverts ? 'Ouverts' : 'Fermés'}
              control={<Switch checked={bulletinsOuverts} onChange={e => basculerOuverture(e.target.checked)} />} />
          )}>
          {bulletinsOuverts
            ? `Les élèves et les parents peuvent consulter les bulletins du ${trimestreChoisi?.nom}.`
            : `Les élèves et les parents ne voient pas encore les bulletins du ${trimestreChoisi?.nom}. Ouvrez-les quand ils sont prêts.`}
        </Alert>
      )}

      {publishMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setPublishMsg('')}>{publishMsg}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            {isAdminOrEnseignant && (
              <>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>1. Classe</Typography>
                  <TextField select fullWidth size="small" value={selectedClasse} onChange={handleClasseChange}>
                    <MenuItem value=""><em>Sélectionner une classe</em></MenuItem>
                    {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>2. Élève</Typography>
                  <TextField select fullWidth size="small" value={selectedEleve}
                    onChange={e => { setSelectedEleve(e.target.value); setBulletinData(null); }}
                    disabled={!selectedClasse || eleves.length === 0}>
                    <MenuItem value=""><em>Choisir un élève</em></MenuItem>
                    {eleves.map(e => (
                      <MenuItem key={e.id} value={e.id}>{e.matricule} — {e.nom} {e.prenom}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </>
            )}
            <Grid size={{ xs: 12, md: isAdminOrEnseignant ? 3 : 9 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {isAdminOrEnseignant ? '3. Trimestre' : 'Trimestre'}
              </Typography>
              <TextField select fullWidth size="small" label="Année scolaire" value={selectedAnnee}
                onChange={e => changerAnnee(e.target.value)} sx={{ mb: 1 }}>
                {annees.map(a => (
                  <MenuItem key={a.id} value={a.id}>{a.libelle}{a.is_active ? ' (en cours)' : ''}</MenuItem>
                ))}
              </TextField>
              <TextField select fullWidth size="small" value={selectedTrimestre}
                onChange={e => { setSelectedTrimestre(e.target.value); setBulletinData(null); }}>
                <MenuItem value=""><em>Choisir un trimestre</em></MenuItem>
                {trimestresVisibles.map(t => (
                  <MenuItem key={t.id} value={t.id}>{t.nom}</MenuItem>
                ))}
              </TextField>
              {selectedAnnee && trimestresVisibles.length === 0 && (
                <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                  Aucun trimestre enregistré pour cette année.
                </Typography>
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 1 }} sx={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button variant="contained" fullWidth onClick={fetchBulletin}
                disabled={!selectedTrimestre || !selectedEleve || loading}>
                {loading ? <CircularProgress size={20} color="inherit" /> : 'Afficher'}
              </Button>
            </Grid>
          </Grid>
          {isAdminOrEnseignant && (
            <Box mt={2} display="flex" justifyContent="flex-end">
              <Button size="small" variant="outlined" startIcon={<EmojiEventsIcon />}
                onClick={fetchClassement}
                disabled={!selectedClasse || !selectedTrimestre || loadingClassement}>
                {loadingClassement ? 'Chargement...' : 'Classement de la classe'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      )}

      {bulletinData && !loading && (
        bulletinData.disciplines.length === 0 ? (
          <Alert severity="info">Aucune note enregistrée pour cet élève ce trimestre.</Alert>
        ) : (
          <BulletinPrint data={bulletinData} ecole={ecole} />
        )
      )}

      {errorClassement && <Alert severity="error" sx={{ mb: 2 }}>{errorClassement}</Alert>}

      {loadingClassement && (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      )}

      {classementData && !loadingClassement && (
        <Box mt={3}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
            <Typography variant="h6">Classement — {classementData.classe}</Typography>
            <Box display="flex" gap={1}>
              <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={handlePrintClassement}>
                Imprimer
              </Button>
              <Button size="small" variant="contained" startIcon={<DownloadIcon />} onClick={handleDownloadPDFClassement}>
                PDF
              </Button>
            </Box>
          </Box>
          {classementData.classement.length === 0 ? (
            <Alert severity="info">Aucune note enregistrée pour cette classe ce trimestre.</Alert>
          ) : (
            <ClassementPrint data={classementData} ecole={ecole} />
          )}
        </Box>
      )}
    </Box>
  );
}
