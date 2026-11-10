import { useEffect, useState } from 'react';
import { examenService } from 'services/api';
import {
  Box, Typography, Card, CardContent, Grid, Button, Alert, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Checkbox, TextField, MenuItem, CircularProgress, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';

// Après le BEPC, chaque admis choisit sa suite : la direction enregistre son choix
const ORIENTATIONS = [
  ['A', '2nde A'], ['C', '2nde C'], ['D', '2nde D'], ['T', '2nde Technique'], ['SORT', 'Quitte l’école'],
];
const libelleOrientation = (code) => (ORIENTATIONS.find(([c]) => c === code) || [code, `2nde ${code}`])[1];

export default function ResultatsExamen() {
  const [examen, setExamen] = useState('BEPC');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [admisIds, setAdmisIds] = useState(new Set());
  const [series, setSeries] = useState({});
  const [texte, setTexte] = useState('');
  const [initial, setInitial] = useState({ ids: '', series: '' }); // état enregistré, pour repérer les changements
  const [confirmer, setConfirmer] = useState(false);
  const [ongletVise, setOngletVise] = useState(null);
  const [rapport, setRapport] = useState(null); // matricules introuvables / séries corrigées après un import

  const load = (ex = examen) => {
    setLoading(true);
    examenService.candidats({ examen: ex })
      .then((res) => {
        setData(res.data);
        const ids = new Set((res.data.results || []).filter((r) => r.admis).map((r) => r.eleve_id));
        setAdmisIds(ids);
        const s = {};
        (res.data.results || []).forEach((r) => { s[r.eleve_id] = r.serie_2nde || 'A'; });
        setSeries(s);
        setInitial({ ids: [...ids].sort().join(','), series: JSON.stringify(s) });
      })
      .catch(() => setError('Impossible de charger les candidats.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(examen); }, [examen]);

  const toggle = (id) => {
    const next = new Set(admisIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAdmisIds(next);
  };

  const verrouille = !!data?.verrouille;
  const modifie = [...admisIds].sort().join(',') !== initial.ids || JSON.stringify(series) !== initial.series;
  const changerOnglet = (v) => { if (modifie) setOngletVise(v); else setExamen(v); };

  const enregistrer = async () => {
    setConfirmer(false);
    setSaving(true);
    setError('');
    try {
      const payload = {
        examen,
        eleve_ids: Array.from(admisIds),
        remplacer: true,
      };
      if (examen === 'BEPC') {
        payload.series = {};
        admisIds.forEach((id) => { payload.series[id] = series[id] || 'A'; });
      }
      const res = await examenService.saisir(payload);
      setSuccess(res.data.message);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const importerExcel = async (file) => {
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const res = await examenService.importerExcel(file, examen);
      setSuccess(res.data.message);
      setRapport({ inconnus: res.data.inconnus || [], corrigees: res.data.series_corrigees || [] });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Import Excel impossible.');
    } finally {
      setSaving(false);
    }
  };

  const importerTexte = async () => {
    if (!texte.trim()) {
      setError('Collez au moins un matricule.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await examenService.importerTexte({ examen, texte });
      setSuccess(res.data.message);
      setRapport({ inconnus: res.data.inconnus || [], corrigees: [] });
      setTexte('');
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Import impossible.');
    } finally {
      setSaving(false);
    }
  };

  const rows = data?.results || [];
  const nbNonAdmis = rows.length - admisIds.size;
  const parSerie = ORIENTATIONS.map(([x]) => [x, [...admisIds].filter((id) => (series[id] || 'A') === x).length]).filter(([, n]) => n);

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={1} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
        Résultats BEPC / BAC
      </Typography>
      <Typography variant="body1" color="text.secondary" mb={2}>
        L’école ne décide pas toute seule le passage en 3ème et Terminale : cochez (ou importez) les élèves admis à l’examen.
        Au BEPC, indiquez aussi le choix de chaque admis (2nde A, C, D, technique, ou départ vers un autre établissement).
        Au BAC, les admis quittent l’école pour l’université. Les non admis redoublent.
      </Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Tabs value={examen} onChange={(_, v) => changerOnglet(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2 }}>
        <Tab value="BEPC" label="BEPC — 3ème" />
        <Tab value="BAC" label="BAC — Terminale" />
      </Tabs>

      <Alert severity="info" sx={{ mb: 2 }}>
        {examen === 'BEPC'
          ? 'Admis BEPC → la 2nde choisie par l’élève (A, C, D ou technique), ou il quitte l’école s’il poursuit ailleurs. Non admis → redouble la 3ème.'
          : 'Admis BAC → l’élève quitte l’école pour l’université (diplômé) : il n’apparaît plus l’année suivante. Non admis → redouble la Terminale.'}
        {' '}Tant que cette liste n’est pas enregistrée, le passage d’année ne bouge pas ces classes.
      </Alert>

      {verrouille && (
        <Alert severity="warning" icon={<LockIcon />} sx={{ mb: 2 }}>{data.verrou_message}</Alert>
      )}
      {!verrouille && data && !data.liste_enregistree && rows.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          La liste du {examen} n’est pas encore enregistrée : au passage d’année, les élèves de {data.niveau} resteront « en attente ».
        </Alert>
      )}
      {rapport && (rapport.inconnus.length > 0 || rapport.corrigees.length > 0) && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setRapport(null)}>
          {rapport.inconnus.length > 0 && (
            <div>Matricules introuvables en {data?.niveau} cette année (non pris en compte) : <strong>{rapport.inconnus.join(', ')}</strong></div>
          )}
          {rapport.corrigees.length > 0 && (
            <div>Série illisible, mise en 2nde A — vérifiez dans le tableau : <strong>{rapport.corrigees.join(', ')}</strong></div>
          )}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" fontWeight="bold" mb={1}>Importer un Excel</Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                Colonne A = matricule.{examen === 'BEPC' && ' Colonne B = choix de l’élève : A, C, D, Technique ou « quitte ».'}
              </Typography>
              <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={saving || verrouille || modifie}>
                Choisir un fichier
                <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => importerExcel(e.target.files?.[0])} />
              </Button>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" fontWeight="bold" mb={1}>Coller des matricules</Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                Un élève par ligne.{examen === 'BEPC' && ' Ajoutez son choix après le matricule : « 2026-0080 C », « 2026-0081 Technique ».'}
              </Typography>
              <TextField
                fullWidth size="small" multiline minRows={3}
                placeholder={examen === 'BEPC' ? "2026-0080 C\n2026-0081 Technique\n2026-0082 quitte" : "2026-0080\n2026-0081"}
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
              />
              <Button sx={{ mt: 1 }} size="small" variant="outlined" onClick={importerTexte} disabled={saving || verrouille || modifie}>
                Ajouter ces admis
              </Button>
              {modifie && !verrouille && (
                <Typography variant="caption" color="warning.main" display="block" mt={0.5}>
                  Enregistrez d’abord vos cases cochées avant d’importer.
                </Typography>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : (
        <>
          {examen === 'BEPC' && [...admisIds].some((id) => series[id] === 'T') && (
            <Alert severity="info" sx={{ mb: 1 }}>
              Les élèves en 2nde Technique iront dans la classe « 2nde T » de l’école (créée au passage si elle n’existe pas).
              Si l’école n’a pas de 2nde technique, choisissez plutôt « Quitte l’école ».
            </Alert>
          )}
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1} flexWrap="wrap" gap={1}>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="body2">
                {data?.annee} · {admisIds.size} admis / {rows.length} élèves
              </Typography>
              {modifie && !verrouille && <Chip size="small" color="warning" label="Modifications non enregistrées" sx={{ fontWeight: 700 }} />}
            </Box>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={() => setConfirmer(true)} disabled={saving || verrouille || rows.length === 0}>
              Enregistrer la liste des admis
            </Button>
          </Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead sx={{ bgcolor: 'grey.100' }}>
                <TableRow>
                  <TableCell padding="checkbox">Admis</TableCell>
                  <TableCell>Matricule</TableCell>
                  <TableCell>Nom</TableCell>
                  <TableCell>Classe</TableCell>
                  {examen === 'BEPC' && <TableCell>Choix de l’élève</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">Aucun élève dans cette classe cette année.</TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.eleve_id}>
                    <TableCell padding="checkbox">
                      <Checkbox checked={admisIds.has(r.eleve_id)} onChange={() => toggle(r.eleve_id)} disabled={verrouille} />
                    </TableCell>
                    <TableCell>{r.matricule}</TableCell>
                    <TableCell>{r.prenom} {r.nom}</TableCell>
                    <TableCell><Chip size="small" label={r.classe} /></TableCell>
                    {examen === 'BEPC' && (
                      <TableCell>
                        <TextField
                          select size="small"
                          value={series[r.eleve_id] || 'A'}
                          onChange={(e) => setSeries({ ...series, [r.eleve_id]: e.target.value })}
                          disabled={verrouille || !admisIds.has(r.eleve_id)}
                        >
                          {ORIENTATIONS.map(([c, l]) => <MenuItem key={c} value={c}>{l}</MenuItem>)}
                        </TextField>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Récapitulatif avant d'enregistrer : c'est ce que fera le passage d'année */}
      <Dialog open={confirmer} onClose={() => setConfirmer(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Enregistrer la liste du {examen} {data?.annee} ?</DialogTitle>
        <DialogContent>
          <Typography mb={1.5}>Au passage d’année, voici ce qui se fera pour les {rows.length} élèves de {data?.niveau} :</Typography>
          <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', mb: 1.5 }}>
            <Typography>
              <strong>{admisIds.size} admis</strong>
              {examen === 'BEPC'
                ? `${parSerie.length ? ` : ${parSerie.map(([x, n]) => `${n} ${x === 'SORT' ? 'quittent l’école' : `en ${libelleOrientation(x)}`}`).join(', ')}` : ''}`
                : ' → quittent l’école pour l’université (diplômés)'}
            </Typography>
            <Typography><strong>{nbNonAdmis} non admis</strong> → redoublent la {data?.niveau}</Typography>
          </Box>
          {admisIds.size === 0 && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>Aucun élève n’est coché : tous les élèves de {data?.niveau} redoubleront. Est-ce bien le résultat officiel ?</Alert>
          )}
          <Alert severity="info">
            Cette liste remplace la précédente. Vous pourrez encore la corriger tant que le passage d’année n’a pas placé ces élèves ;
            ensuite, elle est verrouillée. Si le passage a déjà été lancé pour les autres classes, relancez-le après l’enregistrement :
            il ne traitera que les élèves restés en attente.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmer(false)} color="inherit">Revoir</Button>
          <Button variant="contained" onClick={enregistrer}>Enregistrer</Button>
        </DialogActions>
      </Dialog>

      {/* Changer d'onglet avec des cases non enregistrées */}
      <Dialog open={!!ongletVise} onClose={() => setOngletVise(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Modifications non enregistrées</DialogTitle>
        <DialogContent>
          <Typography>Vous avez coché ou décoché des élèves sans enregistrer. Si vous changez d’onglet, ces changements seront perdus.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOngletVise(null)}>Rester</Button>
          <Button color="warning" onClick={() => { setExamen(ongletVise); setOngletVise(null); }}>Changer sans enregistrer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
