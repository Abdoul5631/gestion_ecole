import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Typography } from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

/**
 * Publication d'un calendrier (compositions ou examen blanc) : tant qu'il n'est pas publié, enseignants, élèves
 * et parents ne le voient pas. Publier prévient les parents et les élèves du niveau par une notification.
 */
export default function PublicationCalendrier({ calendrier, service, onChange }) {
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);

  if (!calendrier?.id) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        Enregistrez d&apos;abord le calendrier : vous pourrez ensuite le publier pour les familles.
      </Alert>
    );
  }

  const agir = async (publier) => {
    setEnvoi(true); setMessage(null);
    try {
      const { data } = publier ? await service.publier(calendrier.id) : await service.retirer(calendrier.id);
      onChange({ ...calendrier, publie: data.publie, publie_le: data.publie_le || null });
      setMessage(publier
        ? { severity: 'success', texte: `Publié. ${data.prevenus} compte${data.prevenus > 1 ? 's' : ''} (parents et élèves) prévenu${data.prevenus > 1 ? 's' : ''} par notification.` }
        : { severity: 'info', texte: 'Publication retirée : les familles et les enseignants ne le voient plus.' });
    } catch (e) {
      setMessage({ severity: 'error', texte: e.response?.data?.detail || 'Action impossible.' });
    } finally {
      setEnvoi(false);
    }
  };

  const publieLe = calendrier.publie_le
    ? new Date(calendrier.publie_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <Card sx={{ mt: 2, borderLeft: '5px solid', borderLeftColor: calendrier.publie ? 'success.main' : 'warning.main' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" gap={1.5} flexWrap="wrap">
          <Box sx={{ minWidth: 0 }}>
            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
              <Typography fontWeight={800}>Publication</Typography>
              <Chip size="small" color={calendrier.publie ? 'success' : 'warning'}
                label={calendrier.publie ? `Publié le ${publieLe}` : 'Non publié'} sx={{ fontWeight: 700 }} />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {calendrier.publie
                ? 'Visible par les enseignants, les élèves et les parents du niveau. Il disparaît pour les familles une fois la session terminée. Après une modification, prévenez-les à nouveau.'
                : 'Invisible pour les enseignants, les élèves et les parents tant que vous ne le publiez pas.'}
            </Typography>
          </Box>
          <Box display="flex" gap={1} flexWrap="wrap">
            {calendrier.publie && (
              <Button color="inherit" startIcon={<VisibilityOffIcon />} disabled={envoi} onClick={() => agir(false)} sx={{ textTransform: 'none' }}>
                Retirer
              </Button>
            )}
            <Button variant="contained" color="success" disableElevation disabled={envoi}
              startIcon={envoi ? <CircularProgress size={16} color="inherit" /> : <CampaignIcon />}
              onClick={() => agir(true)} sx={{ textTransform: 'none', fontWeight: 700 }}>
              {calendrier.publie ? 'Prévenir des changements' : 'Publier et prévenir les parents'}
            </Button>
          </Box>
        </Box>
        {message && <Alert severity={message.severity} sx={{ mt: 1.5 }} onClose={() => setMessage(null)}>{message.texte}</Alert>}
      </CardContent>
    </Card>
  );
}
