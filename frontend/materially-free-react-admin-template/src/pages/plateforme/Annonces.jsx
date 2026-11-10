import { useEffect, useState } from 'react';
import {
  Alert, AlertTitle, Autocomplete, Box, Button, Card, Chip, CircularProgress, MenuItem, TextField, Typography
} from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';
import api, { ecoleService } from 'services/api';

const NIVEAUX = [['info', 'Information'], ['warning', 'Attention (maintenance prévue…)'], ['error', 'Incident en cours']];
const CIBLES = [['TOUS', 'Tous les utilisateurs'], ['DIRECTION', 'Directeurs et équipes seulement']];
const VIDE = { titre: '', message: '', niveau: 'info', cible: 'TOUS', debut: '', fin: '', ecoles: [] };
const date = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

/** Annonces de la plateforme : un bandeau en haut de l'application dans toutes les écoles. */
export default function Annonces() {
  const [liste, setListe] = useState(null);
  const [form, setForm] = useState(VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [ecoles, setEcoles] = useState([]);

  const charger = () => api.get('/plateforme/annonces/').then((r) => setListe(r.data.results || [])).catch(() => setListe([]));
  useEffect(() => { charger(); ecoleService.liste({ statut: 'VALIDEE' }).then((r) => setEcoles(Array.isArray(r.data) ? r.data : [])).catch(() => {}); }, []);

  const publier = async () => {
    setEnvoi(true); setErreur('');
    try {
      const { data } = await api.post('/plateforme/annonces/', { ...form, ecoles: form.ecoles.map((e) => e.id), debut: form.debut || undefined, fin: form.fin || undefined });
      setForm(VIDE);
      setSucces(`Annonce publiée : bandeau en haut de l’application${data.notifies ? ` et notification envoyée à ${data.notifies.toLocaleString('fr-FR')} personne(s) (cloche et Messages)` : ''}.`);
      charger();
    } catch (e) {
      setErreur(e.response?.data?.detail || 'Publication impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const basculer = async (a) => {
    await api.patch(`/plateforme/annonces/${a.id}/`, { active: !a.active }).catch(() => {});
    charger();
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Annonces</Typography>
      <Typography variant="body2" color="text.secondary" mb={2.5}>
        Prévenez toutes les écoles d&apos;un coup : maintenance prévue, incident en cours, nouveauté. Le message s&apos;affiche en bandeau
        en haut de l&apos;application, pendant la période choisie.
      </Typography>
      {erreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}
      {succes && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}>{succes}</Alert>}

      <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 2, mb: 3 }}>
        <Typography fontWeight={800} mb={1.5}>Nouvelle annonce</Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <TextField size="small" label="Titre" value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })}
            placeholder="Maintenance ce soir" inputProps={{ maxLength: 120 }} />
          <TextField select size="small" label="Type" value={form.niveau} onChange={(e) => setForm({ ...form, niveau: e.target.value })}>
            {NIVEAUX.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Message" multiline minRows={2} value={form.message} sx={{ gridColumn: { md: '1 / -1' } }}
            onChange={(e) => setForm({ ...form, message: e.target.value })} inputProps={{ maxLength: 600 }}
            placeholder="L'application sera indisponible de 22 h à 23 h pour une mise à jour." />
          <Autocomplete multiple size="small" options={ecoles} getOptionLabel={(e) => e.nom_ecole} value={form.ecoles}
            onChange={(_, v) => setForm({ ...form, ecoles: v })} isOptionEqualToValue={(a, b) => a.id === b.id}
            sx={{ gridColumn: { md: '1 / -1' } }}
            renderInput={(p) => <TextField {...p} label="Écoles concernées" placeholder={form.ecoles.length ? '' : 'Toutes les écoles'} helperText={form.ecoles.length ? `${form.ecoles.length} école(s) seulement` : 'Laissez vide pour prévenir toutes les écoles.'} />} />
          <TextField select size="small" label="Qui le voit" value={form.cible} onChange={(e) => setForm({ ...form, cible: e.target.value })}>
            {CIBLES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <Box display="flex" gap={1.5}>
            <TextField size="small" type="datetime-local" label="Début (vide = maintenant)" InputLabelProps={{ shrink: true }} sx={{ flex: 1 }}
              value={form.debut} onChange={(e) => setForm({ ...form, debut: e.target.value })} />
            <TextField size="small" type="datetime-local" label="Fin (vide = jusqu’à arrêt)" InputLabelProps={{ shrink: true }} sx={{ flex: 1 }}
              value={form.fin} onChange={(e) => setForm({ ...form, fin: e.target.value })} />
          </Box>
        </Box>
        {(form.titre || form.message) && (
          <Box mt={2}>
            <Typography variant="caption" color="text.secondary">Aperçu dans les écoles :</Typography>
            <Alert severity={form.niveau} sx={{ mt: 0.5 }}><AlertTitle sx={{ fontWeight: 800 }}>{form.titre}</AlertTitle>{form.message}</Alert>
          </Box>
        )}
        <Box display="flex" justifyContent="flex-end" mt={2}>
          <Button variant="contained" startIcon={envoi ? <CircularProgress size={16} color="inherit" /> : <CampaignIcon />}
            disabled={envoi || !form.titre.trim() || !form.message.trim()} onClick={publier}>Publier</Button>
        </Box>
      </Card>

      <Typography fontWeight={800} mb={1}>Annonces publiées</Typography>
      {liste === null ? <CircularProgress /> : liste.length === 0 ? (
        <Typography color="text.secondary">Aucune annonce pour le moment.</Typography>
      ) : liste.map((a) => (
        <Card key={a.id} sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 1.5, mb: 1, opacity: a.en_cours ? 1 : 0.65 }}>
          <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" alignItems="center">
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box display="flex" gap={0.75} alignItems="center" flexWrap="wrap">
                <Typography fontWeight={700}>{a.titre}</Typography>
                <Chip size="small" color={a.en_cours ? 'success' : 'default'} label={a.en_cours ? 'Affichée' : (a.active ? 'Programmée ou terminée' : 'Arrêtée')} />
                <Chip size="small" variant="outlined" label={a.cible === 'TOUS' ? 'Tous' : 'Direction'} />
                <Chip size="small" variant="outlined" label={a.ecoles?.length ? a.ecoles.map((e) => e.nom).join(', ') : 'Toutes les écoles'} />
              </Box>
              <Typography variant="body2" color="text.secondary">{a.message}</Typography>
              <Typography variant="caption" color="text.secondary">Du {date(a.debut)}{a.fin ? ` au ${date(a.fin)}` : ' · sans fin'}</Typography>
            </Box>
            <Button size="small" color={a.active ? 'warning' : 'success'} onClick={() => basculer(a)} sx={{ textTransform: 'none' }}>
              {a.active ? 'Arrêter' : 'Relancer'}
            </Button>
          </Box>
        </Card>
      ))}
    </Box>
  );
}
