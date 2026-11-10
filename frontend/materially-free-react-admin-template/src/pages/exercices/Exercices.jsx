import { useEffect, useMemo, useState } from 'react';
import api, { getResults } from 'services/api';
import authService from 'services/auth';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import { readThrough, scopedKey, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { useIsOnline } from 'offline/RequireOnline';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import EventIcon from '@mui/icons-material/Event';
import AssignmentIcon from '@mui/icons-material/Assignment';
import HistoryIcon from '@mui/icons-material/History';

const EMPTY_FORM = { classe_matiere: '', titre: '', consigne: '', date_limite: '' };

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Jours restants avant l'échéance (négatif = dépassée). */
function joursRestants(iso) {
  return Math.ceil((new Date(`${iso}T00:00:00`) - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

/** Un exercice est passé quand son échéance est dépassée (sans échéance : il reste en cours). */
const estPasse = (exo) => !!exo.date_limite && joursRestants(exo.date_limite) < 0;

/** Couleur de l'échéance d'un exercice en cours : orange si dans les 2 jours. */
function couleurEcheance(iso) {
  return joursRestants(iso) <= 2 ? 'warning' : 'info';
}

export default function Exercices() {
  const role = authService.getRole();
  const online = useIsOnline();
  const isEnseignant = role === 'ENSEIGNANT';
  const isAdmin = role === 'ADMIN';
  const isParent = role === 'PARENT';

  const { enfants, selectedId, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();

  const [exercices, setExercices] = useState([]);
  const [cours, setCours] = useState([]); // classe-matières (enseignant) ou classes (admin)
  const [filtre, setFiltre] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fichier, setFichier] = useState(null);
  const [saving, setSaving] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (isParent && selectedId) p.set('eleve_id', selectedId);
    if (isAdmin && filtre) p.set('classe_id', filtre);
    if (isEnseignant && filtre) p.set('classe_matiere_id', filtre);
    const q = p.toString();
    return q ? `?${q}` : '';
  }, [isParent, isAdmin, isEnseignant, selectedId, filtre]);

  const charger = () => {
    if (isParent && (loadingEnfants || !selectedId)) return;
    setLoading(true);
    setError('');
    readThrough(scopedKey(`exercices:${params || 'all'}`), async () => {
      const res = await api.get(`/exercices/${params}`);
      return getResults(res).items;
    })
      .then((r) => {
        if (r.neverCached) setError(NEVER_CACHED_MSG);
        setExercices(r.data || []);
      })
      .catch(() => setError('Impossible de charger les exercices.'))
      .finally(() => setLoading(false));
  };

  useEffect(charger, [params, loadingEnfants]); // eslint-disable-line react-hooks/exhaustive-deps

  // Liste des cours de l'enseignant / des classes pour le directeur
  useEffect(() => {
    if (!isEnseignant && !isAdmin) return;
    const url = isEnseignant ? '/classe-matieres/' : '/classes/';
    api.get(url).then((res) => setCours(getResults(res).items)).catch(() => {});
  }, [isEnseignant, isAdmin]);

  const ouvrirFormulaire = () => {
    setForm({ ...EMPTY_FORM, classe_matiere: cours.length === 1 ? cours[0].id : '' });
    setFichier(null);
    setError('');
    setOpen(true);
  };

  const publier = async () => {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('classe_matiere', form.classe_matiere);
      fd.append('titre', form.titre.trim());
      fd.append('consigne', form.consigne);
      if (form.date_limite) fd.append('date_limite', form.date_limite);
      if (fichier) fd.append('fichier', fichier);
      await api.post('/exercices/', fd, { headers: { 'Content-Type': undefined } });
      setOpen(false);
      setSuccess('Exercice publié. Les élèves et leurs parents sont prévenus.');
      setTimeout(() => setSuccess(''), 6000);
      charger();
    } catch (err) {
      const data = err.response?.data;
      if (data?.fichier) setError(`Fichier : ${[].concat(data.fichier)[0]}`);
      else if (data?.classe_matiere) setError([].concat(data.classe_matiere)[0]);
      else if (data?.titre) setError('Le titre est obligatoire.');
      else setError("Impossible de publier l'exercice.");
    } finally {
      setSaving(false);
    }
  };

  const retirer = async (exo) => {
    if (!window.confirm(`Retirer l'exercice « ${exo.titre} » ?`)) return;
    try {
      await api.delete(`/exercices/${exo.id}/`);
      setExercices((prev) => prev.filter((e) => e.id !== exo.id));
    } catch {
      setError("Impossible de retirer l'exercice.");
    }
  };

  const actifs = exercices.filter((e) => !estPasse(e));
  const passes = exercices.filter(estPasse);

  const carteExercice = (exo, passe) => (
          <Card key={exo.id} sx={passe
            ? { borderRadius: 3, boxShadow: 'none', border: '1px dashed', borderColor: 'divider', bgcolor: 'action.hover' }
            : { borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <CardContent sx={passe ? { opacity: 0.7 } : undefined}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Box display="flex" gap={0.75} flexWrap="wrap" mb={0.75}>
                    <Chip size="small" color={passe ? 'default' : 'primary'} label={exo.matiere_nom} />
                    <Chip size="small" variant="outlined" label={exo.classe_nom} />
                  </Box>
                  <Typography variant="h5" fontWeight={700} sx={{ wordBreak: 'break-word' }}>{exo.titre}</Typography>
                </Box>
                {isEnseignant && (
                  <Tooltip title="Supprimer">
                    <IconButton color="error" onClick={() => retirer(exo)} aria-label="Supprimer">
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>

              {exo.consigne && (
                <Typography sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{exo.consigne}</Typography>
              )}

              <Box display="flex" gap={1} flexWrap="wrap" alignItems="center" mt={1.5}>
                {exo.date_limite && (
                  passe ? (
                    <Chip size="small" variant="outlined" icon={<HistoryIcon />}
                      label={`Échéance passée · le ${formatDate(exo.date_limite)}`} />
                  ) : (
                    <Chip size="small" icon={<EventIcon />} color={couleurEcheance(exo.date_limite)}
                      label={`À rendre pour le ${formatDate(exo.date_limite)}`} />
                  )
                )}
                {exo.fichier_url && (
                  <Button size="small" variant="outlined" startIcon={<AttachFileIcon />}
                    href={exo.fichier_url} target="_blank" rel="noopener noreferrer">
                    {exo.fichier_nom || 'Fichier joint'}
                  </Button>
                )}
              </Box>

              <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
                {exo.enseignant_nom ? `Donné par ${exo.enseignant_nom} · ` : ''}le {formatDate(exo.created_at)}
              </Typography>
            </CardContent>
          </Card>
  );

  const titrePage = isEnseignant ? 'Mes exercices' : 'Exercices';
  const aide = {
    ENSEIGNANT: 'Donnez du travail à vos classes : les élèves et leurs parents le voient et sont notifiés.',
    ADMIN: "Vue d'ensemble des exercices donnés par les enseignants de l'école.",
    PARENT: 'Travail à faire donné par les enseignants à votre enfant.',
    ELEVE: 'Travail à faire donné par tes enseignants.',
  }[role];

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} mb={1}>
        <Typography variant="h3" fontWeight="bold">{titrePage}</Typography>
        {isEnseignant && (
          <Tooltip title={online ? '' : 'Connexion requise pour publier un exercice'}>
            <span>
              <Button variant="contained" startIcon={<AddIcon />} onClick={ouvrirFormulaire} disabled={!online || cours.length === 0}>
                Nouvel exercice
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>
      {aide && <Typography color="text.secondary" sx={{ mb: 2 }}>{aide}</Typography>}

      {isEnseignant && cours.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Aucune classe ne vous est affectée pour le moment. Demandez à la direction de vous affecter une matière dans une classe.
        </Alert>
      )}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {isParent && (
        <EnfantSelector enfants={enfants} selectedId={selectedId} setSelectedId={setSelectedId} loading={loadingEnfants} />
      )}

      {(isAdmin || (isEnseignant && cours.length > 1)) && (
        <TextField select size="small" label={isAdmin ? 'Filtrer par classe' : 'Filtrer par cours'} value={filtre}
          onChange={(e) => setFiltre(e.target.value)} fullWidth sx={{ maxWidth: 360, mb: 2 }}>
          <MenuItem value="">Toutes</MenuItem>
          {cours.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {isAdmin ? c.nom : `${c.matiere_nom} — ${c.classe_nom || c.classe_nom_complet || ''}`}
            </MenuItem>
          ))}
        </TextField>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : exercices.length === 0 ? (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ textAlign: 'center', py: 5 }}>
            <AssignmentIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography color="text.secondary" mt={1}>Aucun exercice pour le moment.</Typography>
          </CardContent>
        </Card>
      ) : (
        <Box display="flex" flexDirection="column" gap={2}>
          {actifs.map((exo) => carteExercice(exo, false))}
          {passes.length > 0 && (
            <>
              <Box display="flex" alignItems="center" gap={1.5} mt={actifs.length ? 2 : 0}>
                <HistoryIcon color="disabled" />
                <Typography fontWeight={700} color="text.secondary">Exercices passés ({passes.length})</Typography>
                <Box flex={1} borderTop="1px solid" borderColor="divider" />
              </Box>
              {passes.map((exo) => carteExercice(exo, true))}
            </>
          )}
        </Box>
      )}

      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouvel exercice</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField select fullWidth label="Classe et matière" value={form.classe_matiere}
              onChange={(e) => setForm({ ...form, classe_matiere: e.target.value })} required>
              {cours.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.matiere_nom} — {c.classe_nom || c.classe_nom_complet || ''}</MenuItem>
              ))}
            </TextField>
            <TextField fullWidth label="Titre" value={form.titre} required inputProps={{ maxLength: 160 }}
              onChange={(e) => setForm({ ...form, titre: e.target.value })} placeholder="Ex : Exercices sur les fractions" />
            <TextField fullWidth multiline minRows={4} label="Consigne" value={form.consigne}
              onChange={(e) => setForm({ ...form, consigne: e.target.value })}
              placeholder="Ex : Faire les exercices 3 à 7 page 42 et apprendre la leçon." />
            <TextField fullWidth type="date" label="À rendre pour le (facultatif)" value={form.date_limite}
              onChange={(e) => setForm({ ...form, date_limite: e.target.value })} InputLabelProps={{ shrink: true }} />
            <Box>
              <Button component="label" variant="outlined" startIcon={<AttachFileIcon />}>
                {fichier ? fichier.name : 'Joindre un fichier (facultatif)'}
                <input hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => setFichier(e.target.files?.[0] || null)} />
              </Button>
              <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                PDF, Word, image… 10 Mo maximum.
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
          <Button variant="contained" onClick={publier} disabled={saving || !form.classe_matiere || !form.titre.trim()}>
            {saving ? <CircularProgress size={18} /> : 'Publier'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
