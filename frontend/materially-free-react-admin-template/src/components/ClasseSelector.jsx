import { useEffect, useState } from 'react';
import { TextField, MenuItem, CircularProgress } from '@mui/material';
import { niveauService } from 'services/api';

export default function ClasseSelector({ onChange, value, label = 'Filtrer par niveau' }) {
  const [niveaux, setNiveaux] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    niveauService.getAll()
      .then(res => setNiveaux(res.data))
      .catch(err => console.error("Erreur chargement niveaux", err))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const id = e.target.value;
    const selected = niveaux.find(n => n.id === id);
    onChange(selected ? { id, niveau: id } : { id: '', niveau: '' });
  };

  if (loading) return <CircularProgress size={24} sx={{ m: 1 }} />;

  return (
    <TextField
      select
      fullWidth
      label={label}
      value={value || ''}
      onChange={handleChange}
      size="small"
    >
      <MenuItem value=""><em>Tous les niveaux</em></MenuItem>
      {niveaux.map(n => (
        <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>
      ))}
    </TextField>
  );
}
