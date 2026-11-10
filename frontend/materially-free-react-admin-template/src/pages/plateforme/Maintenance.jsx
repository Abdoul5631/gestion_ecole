import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, Chip, CircularProgress, TextField, Typography } from '@mui/material';
import ConstructionIcon from '@mui/icons-material/Construction';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import api from 'services/api';

const local = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};
const quand = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Lancer, programmer ou arrêter la maintenance : toutes les adresses du site affichent la page de maintenance. */
export default function Maintenance() {
  const [m, setM] = useState(null);
  const [form, setForm] = useState({ titre: '', message: '', debut: '', fin: '' });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [confirmer, setConfirmer] = useState(false);

  const charger = (d) => { setM(d); setForm({ titre: d.titre, message: d.message, debut: local(d.debut), fin: local(d.fin) }); };
  useEffect(() => { api.get('/plateforme/maintenance/').then((r) => charger(r.data)).catch(() => setErreur('Impossible de charger.')); }, []);

  const appliquer = async (actif, msg) => {
    setEnvoi(true); setErreur(''); setSucces(''); setConfirmer(false);
    try {
      const { data } = await api.put('/plateforme/maintenance/', {
        actif, titre: form.titre, message: form.message,
        debut: form.debut ? new Date(form.debut).toISOString() : null, fin: form.fin ? new Date(form.fin).toISOString() : null,
      });
      charger(data);
      setSucces(msg);
    } catch (e) {
      setErreur(e.response?.data?.detail || 'Action impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  if (!m) return erreur ? <Alert severity="error">{erreur}</Alert> : <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;
  const immediate = !form.debut || new Date(form.debut) <= new Date();

  return (
    <Box sx={{ maxWidth: 760 }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={1}>
        <ConstructionIcon sx={{ fontSize: 40, color: 'warning.main' }} />
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Maintenance</Typography>
        {m.en_cours && <Chip color="error" label="En cours" sx={{ fontWeight: 800 }} />}
        {m.programmee && <Chip color="warning" label="Programmée" sx={{ fontWeight: 800 }} />}
      </Box>
      <Typography variant="body2" color="text.secondary" mb={2.5}>
        Pendant la maintenance, <strong>toutes les adresses du site</strong> (connexion, site public des écoles, application) affichent la page de maintenance
        avec votre message. Vous seul gardez l&apos;accès pour travailler. Les saisies faites hors ligne par les écoles ne sont pas perdues : elles
        repartent à la fin.
      </Typography>

      {erreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}
      {succes && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}>{succes}</Alert>}
      {m.en_cours && (
        <Alert severity="error" sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={() => appliquer(false, 'Maintenance arrêtée : les écoles retrouvent l’application.')} disabled={envoi}>Arrêter maintenant</Button>}>
          La maintenance est en cours{m.fin ? `, fin prévue ${quand(m.fin)}` : ' (sans fin prévue : arrêtez-la vous-même)'}.
        </Alert>
      )}
      {m.programmee && (
        <Alert severity="warning" sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={() => appliquer(false, 'Maintenance programmée annulée.')} disabled={envoi}>Annuler</Button>}>
          Programmée à partir de {quand(m.debut)}. Les écoles en sont prévenues par un bandeau 24 h avant.
        </Alert>
      )}

      <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 2.5, mb: 2.5 }}>
        <Typography fontWeight={800} mb={1.5}>Message affiché aux écoles</Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          <TextField size="small" label="Titre" value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} inputProps={{ maxLength: 120 }} sx={{ gridColumn: { sm: '1 / -1' } }} />
          <TextField size="small" label="Message" multiline minRows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
            inputProps={{ maxLength: 600 }} sx={{ gridColumn: { sm: '1 / -1' } }} />
          <TextField size="small" type="datetime-local" label="Début (vide = tout de suite)" InputLabelProps={{ shrink: true }} value={form.debut}
            onChange={(e) => setForm({ ...form, debut: e.target.value })} />
          <TextField size="small" type="datetime-local" label="Fin prévue (vide = jusqu’à l’arrêt)" InputLabelProps={{ shrink: true }} value={form.fin}
            onChange={(e) => setForm({ ...form, fin: e.target.value })} helperText="Affichée aux écoles comme heure de retour." />
        </Box>
        <Box sx={{ mt: 2, p: 2, borderRadius: 2.5, color: '#fff', textAlign: 'center', background: 'linear-gradient(135deg, #081e46, #0b3d91)' }}>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>Aperçu de ce que verront les écoles</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: 20 }} color="inherit">{form.titre || 'Maintenance en cours'}</Typography>
          <Typography variant="body2" color="inherit" sx={{ opacity: 0.9 }}>{form.message}</Typography>
          {form.fin && <Typography variant="body2" color="inherit" sx={{ mt: 1, fontWeight: 700 }}>Retour prévu : {quand(form.fin)}</Typography>}
        </Box>
      </Card>

      {!confirmer ? (
        <Box display="flex" gap={1.5} flexWrap="wrap">
          <Button variant="contained" color={immediate ? 'error' : 'warning'} startIcon={<PowerSettingsNewIcon />} disabled={envoi || !form.message.trim()} onClick={() => setConfirmer(true)}>
            {immediate ? 'Lancer la maintenance maintenant' : 'Programmer la maintenance'}
          </Button>
          {(m.en_cours || m.programmee) && <Button variant="outlined" disabled={envoi} onClick={() => appliquer(true, 'Message mis à jour.')}>Enregistrer les changements</Button>}
        </Box>
      ) : (
        <Alert severity={immediate ? 'error' : 'warning'}
          action={<Box display="flex" gap={1}><Button color="inherit" size="small" onClick={() => setConfirmer(false)}>Annuler</Button>
            <Button color="inherit" size="small" variant="outlined" onClick={() => appliquer(true, immediate ? 'Maintenance lancée : les écoles voient la page de maintenance.' : 'Maintenance programmée.')} disabled={envoi}>Confirmer</Button></Box>}>
          {immediate ? 'Toutes les écoles seront bloquées immédiatement. Confirmer ?' : 'Un bandeau préviendra les écoles 24 h avant, puis l’accès sera bloqué à l’heure choisie. Confirmer ?'}
        </Alert>
      )}
    </Box>
  );
}
