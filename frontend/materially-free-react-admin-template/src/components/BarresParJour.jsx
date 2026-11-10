import { Box, Tooltip, Typography } from '@mui/material';

const jourCourt = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });
const jourLong = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Une seule série, jour par jour : barres fines arrondies posées sur la ligne de base, survol = détail du jour.
 * Le titre nomme la série (pas de légende) ; les valeurs restent dans les couleurs du texte.
 * props : titre, donnees [{jour, valeur, detail?}], couleur (couleur de la série), hauteur
 */
export default function BarresParJour({ titre, donnees, couleur = 'primary.main', hauteur = 120, unite = '' }) {
  const max = Math.max(1, ...donnees.map((d) => d.valeur));
  const total = donnees.reduce((t, d) => t + d.valeur, 0);
  const etiquettes = donnees.length <= 10;
  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="baseline" mb={1}>
        <Typography variant="body2" fontWeight={700}>{titre}</Typography>
        <Typography variant="caption" color="text.secondary">Total : {total.toLocaleString('fr-FR')}{unite}</Typography>
      </Box>
      <Box role="img" aria-label={`${titre} : ${donnees.map((d) => `${jourLong(d.jour)} ${d.valeur}`).join(', ')}`}
        sx={{ position: 'relative', height: hauteur, display: 'flex', alignItems: 'flex-end', gap: '2px',
          borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary" sx={{ position: 'absolute', top: -2, left: 0, lineHeight: 1 }}>
          {max.toLocaleString('fr-FR')}
        </Typography>
        {donnees.map((d) => (
          <Tooltip key={d.jour} arrow placement="top"
            title={<Box><strong style={{ textTransform: 'capitalize' }}>{jourLong(d.jour)}</strong><br />{d.detail || `${d.valeur}${unite}`}</Box>}>
            {/* zone de survol plus large que la barre */}
            <Box sx={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default', '&:hover > div': { opacity: 0.8 } }}>
              <Box sx={{
                width: '100%', maxWidth: 28, mx: 'auto', bgcolor: couleur, borderRadius: '4px 4px 0 0',
                height: d.valeur ? `${Math.max(3, (d.valeur / max) * (hauteur - 16))}px` : 0,
              }} />
            </Box>
          </Tooltip>
        ))}
      </Box>
      {etiquettes && (
        <Box display="flex" gap="2px" mt={0.5}>
          {donnees.map((d) => (
            <Typography key={d.jour} variant="caption" color="text.secondary" sx={{ flex: 1, textAlign: 'center', textTransform: 'capitalize', fontSize: 11 }}>
              {jourCourt(d.jour)}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}
