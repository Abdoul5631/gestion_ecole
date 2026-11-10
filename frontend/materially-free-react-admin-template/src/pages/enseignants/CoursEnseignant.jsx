import { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, Alert, CircularProgress,
  TextField, MenuItem, Chip, FormControl, InputLabel, Select, Avatar,
  OutlinedInput, Checkbox, ListItemText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { alpha } from '@mui/material/styles';
import { classeMatiereService, matiereService, classeService } from 'services/api';
import useIsMobile from 'hooks/useIsMobile';

const lister = (res) => (Array.isArray(res.data) ? res.data : res.data?.results ?? []);
const initForm = { matiere: '', classes: [], coef: 1 };

/**
 * Cours d'un enseignant : liste de ses affectations (matière × classe) et ajout en une fois d'une matière
 * dans une ou plusieurs classes. Mêmes données que la page « Matières » : retirer un cours ne supprime pas
 * la matière de la classe, il la laisse sans enseignant.
 */
export default function CoursEnseignant({ enseignant, open, onClose, onChange }) {
  const isMobile = useIsMobile();
  const [toutes, setToutes] = useState([]); // toutes les affectations de l'école (pour repérer les conflits)
  const [matieres, setMatieres] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(initForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const charger = async () => {
    setLoading(true);
    try {
      const [cm, m, c] = await Promise.all([classeMatiereService.getAll(), matiereService.getAll(), classeService.getAll()]);
      setToutes(lister(cm));
      setMatieres(lister(m).filter((x) => x.is_active !== false));
      setClasses(lister(c).filter((x) => x.is_active !== false));
    } catch {
      setError('Impossible de charger les cours. Vérifiez la connexion et réessayez.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setForm(initForm);
    setError('');
    setInfo('');
    charger();
  }, [open, enseignant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sesCours = useMemo(
    () => toutes.filter((cm) => cm.enseignant === enseignant?.id && cm.is_active !== false)
      .sort((a, b) => (a.classe_nom || '').localeCompare(b.classe_nom || '') || (a.matiere_nom || '').localeCompare(b.matiere_nom || '')),
    [toutes, enseignant],
  );

  const parMatiere = useMemo(() => {
    const groupes = new Map();
    sesCours.forEach((cm) => {
      if (!groupes.has(cm.matiere_nom)) groupes.set(cm.matiere_nom, []);
      groupes.get(cm.matiere_nom).push(cm);
    });
    return [...groupes].map(([matiere, cours]) => ({ matiere, cours }));
  }, [sesCours]);

  const nomClasse = (id) => classes.find((c) => c.id === id)?.nom_complet || classes.find((c) => c.id === id)?.nom || id;

  const retirer = async (cm) => {
    setError('');
    setInfo('');
    try {
      await classeMatiereService.patch(cm.id, { enseignant: null });
      setInfo(`${cm.matiere_nom} en ${cm.classe_nom} retiré de ses cours (la matière reste dans la classe, sans enseignant).`);
      await charger();
      onChange?.();
    } catch {
      setError('Impossible de retirer ce cours.');
    }
  };

  const affecter = async () => {
    if (!form.matiere) { setError('Choisissez une matière.'); return; }
    if (form.classes.length === 0) { setError('Choisissez au moins une classe.'); return; }
    setSaving(true);
    setError('');
    setInfo('');
    const coef = parseFloat(form.coef) || 1;
    let faits = 0;
    const deja = [];
    const pris = [];
    let echecs = 0;
    for (const classeId of form.classes) {
      const existant = toutes.find((cm) => cm.classe === classeId && cm.matiere === form.matiere && cm.is_active !== false);
      try {
        if (!existant) {
          await classeMatiereService.create({ classe: classeId, matiere: form.matiere, enseignant: enseignant.id, coef });
          faits += 1;
        } else if (existant.enseignant === enseignant.id) {
          deja.push(nomClasse(classeId));
        } else if (!existant.enseignant) {
          await classeMatiereService.patch(existant.id, { enseignant: enseignant.id });
          faits += 1;
        } else {
          // une autre personne enseigne déjà cette matière dans cette classe : on ne la remplace pas sans le dire
          pris.push(`${nomClasse(classeId)} (${existant.enseignant_nom})`);
        }
      } catch {
        echecs += 1;
      }
    }
    const notes = [];
    if (faits) notes.push(`${faits} cours affecté${faits > 1 ? 's' : ''}.`);
    if (deja.length) notes.push(`Déjà à lui : ${deja.join(', ')}.`);
    if (pris.length) notes.push(`Non modifié, déjà confié à un autre enseignant : ${pris.join(', ')}. Changez-le depuis la page Matières.`);
    if (echecs) notes.push(`${echecs} échec(s), réessayez.`);
    if (faits) { setInfo(notes.join(' ')); setError(''); } else { setError(notes.join(' ') || 'Aucun cours affecté.'); }
    if (faits) setForm(initForm);
    setSaving(false);
    await charger();
    if (faits) onChange?.();
  };

  const initiales = (enseignant?.nom || '').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase() || '?';
  const nbClasses = form.classes.length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={isMobile} PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <Avatar sx={{ bgcolor: (t) => alpha(t.palette.primary.main, 0.12), color: 'primary.main', fontWeight: 700 }}>{initiales}</Avatar>
        <Box>
          <Typography variant="h5" fontWeight={700} lineHeight={1.2}>{enseignant?.nom}</Typography>
          <Typography variant="body2" color="text.secondary">
            {sesCours.length === 0
              ? 'Aucun cours pour le moment'
              : `${sesCours.length} cours · ${parMatiere.length} matière${parMatiere.length > 1 ? 's' : ''}`}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo('')}>{info}</Alert>}

        <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.8 }}>Cours actuels</Typography>
        {loading && toutes.length === 0 ? (
          <Box display="flex" justifyContent="center" p={3}><CircularProgress size={28} /></Box>
        ) : parMatiere.length === 0 ? (
          <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 2, p: 2.5, textAlign: 'center', mt: 0.5 }}>
            <Typography color="text.secondary">Pas encore de cours. Utilisez le formulaire ci-dessous pour lui en donner.</Typography>
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={1.25} sx={{ mt: 0.5 }}>
            {parMatiere.map(({ matiere, cours }) => (
              <Box key={matiere} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Box display="flex" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography fontWeight={700}>{matiere}</Typography>
                  <Typography variant="caption" color="text.secondary">{cours.length} classe{cours.length > 1 ? 's' : ''}</Typography>
                </Box>
                <Box display="flex" gap={0.75} flexWrap="wrap">
                  {cours.map((cm) => (
                    <Chip key={cm.id} size="small" label={`${cm.classe_nom} · coef ${cm.coef}`} onDelete={() => retirer(cm)}
                      title="Cliquez sur la croix pour retirer ce cours à l'enseignant"
                      sx={{
                        fontWeight: 600, color: 'primary.main', bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
                        '& .MuiChip-deleteIcon': { color: 'text.disabled', '&:hover': { color: 'error.main' } },
                      }} />
                  ))}
                </Box>
              </Box>
            ))}
            <Typography variant="caption" color="text.secondary">
              La croix retire le cours à l&apos;enseignant : la matière reste dans la classe, sans enseignant.
            </Typography>
          </Box>
        )}

        <Box sx={{ mt: 3, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Box display="flex" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
            <AddIcon fontSize="small" color="primary" />
            <Typography fontWeight={700}>Lui donner un nouveau cours</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choisissez la matière, puis cochez toutes les classes où il l&apos;enseigne.
          </Typography>
          <Box display="grid" gap={2} gridTemplateColumns={{ xs: '1fr', sm: '1fr 110px' }} alignItems="start">
            <TextField select size="small" fullWidth label="Matière" value={form.matiere} sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
              onChange={(e) => setForm({ ...form, matiere: e.target.value })}>
              {matieres.map((m) => <MenuItem key={m.id} value={m.id}>{m.nom}</MenuItem>)}
            </TextField>
            <TextField size="small" type="number" label="Coef." value={form.coef} inputProps={{ min: 0, step: 0.5 }}
              sx={{ bgcolor: 'background.paper', borderRadius: 1 }} onChange={(e) => setForm({ ...form, coef: e.target.value })} />
            <FormControl size="small" fullWidth sx={{ gridColumn: { sm: '1 / -1' }, bgcolor: 'background.paper', borderRadius: 1 }}>
              <InputLabel id="cours-classes-label">Classes (une ou plusieurs)</InputLabel>
              <Select
                labelId="cours-classes-label"
                multiple
                value={form.classes}
                onChange={(e) => setForm({ ...form, classes: typeof e.target.value === 'string' ? [] : e.target.value })}
                input={<OutlinedInput label="Classes (une ou plusieurs)" />}
                renderValue={(ids) => (
                  <Box display="flex" gap={0.5} flexWrap="wrap">
                    {ids.map((id) => <Chip key={id} size="small" label={nomClasse(id)} />)}
                  </Box>
                )}
              >
                {classes.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    <Checkbox checked={form.classes.includes(c.id)} />
                    <ListItemText primary={c.nom_complet || c.nom} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Le coefficient ne sert que si la matière n&apos;existe pas encore dans la classe.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Fermer</Button>
        <Button variant="contained" disableElevation startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
          disabled={saving || !form.matiere || nbClasses === 0} onClick={affecter}>
          {nbClasses > 0 ? `Affecter à ${nbClasses} classe${nbClasses > 1 ? 's' : ''}` : 'Affecter'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
