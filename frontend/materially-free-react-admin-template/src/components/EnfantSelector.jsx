import { Box, Tabs, Tab, Avatar, Typography, Chip, MenuItem, TextField } from '@mui/material';
import ChildCareIcon from '@mui/icons-material/ChildCare';

// Affiche un sélecteur d'enfant si le parent en a plusieurs.
// Si un seul enfant → affiche juste son nom (pas de sélecteur).
// Props: { enfants, selectedId, setSelectedId, loading }
export default function EnfantSelector({ enfants, selectedId, setSelectedId, loading }) {
  if (loading || enfants.length === 0) return null;

  const selected = enfants.find(e => e.id === selectedId);

  // 1 seul enfant → badge sans interaction
  if (enfants.length === 1) {
    return (
      <Box display="flex" alignItems="center" gap={1} mb={2}
        sx={{ bgcolor: 'primary.light', color: 'primary.contrastText', borderRadius: 2, px: 2, py: 1, width: 'fit-content' }}>
        <ChildCareIcon fontSize="small" />
        <Typography variant="body2" fontWeight="bold">
          {selected?.prenom} {selected?.nom}
        </Typography>
        <Chip label={selected?.matricule} size="small" sx={{ bgcolor: 'white', color: 'primary.main' }} />
      </Box>
    );
  }

  // Plusieurs enfants → onglets (≤4) ou dropdown (>4)
  if (enfants.length <= 4) {
    return (
      <Box mb={2}>
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          <ChildCareIcon sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.5 }} />
          Choisir un enfant
        </Typography>
        <Tabs
          value={selectedId}
          onChange={(_, v) => setSelectedId(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
        >
          {enfants.map(e => (
            <Tab
              key={e.id}
              value={e.id}
              label={
                <Box textAlign="center">
                  <Typography fontSize={12} fontWeight="bold">{e.prenom} {e.nom}</Typography>
                  <Typography fontSize={10} color="text.secondary">{e.matricule}</Typography>
                </Box>
              }
            />
          ))}
        </Tabs>
      </Box>
    );
  }

  // > 4 enfants → dropdown
  return (
    <Box mb={2} maxWidth={320}>
      <TextField
        select fullWidth size="small" label="Enfant"
        value={selectedId || ''}
        onChange={e => setSelectedId(parseInt(e.target.value, 10))}
        InputProps={{ startAdornment: <ChildCareIcon color="action" sx={{ mr: 1 }} /> }}
      >
        {enfants.map(e => (
          <MenuItem key={e.id} value={e.id}>
            {e.prenom} {e.nom} ({e.matricule})
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );
}
