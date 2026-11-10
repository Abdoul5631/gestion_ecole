import { useEffect, useState } from 'react';
import { inscriptionService, getResults } from 'services/api';
import {
  Box, Typography, Card, CardContent, Grid, Button, Alert, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';

function fmtMoy(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(2);
}

function GroupeTable({ titre, rows, color }) {
  if (!rows?.length) return null;
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight="bold" mb={1}>
          {titre} <Chip size="small" label={rows.length} color={color} sx={{ ml: 1 }} />
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Élève</TableCell>
                <TableCell>Classe actuelle</TableCell>
                <TableCell>Moy. annuelle</TableCell>
                <TableCell>Décision</TableCell>
                <TableCell>Classe l’an prochain</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.eleve_id}>
                  <TableCell>{r.prenom} {r.nom} <Typography variant="caption" color="text.secondary">({r.matricule})</Typography></TableCell>
                  <TableCell>{r.classe}</TableCell>
                  <TableCell>{fmtMoy(r.moyenne_annuelle)}</TableCell>
                  <TableCell>{r.decision?.libelle}</TableCell>
                  <TableCell>{r.classe_cible || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

export default function PassageAnnee() {
  const [data, setData] = useState(null);
  const [historique, setHistorique] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [lancing, setLancing] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      inscriptionService.passageApercu(),
      inscriptionService.passagesHistorique(),
    ])
      .then(([ap, hist]) => {
        setData(ap.data);
        setHistorique(getResults(hist).items);
      })
      .catch(() => setError('Impossible de charger le passage d’année.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const lancer = async () => {
    setLancing(true);
    setError('');
    try {
      const res = await inscriptionService.passageLancer({});
      setSuccess(res.data.message || 'Passage lancé.');
      setConfirm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Impossible de lancer le passage.');
    } finally {
      setLancing(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;

  const totaux = data?.totaux || {};

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={1} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
        Passage d’année
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="subtitle2" fontWeight="bold" mb={0.5}>À quoi sert cette page ?</Typography>
        Cette page inscrit les élèves dans l’année suivante (exemple : {data?.annee_source || 'cette année'} → {data?.annee_cible || 'l’année d’après'}).
        <br />
        Utilisez-la à la fin de l’année, après le 3e trimestre. Pour les 3ème et Terminale, saisissez d’abord les admis BEPC / BAC (menu Résultats BEPC / BAC).
        <br />
        Quand vous cliquez sur « Lancer le passage » : les élèves avec la moyenne passent dans la classe au-dessus, les autres redoublent, les admis BAC quittent l’école. Les 3ème / Terminale sans liste d’examen ne bougent pas.
        <br />
        Après le clic : les inscriptions de cette année restent visibles. Ouvrez l’année suivante pour voir les nouvelles classes.
      </Alert>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Alert severity="warning" sx={{ mb: 2 }}>
        Année actuelle : <strong>{data?.annee_source}</strong> → année suivante : <strong>{data?.annee_cible}</strong>.
        Seuil de passage : <strong>{data?.seuil}/20</strong> (moyenne annuelle = moyenne des 3 trimestres).
      </Alert>

      <Grid container spacing={2} mb={2}>
        {[
          ['Admis (passent)', totaux.admis, 'success'],
          ['Redoublants', totaux.redoublants, 'warning'],
          ['Quittent l’école', totaux.diplomes, 'info'],
          ['Attente examen', totaux.en_attente_examen, 'default'],
          ['Déjà inscrits', totaux.deja_inscrits, 'default'],
        ].map(([label, n, color]) => (
          <Grid key={label} size={{ xs: 6, sm: 2.4 }}>
            <Card>
              <CardContent>
                <Typography variant="h5" fontWeight="bold">{n || 0}</Typography>
                <Chip size="small" label={label} color={color} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box mb={2}>
        <Button variant="contained" startIcon={<SchoolIcon />} onClick={() => setConfirm(true)}>
          Lancer le passage vers {data?.annee_cible}
        </Button>
      </Box>

      <GroupeTable titre="Admis — classe supérieure" rows={data?.admis} color="success" />
      <GroupeTable titre="Redoublants — même classe" rows={data?.redoublants} color="warning" />
      <GroupeTable titre="Quittent l’école — admis au BAC (université) ou admis au BEPC qui poursuivent ailleurs" rows={data?.diplomes} color="info" />
      <GroupeTable titre="3ème / Terminale — en attente de la liste d’examen" rows={data?.en_attente_examen} color="default" />
      <GroupeTable titre="Déjà inscrits l’année suivante" rows={data?.deja_inscrits} color="default" />

      {historique.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight="bold" mb={1}>Historique</Typography>
            {historique.map((h) => (
              <Typography key={h.id} variant="body2" color="text.secondary">
                {h.annee_source_libelle} → {h.annee_cible_libelle} : {h.admis} admis, {h.redoublants} redoublants, {h.diplomes} diplômés
                {h.date_lancement ? ` (${new Date(h.date_lancement).toLocaleString('fr-FR')})` : ''}
              </Typography>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogTitle>Lancer le passage d’année ?</DialogTitle>
        <DialogContent>
          Les élèves admis seront inscrits en {data?.annee_cible} dans la classe du niveau suivant.
          Les redoublants restent dans la même classe (marqués redoublant).
          Les 3ème / Terminale sans liste d’examen ne bougent pas.
          Les inscriptions de {data?.annee_source} restent visibles dans l’historique.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Annuler</Button>
          <Button variant="contained" onClick={lancer} disabled={lancing}>
            {lancing ? 'En cours…' : 'Confirmer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
