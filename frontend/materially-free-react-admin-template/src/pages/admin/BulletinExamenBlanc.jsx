import { idTrimestreParDefaut, trimestresEnCours } from 'utils/anneeDefaut';
import { useEffect, useState } from 'react';
import api from 'services/api';
import {
  Box, Typography, MenuItem, TextField, Grid, Button,
  CircularProgress, Alert, Card, CardContent, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { classeService, eleveService, trimestreService, niveauService, parametresService, deliberationService, getResults } from 'services/api';

import ScrollableDoc from 'components/ScrollableDoc';
function fmt(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') return val.toFixed(2);
  return val;
}

const GROUP_LABELS = {
  LITTERATURE: 'LITTÉRATURE',
  SCIENTIFIQUE: 'SCIENCES',
  AUTRES: 'AUTRES DISCIPLINES',
};

const STATUT_LABELS = { ADMIS: 'Admis', DEUXIEME_TOUR: 'Second Tour', AJOURNE: 'Ajourné' };
const STATUT_COLORS = { ADMIS: '#006600', DEUXIEME_TOUR: '#e65100', AJOURNE: '#cc0000' };

// ─── Classement Examen Blanc imprimable pour tout un niveau (admis / second tour / ajournés) ─
export function ClassementExamenBlancPrint(props) {
  return <ScrollableDoc><ClassementExamenBlancPrintDoc {...props} /></ScrollableDoc>;
}

function ClassementExamenBlancPrintDoc({ data, ecole = {} }) {
  const tdStyle = { border: '1px solid #333', padding: '3px 6px', fontSize: '12px', textAlign: 'center' };
  const thStyle = { ...tdStyle, background: '#f0f0f0', fontWeight: 'bold' };
  const leftTd = { ...tdStyle, textAlign: 'left' };

  return (
    <Box id="classement-eb-print" sx={{
      fontFamily: 'Arial, sans-serif', p: 2, maxWidth: '750px', margin: '0 auto',
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
        padding: '6px', marginBottom: '8px', letterSpacing: '1px', background: '#fff3e0' }}>
        Classement — Examen Blanc
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td><strong>Niveau :</strong> {data.niveau}</td>
            <td><strong>Trimestre :</strong> {data.trimestre.nom} — {data.trimestre.annee}</td>
            <td><strong>Effectif :</strong> {data.nb_eleves}</td>
          </tr>
          <tr>
            <td style={{ color: STATUT_COLORS.ADMIS }}><strong>Admis (≥10) :</strong> {data.nb_admis}</td>
            <td style={{ color: STATUT_COLORS.DEUXIEME_TOUR }}><strong>Second Tour (7,5-9,99) :</strong> {data.nb_deuxieme_tour}</td>
            <td style={{ color: STATUT_COLORS.AJOURNE }}><strong>Ajournés (&lt;7,5) :</strong> {data.nb_ajournes}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '8%' }}>Rang</th>
            <th style={{ ...thStyle, width: '17%' }}>Matricule</th>
            <th style={{ ...thStyle, textAlign: 'left', width: '32%' }}>Nom Prénom</th>
            <th style={{ ...thStyle, width: '13%' }}>Classe</th>
            <th style={{ ...thStyle, width: '15%' }}>Moyenne/20</th>
            <th style={{ ...thStyle, width: '15%' }}>Statut</th>
          </tr>
        </thead>
        <tbody>
          {data.classement.map((r, i) => (
            <tr key={r.eleve_id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ ...tdStyle, fontWeight: 'bold' }}>{r.rang}</td>
              <td style={tdStyle}>{r.matricule}</td>
              <td style={leftTd}>{r.nom} {r.prenom}</td>
              <td style={tdStyle}>{r.classe_nom}</td>
              <td style={{ ...tdStyle, fontWeight: 'bold', color: STATUT_COLORS[r.statut] }}>{r.moyenne_generale}</td>
              <td style={{ ...tdStyle, fontWeight: 'bold', color: STATUT_COLORS[r.statut] }}>
                {STATUT_LABELS[r.statut]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}

// ─── Composant bulletin imprimable (Examen Blanc uniquement) ─
export function BulletinExamenBlancPrint(props) {
  return <ScrollableDoc><BulletinExamenBlancPrintDoc {...props} /></ScrollableDoc>;
}

function BulletinExamenBlancPrintDoc({ data, ecole = {} }) {
  const tdStyle = { border: '1px solid #333', padding: '3px 6px', fontSize: '12px', textAlign: 'center' };
  const thStyle = { ...tdStyle, background: '#f0f0f0', fontWeight: 'bold' };
  const leftTd = { ...tdStyle, textAlign: 'left' };

  return (
    <Box id="bulletin-eb-print" sx={{
      fontFamily: 'Arial, sans-serif', p: 2, maxWidth: '800px', margin: '0 auto',
      border: '1px solid #ccc', bgcolor: 'white',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ width: '33%', verticalAlign: 'top', fontSize: '12px' }}>
              {ecole.direction_regionale && <div style={{ fontWeight: 'bold' }}>{ecole.direction_regionale}</div>}
              {ecole.direction_provinciale && <div>{ecole.direction_provinciale}</div>}
              <div style={{ fontWeight: 'bold', marginTop: 2 }}>{ecole.nom_ecole || 'Établissement'}</div>
              {ecole.ville && <div>{ecole.ville}</div>}
            </td>
            <td style={{ width: '34%', textAlign: 'center', verticalAlign: 'middle' }}>
              {ecole.logo_url && (
                <img src={ecole.logo_url} alt="Logo"
                  style={{ width: 56, height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} />
              )}
              <div style={{ fontSize: '12px' }}>Année Scolaire : <strong>{data.trimestre.annee}</strong></div>
              <div style={{ fontSize: '12px' }}><strong>{data.trimestre.nom}</strong></div>
            </td>
            <td style={{ width: '33%', textAlign: 'right', fontSize: '11px', color: '#444', verticalAlign: 'top' }}>
              {ecole.email && <div>{ecole.email}</div>}
              {ecole.adresse && <div>{ecole.adresse}</div>}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: 'bold',
        textTransform: 'uppercase', border: '2px solid #333',
        padding: '6px', marginBottom: '8px', letterSpacing: '2px', background: '#fff3e0' }}>
        Bulletin d'Examen Blanc
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%' }}><strong>Prénoms :</strong> {data.eleve.prenom}</td>
            <td style={{ width: '25%' }}><strong>Nom :</strong> {data.eleve.nom}</td>
            <td style={{ width: '25%' }}><strong>Classe :</strong> {data.classe || '—'}</td>
          </tr>
          <tr>
            <td><strong>Matricule :</strong> {data.eleve.matricule}</td>
            <td colSpan={2}><strong>Nbre d'élèves :</strong> {data.nb_eleves}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: '30%' }}>DISCIPLINES</th>
            <th style={{ ...thStyle, width: '15%' }}>Moy/20</th>
            <th style={{ ...thStyle, width: '10%' }}>Coef</th>
            <th style={{ ...thStyle, width: '15%' }}>Moy×C</th>
            <th style={{ ...thStyle, width: '10%' }}>Rang</th>
            <th style={{ ...thStyle, width: '20%' }}>Appréciations</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            const rows = [];
            let lastType = null;
            data.disciplines.forEach((d, i) => {
              if (d.matiere_type !== lastType) {
                lastType = d.matiere_type;
                rows.push(
                  <tr key={`grp-${d.matiere_type}`}>
                    <td colSpan={6} style={{
                      ...thStyle, textAlign: 'left', background: '#c8d8f0', fontWeight: 'bold',
                      fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', padding: '4px 6px',
                    }}>
                      {GROUP_LABELS[d.matiere_type] || d.matiere_type}
                    </td>
                  </tr>
                );
              }
              rows.push(
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={leftTd}>{d.matiere}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', color: (d.moy_20 ?? 0) >= 10 ? '#006600' : '#cc0000' }}>
                    {fmt(d.moy_20)}
                  </td>
                  <td style={tdStyle}>{d.coef}</td>
                  <td style={tdStyle}>{fmt(d.moy_coef)}</td>
                  <td style={tdStyle}>{d.rang ?? '—'}</td>
                  <td style={leftTd}>{d.appreciation}</td>
                </tr>
              );
            });
            return rows;
          })()}
          <tr style={{ background: '#e8e8e8' }}>
            <td style={{ ...leftTd, fontWeight: 'bold' }}>TOTAL</td>
            <td style={tdStyle}></td>
            <td style={{ ...tdStyle, fontWeight: 'bold' }}>{data.total_coef}</td>
            <td style={{ ...tdStyle, fontWeight: 'bold' }}>{data.total_moy_coef}</td>
            <td style={tdStyle}></td>
            <td style={tdStyle}></td>
          </tr>
          <tr style={{ background: '#dde' }}>
            <td style={{ ...leftTd, fontWeight: 'bold' }}>Moyenne Générale</td>
            <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '13px',
              color: data.moyenne_generale >= 10 ? '#006600' : '#cc0000' }}>
              {data.moyenne_generale} /20
            </td>
            <td style={tdStyle}></td>
            <td style={tdStyle}></td>
            <td style={{ ...tdStyle, fontWeight: 'bold' }}>Rang {data.rang_general ?? '—'}</td>
            <td style={tdStyle}></td>
          </tr>
        </tbody>
      </table>
    </Box>
  );
}

// ─── Page principale ─────────────────────────────────────────────
export default function BulletinExamenBlanc() {
  const [classes, setClasses] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [trimestres, setTrimestres] = useState([]);
  const [bulletinData, setBulletinData] = useState(null);
  const [selectedClasse, setSelectedClasse] = useState('');
  const [selectedTrimestre, setSelectedTrimestre] = useState('');
  const [selectedEleve, setSelectedEleve] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ecole, setEcole] = useState({});

  const [niveaux, setNiveaux] = useState([]);
  const [selectedNiveau, setSelectedNiveau] = useState('');
  const [classementData, setClassementData] = useState(null);
  const [loadingClassement, setLoadingClassement] = useState(false);
  const [errorClassement, setErrorClassement] = useState('');
  const [deliberations, setDeliberations] = useState([]);
  const [delibererOpen, setDelibererOpen] = useState(false);
  const [delibererLoading, setDelibererLoading] = useState(false);

  useEffect(() => {
    trimestreService.getAll().then(res => { setTrimestres(trimestresEnCours(res.data)); setSelectedTrimestre(prev => prev || idTrimestreParDefaut(res.data)); });
    parametresService.get().then(res => setEcole(res.data)).catch(() => {});
    classeService.getAll().then(res => {
      const { items } = getResults(res);
      setClasses(items.filter(c => c.niveau_is_classe_examen));
    });
    niveauService.getAll().then(res => {
      const { items } = getResults(res);
      setNiveaux(items.filter(n => n.is_classe_examen));
    });
    deliberationService.getAll().then(res => setDeliberations(getResults(res).items)).catch(() => {});
  }, []);

  const isDeliberated = (niveauId, trimestreId) =>
    deliberations.some(d => String(d.niveau) === String(niveauId) && String(d.trimestre) === String(trimestreId));

  const fetchClassement = () => {
    if (!selectedNiveau || !selectedTrimestre) return;
    setLoadingClassement(true);
    setErrorClassement('');
    setClassementData(null);
    api.get(`/notes/classement-examen-blanc/?niveau_id=${selectedNiveau}&trimestre_id=${selectedTrimestre}`)
      .then(res => setClassementData(res.data))
      .catch(err => setErrorClassement(err.response?.data?.detail || 'Erreur lors du chargement du classement.'))
      .finally(() => setLoadingClassement(false));
  };

  const handleDeliberer = async () => {
    setDelibererLoading(true);
    try {
      await deliberationService.create({ niveau: selectedNiveau, trimestre: selectedTrimestre });
      const res = await deliberationService.getAll();
      setDeliberations(getResults(res).items);
      setDelibererOpen(false);
      fetchClassement();
    } catch (err) {
      setErrorClassement(err.response?.data?.detail || 'Erreur lors de la délibération.');
      setDelibererOpen(false);
    } finally {
      setDelibererLoading(false);
    }
  };

  const handlePrintClassement = () => {
    const content = document.getElementById('classement-eb-print');
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Classement Examen Blanc</title>
      <style>body{margin:0;font-family:Arial,sans-serif;}@media print{body{margin:0;}}</style>
      </head><body>${content.outerHTML}</body></html>`);
    w.document.close(); w.focus(); w.print(); w.close();
  };

  const handleDownloadPDFClassement = async () => {
    const content = document.getElementById('classement-eb-print');
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
      const nomNiveau = (classementData?.niveau || 'niveau').replace(/\s+/g, '_');
      const trim = classementData?.trimestre?.nom?.replace(/\s+/g, '_') || 'T1';
      pdf.save(`classement_examen_blanc_${nomNiveau}_${trim}.pdf`);
    } catch (e) {
      console.error('Erreur PDF:', e);
    }
  };

  const handleClasseChange = (e) => {
    setSelectedClasse(e.target.value);
    setSelectedEleve('');
    setBulletinData(null);
    if (e.target.value) {
      eleveService.getAll(`/eleves/?classe_id=${e.target.value}`)
        .then(res => setEleves(getResults(res).items));
    } else {
      setEleves([]);
    }
  };

  const fetchBulletin = () => {
    if (!selectedTrimestre || !selectedEleve) return;
    setLoading(true);
    setError('');
    setBulletinData(null);
    api.get(`/notes/bulletin-examen-blanc/?eleve_id=${selectedEleve}&trimestre_id=${selectedTrimestre}`)
      .then(res => setBulletinData(res.data))
      .catch(err => setError(err.response?.data?.detail || 'Erreur lors du chargement du bulletin.'))
      .finally(() => setLoading(false));
  };

  const handlePrint = () => {
    const content = document.getElementById('bulletin-eb-print');
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Bulletin Examen Blanc</title>
      <style>body{margin:0;font-family:Arial,sans-serif;}@media print{body{margin:0;}}</style>
      </head><body>${content.outerHTML}</body></html>`);
    w.document.close(); w.focus(); w.print(); w.close();
  };

  const handleDownloadPDF = async () => {
    const content = document.getElementById('bulletin-eb-print');
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
      const nom = bulletinData?.eleve ? `${bulletinData.eleve.nom}_${bulletinData.eleve.prenom}` : 'eleve';
      const trim = bulletinData?.trimestre?.nom?.replace(/\s+/g, '_') || 'T1';
      pdf.save(`bulletin_examen_blanc_${nom}_${trim}.pdf`);
    } catch (e) {
      console.error('Erreur PDF:', e);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <WorkspacePremiumIcon color="warning" sx={{ fontSize: 32 }} />
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            Bulletin Examen Blanc
          </Typography>
        </Box>
        {bulletinData && (
          <Box display="flex" gap={1}>
            <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint}>Imprimer</Button>
            <Button size="small" variant="contained" startIcon={<DownloadIcon />} onClick={handleDownloadPDF}>PDF</Button>
          </Box>
        )}
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Seules les classes d'examen (3ème, Terminale) apparaissent ici — l'Examen Blanc est calculé séparément
        du bulletin trimestriel classique (Devoirs + Composition).
      </Alert>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>1. Classe (examen)</Typography>
              <TextField select fullWidth size="small" value={selectedClasse} onChange={handleClasseChange}>
                <MenuItem value=""><em>Sélectionner une classe</em></MenuItem>
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
              </TextField>
              {classes.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  Aucune classe d'examen configurée (voir Gestion des Niveaux).
                </Typography>
              )}
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
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>3. Trimestre</Typography>
              <TextField select fullWidth size="small" value={selectedTrimestre}
                onChange={e => { setSelectedTrimestre(e.target.value); setBulletinData(null); }}>
                <MenuItem value=""><em>Choisir un trimestre</em></MenuItem>
                {trimestres.map(t => (
                  <MenuItem key={t.id} value={t.id}>{t.annee_libelle} — {t.nom}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 1 }} sx={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button variant="contained" fullWidth onClick={fetchBulletin}
                disabled={!selectedTrimestre || !selectedEleve || loading}>
                {loading ? <CircularProgress size={20} color="inherit" /> : 'Afficher'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      )}

      {bulletinData && !loading && (
        bulletinData.disciplines.length === 0 ? (
          <Alert severity="info">Aucune note d'Examen Blanc enregistrée pour cet élève ce trimestre.</Alert>
        ) : (
          <BulletinExamenBlancPrint data={bulletinData} ecole={ecole} />
        )
      )}

      {/* ─── Délibération (admis / second tour / ajournés) ─── */}
      <Card sx={{ mt: 4, mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
            <Typography variant="h6">Délibération — Examen Blanc</Typography>
            {selectedNiveau && selectedTrimestre && (
              isDeliberated(selectedNiveau, selectedTrimestre)
                ? <Chip size="small" color="success" label="Délibéré" />
                : <Chip size="small" color="warning" label="Non délibéré" />
            )}
          </Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            Tant que la délibération n'est pas faite, les élèves et parents ne voient pas le classement
            (admis / second tour / ajourné) — seuls l'admin et les enseignants du niveau y ont accès.
          </Alert>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Niveau (examen)</Typography>
              <TextField select fullWidth size="small" value={selectedNiveau}
                onChange={e => { setSelectedNiveau(e.target.value); setClassementData(null); }}>
                <MenuItem value=""><em>Sélectionner un niveau</em></MenuItem>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Trimestre</Typography>
              <TextField select fullWidth size="small" value={selectedTrimestre}
                onChange={e => { setSelectedTrimestre(e.target.value); setClassementData(null); }}>
                <MenuItem value=""><em>Choisir un trimestre</em></MenuItem>
                {trimestres.map(t => (
                  <MenuItem key={t.id} value={t.id}>{t.annee_libelle} — {t.nom}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }} sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
              <Button variant="outlined" fullWidth startIcon={<EmojiEventsIcon />} onClick={fetchClassement}
                disabled={!selectedNiveau || !selectedTrimestre || loadingClassement}>
                {loadingClassement ? <CircularProgress size={20} /> : 'Voir'}
              </Button>
              <Button variant="contained" fullWidth color="warning" onClick={() => setDelibererOpen(true)}
                disabled={!selectedNiveau || !selectedTrimestre}>
                Délibérer
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Dialog open={delibererOpen} onClose={() => setDelibererOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirmer la délibération</DialogTitle>
        <DialogContent>
          <Typography>
            Vous êtes sur le point de délibérer l'Examen Blanc pour le niveau{' '}
            <strong>{niveaux.find(n => String(n.id) === String(selectedNiveau))?.nom}</strong>,{' '}
            <strong>{trimestres.find(t => String(t.id) === String(selectedTrimestre))?.nom}</strong>.
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            À partir de maintenant, les élèves et parents de ce niveau pourront voir leur résultat
            (admis / second tour / ajourné). Vous pouvez re-délibérer plus tard si des notes changent.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setDelibererOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" color="warning" onClick={handleDeliberer} disabled={delibererLoading}>
            {delibererLoading ? <CircularProgress size={18} /> : 'Confirmer la délibération'}
          </Button>
        </DialogActions>
      </Dialog>

      {errorClassement && <Alert severity="error" sx={{ mb: 2 }}>{errorClassement}</Alert>}

      {loadingClassement && (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      )}

      {classementData && !loadingClassement && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
            <Typography variant="h6">Classement — {classementData.niveau}</Typography>
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
            <Alert severity="info">Aucune note d'Examen Blanc enregistrée pour ce niveau ce trimestre.</Alert>
          ) : (
            <ClassementExamenBlancPrint data={classementData} ecole={ecole} />
          )}
        </Box>
      )}
    </Box>
  );
}
