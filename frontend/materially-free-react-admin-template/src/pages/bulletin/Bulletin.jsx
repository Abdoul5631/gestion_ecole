import { useEffect, useState } from 'react';
import api from 'services/api';
import authService from 'services/auth';
import {
  Box, Typography, MenuItem, TextField, Grid, Button,
  CircularProgress, Alert, Divider, Card, CardContent
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { classeService, eleveService, trimestreService, parametresService } from 'services/api';

function getMention(moy) {
  if (moy === null || moy === undefined) return '';
  if (moy >= 18) return 'Excellent';
  if (moy >= 16) return 'Très Bien';
  if (moy >= 14) return 'Bien';
  if (moy >= 12) return 'Assez Bien';
  if (moy >= 10) return 'Passable';
  if (moy >= 8)  return 'Insuffisant';
  if (moy >= 6)  return 'Faible';
  return 'Très Faible';
}

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
export function BulletinPrint({ data, ecole = {} }) {
  const mention = getMentionGenerale(data.moyenne_generale);

  const tdStyle = {
    border: '1px solid #333',
    padding: '3px 6px',
    fontSize: '12px',
    textAlign: 'center',
  };
  const thStyle = {
    ...tdStyle,
    background: '#f0f0f0',
    fontWeight: 'bold',
  };
  const leftTd = { ...tdStyle, textAlign: 'left' };

  return (
    <Box id="bulletin-print" sx={{
      fontFamily: 'Arial, sans-serif',
      p: 2,
      maxWidth: '800px',
      margin: '0 auto',
      border: '1px solid #ccc',
      bgcolor: 'white',
    }}>
      {/* ─── EN-TÊTE ─── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ width: '33%', verticalAlign: 'top', fontSize: '12px' }}>
              {ecole.direction_regionale && <div style={{ fontWeight: 'bold' }}>{ecole.direction_regionale}</div>}
              {ecole.direction_provinciale && <div>{ecole.direction_provinciale}</div>}
              <div style={{ fontWeight: 'bold', marginTop: 2 }}>{ecole.nom_ecole || 'Établissement'}</div>
              {ecole.ville && <div>{ecole.ville}</div>}
              {ecole.boite_postale && <div>{ecole.boite_postale}</div>}
              {ecole.telephone && <div>Tél : {ecole.telephone}</div>}
            </td>
            <td style={{ width: '34%', textAlign: 'center', verticalAlign: 'middle' }}>
              {ecole.logo_url && (
                <img src={ecole.logo_url} alt="Logo"
                  style={{ width: 56, height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} />
              )}
              <div style={{ fontSize: '12px' }}>
                Année Scolaire : <strong>{data.trimestre.annee}</strong>
              </div>
              <div style={{ fontSize: '12px' }}>
                <strong>{data.trimestre.nom}</strong>
              </div>
            </td>
            <td style={{ width: '33%', textAlign: 'right', fontSize: '11px', color: '#444', verticalAlign: 'top' }}>
              {ecole.email && <div>{ecole.email}</div>}
              {ecole.adresse && <div>{ecole.adresse}</div>}
              {ecole.devise && <div style={{ fontStyle: 'italic', marginTop: 4 }}>« {ecole.devise} »</div>}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: 'bold',
        textTransform: 'uppercase', border: '2px solid #333',
        padding: '6px', marginBottom: '8px', letterSpacing: '2px' }}>
        Bulletin de Notes
      </div>

      {/* ─── INFO ÉLÈVE ─── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%' }}>
              <strong>Prénoms :</strong> {data.eleve.prenom}
            </td>
            <td style={{ width: '25%' }}>
              <strong>Nom :</strong> {data.eleve.nom}
            </td>
            <td style={{ width: '25%' }}>
              <strong>Classe :</strong> {data.classe || '—'}
            </td>
          </tr>
          <tr>
            <td>
              <strong>Matricule :</strong> {data.eleve.matricule}
            </td>
            <td>
              <strong>Date de naissance :</strong> {data.eleve.date_naissance || '—'}
            </td>
            <td>
              <strong>Lieu de naissance :</strong> {data.eleve.lieu_naissance || '—'}
            </td>
          </tr>
          <tr>
            <td>
              <strong>Sexe :</strong> {data.eleve.sexe === 'M' ? 'Masculin' : data.eleve.sexe === 'F' ? 'Féminin' : '—'}
            </td>
            <td>
              <strong>Nbre d'élèves :</strong> {data.nb_eleves}
            </td>
            <td>
              <strong>Classe Redoublée :</strong> 0
            </td>
          </tr>
        </tbody>
      </table>

      {/* ─── TABLE DES DISCIPLINES ─── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: '20%' }}>DISCIPLINES</th>
            <th style={{ ...thStyle, width: '7%' }}>Devoir</th>
            <th style={{ ...thStyle, width: '7%' }}>Comp.</th>
            <th style={{ ...thStyle, width: '7%' }}>Moy/20</th>
            <th style={{ ...thStyle, width: '5%' }}>Coef</th>
            <th style={{ ...thStyle, width: '7%' }}>Moy×C</th>
            <th style={{ ...thStyle, width: '5%' }}>Rang</th>
            <th style={{ ...thStyle, width: '10%' }}>Visa Prof</th>
            <th style={{ ...thStyle, width: '32%' }}>Appréciations</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            const rows = [];
            let lastType = null;
            const GROUP_LABELS = {
              LITTERATURE: 'LITTÉRATURE',
              SCIENTIFIQUE: 'SCIENCES',
              AUTRES: 'AUTRES DISCIPLINES',
            };
            data.disciplines.forEach((d, i) => {
              // En-tête de groupe si le type change
              if (d.matiere_type !== lastType) {
                lastType = d.matiere_type;
                rows.push(
                  <tr key={`grp-${d.matiere_type}`}>
                    <td colSpan={9} style={{
                      ...thStyle, textAlign: 'left',
                      background: '#c8d8f0', fontWeight: 'bold',
                      fontSize: '11px', textTransform: 'uppercase',
                      letterSpacing: '1px', padding: '4px 6px',
                    }}>
                      {GROUP_LABELS[d.matiere_type] || d.matiere_type}
                    </td>
                  </tr>
                );
              }
              rows.push(
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={leftTd}>{d.matiere}</td>
                  <td style={tdStyle}>{fmt(d.devoir)}</td>
                  <td style={tdStyle}>{fmt(d.composition)}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold',
                    color: (d.moy_20 ?? 0) >= 10 ? '#006600' : '#cc0000' }}>
                    {fmt(d.moy_20)}
                  </td>
                  <td style={tdStyle}>{d.coef}</td>
                  <td style={tdStyle}>{fmt(d.moy_coef)}</td>
                  <td style={tdStyle}>{d.rang ?? '—'}</td>
                  <td style={{ ...tdStyle, padding: '1px' }}>
                    {d.enseignant_signature_url ? (
                      <img
                        src={d.enseignant_signature_url}
                        alt="sig"
                        style={{ height: 28, maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                        crossOrigin="anonymous"
                      />
                    ) : null}
                  </td>
                  <td style={leftTd}>{d.appreciation}</td>
                </tr>
              );
            });
            return rows;
          })()}
          {/* TOTAL */}
          <tr style={{ background: '#e8e8e8' }}>
            <td colSpan={4} style={{ ...leftTd, fontWeight: 'bold' }}>TOTAL</td>
            <td style={{ ...tdStyle, fontWeight: 'bold' }}>{data.total_coef}</td>
            <td style={{ ...tdStyle, fontWeight: 'bold' }}>{data.total_moy_coef}</td>
            <td style={tdStyle}></td>
            <td style={tdStyle}></td>
            <td style={tdStyle}></td>
          </tr>
          {/* MOYENNE */}
          <tr style={{ background: '#dde' }}>
            <td style={{ ...leftTd, fontWeight: 'bold' }}>Moyenne</td>
            <td colSpan={2} style={{ ...tdStyle, fontWeight: 'bold', fontSize: '13px',
              color: data.moyenne_generale >= 10 ? '#006600' : '#cc0000' }}>
              {data.moyenne_generale} /20
            </td>
            <td style={tdStyle}></td>
            <td style={tdStyle}></td>
            <td style={tdStyle}></td>
            <td style={{ ...tdStyle, fontWeight: 'bold' }}>
              Rang {data.rang_general ?? '—'}
            </td>
            <td style={tdStyle}></td>
            <td style={{ ...tdStyle, fontSize: '11px' }}>
              Absences : {data.absences} &nbsp;|&nbsp; Retards : {data.retards}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ─── MENTIONS ─── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'top', paddingRight: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {MENTIONS_LEFT.map(m => (
                    <tr key={m}>
                      <td style={{ border: '1px solid #aaa', padding: '3px 6px' }}>{m}</td>
                      <td style={{ border: '1px solid #aaa', width: '30px', textAlign: 'center', fontWeight: 'bold' }}>
                        {mention === m ? 'X' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
            <td style={{ width: '50%', verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {MENTIONS_RIGHT.map(m => (
                    <tr key={m}>
                      <td style={{ border: '1px solid #aaa', padding: '3px 6px' }}>{m}</td>
                      <td style={{ border: '1px solid #aaa', width: '30px', textAlign: 'center', fontWeight: 'bold' }}>
                        {mention === m ? 'X' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ─── OBSERVATIONS + SIGNATURES ─── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <tbody>
          <tr>
            {/* Observations */}
            <td style={{ width: '40%', border: '1px solid #aaa', padding: '6px', verticalAlign: 'top', height: '90px' }}>
              <strong>Observations du conseil des professeurs :</strong><br />&nbsp;
            </td>

            {/* Professeur Principal */}
            <td style={{ width: '30%', border: '1px solid #aaa', padding: '6px', textAlign: 'center', verticalAlign: 'top' }}>
              <strong style={{ fontSize: '11px' }}>Le Professeur Principal</strong><br />
              {data.professeur_principal?.signature_url ? (
                <img
                  src={data.professeur_principal.signature_url}
                  alt="Cachet PP"
                  style={{ maxWidth: '100%', height: 50, objectFit: 'contain', margin: '4px auto', display: 'block' }}
                  crossOrigin="anonymous"
                />
              ) : (
                <div style={{ height: 50 }} />
              )}
              <div style={{ borderTop: '1px solid #aaa', marginTop: 2, paddingTop: 2, fontSize: '11px' }}>
                {data.professeur_principal?.prenom} {data.professeur_principal?.nom || ''}
              </div>
            </td>

            {/* Chef d'Établissement */}
            <td style={{ width: '30%', border: '1px solid #aaa', padding: '6px', textAlign: 'center', verticalAlign: 'top' }}>
              <strong style={{ fontSize: '11px' }}>Le Chef d'Établissement</strong><br />
              <div style={{ position: 'relative', display: 'inline-block', height: 95, width: '100%' }}>
                {ecole.signature_url && (
                  <img
                    src={ecole.signature_url}
                    alt="Signature Directeur"
                    style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', height: 40, maxWidth: '90%', objectFit: 'contain' }}
                    crossOrigin="anonymous"
                  />
                )}
                {ecole.tampon_url && (
                  <img
                    src={ecole.tampon_url}
                    alt="Tampon"
                    style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', height: 55, maxWidth: '80%', objectFit: 'contain', opacity: 0.85 }}
                    crossOrigin="anonymous"
                  />
                )}
                {!ecole.signature_url && !ecole.tampon_url && <div style={{ height: 95 }} />}
              </div>
              <div style={{ borderTop: '1px solid #aaa', marginTop: 2, paddingTop: 2, fontSize: '11px' }}>
                {ecole.directeur || ''}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </Box>
  );
}

// ─── Classement (palmarès) imprimable d'une classe, du 1er au dernier ─
export function ClassementPrint({ data, ecole = {} }) {
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
  const [selectedEleve, setSelectedEleve] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ecole, setEcole] = useState({});

  const [classementData, setClassementData] = useState(null);
  const [loadingClassement, setLoadingClassement] = useState(false);
  const [errorClassement, setErrorClassement] = useState('');

  const role = authService.getRole();
  const isAdminOrEnseignant = role === 'ADMIN' || role === 'ENSEIGNANT';

  useEffect(() => {
    trimestreService.getAll().then(res => setTrimestres(res.data));
    parametresService.get().then(res => setEcole(res.data)).catch(() => {});
    if (isAdminOrEnseignant) {
      classeService.getAll().then(res => setClasses(res.data));
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

  const handlePrint = () => {
    const content = document.getElementById('bulletin-print');
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Bulletin</title>
      <style>body{margin:0;font-family:Arial,sans-serif;}@media print{body{margin:0;}}</style>
      </head><body>${content.outerHTML}</body></html>`);
    w.document.close(); w.focus(); w.print(); w.close();
  };

  const handleDownloadPDF = async () => {
    const content = document.getElementById('bulletin-print');
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
      pdf.save(`bulletin_${nom}_${trim}.pdf`);
    } catch (e) {
      console.error('Erreur PDF:', e);
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
        {bulletinData && (
          <Box display="flex" gap={1}>
            <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint}>
              Imprimer
            </Button>
            <Button size="small" variant="contained" startIcon={<DownloadIcon />} onClick={handleDownloadPDF}>
              PDF
            </Button>
          </Box>
        )}
      </Box>

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
