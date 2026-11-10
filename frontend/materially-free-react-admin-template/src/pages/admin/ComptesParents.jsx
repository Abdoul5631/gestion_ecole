import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Avatar, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, InputAdornment, MenuItem, Pagination, TextField, Tooltip, Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import GroupsIcon from '@mui/icons-material/Groups';
import EditIcon from '@mui/icons-material/Edit';
import { eleveService, getResults, userService } from 'services/api';

const PAR_PAGE = 25;
const telephone = (u) => {
  if (String(u || '').startsWith('+')) return u; // numéro d'un autre pays : affiché tel quel
  const n = String(u || '').replace(/\D/g, '');
  const local = n.length > 8 ? n.slice(-8) : n;
  return local.length === 8 ? `+226 ${local.replace(/(\d{2})(?=\d)/g, '$1 ')}` : u;
};
const nomParent = (p) => `${p.first_name || ''} ${p.last_name || ''}`.trim();

/** Les comptes des parents : qui est relié à quel enfant, suspendre / réactiver un accès. */
export default function ComptesParents() {
  const [parents, setParents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState('tous');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [edition, setEdition] = useState(null); // { parent, prenom, nom, enfants: [{id, nom, prenom, matricule}] }
  const [envoi, setEnvoi] = useState(false);
  const [eleves, setEleves] = useState([]);
  const [rechEleve, setRechEleve] = useState('');

  const charger = useCallback(() => {
    setChargement(true);
    const p = new URLSearchParams({ role: 'PARENT', inclure_suspendus: '1', page: String(page), page_size: String(PAR_PAGE) });
    if (recherche.trim()) p.set('search', recherche.trim());
    userService.getAll(`?${p.toString()}`)
      .then((res) => {
        const { items, count } = getResults(res);
        setParents(items);
        setTotal(count);
        setErreur('');
      })
      .catch(() => setErreur('Impossible de charger les comptes des parents.'))
      .finally(() => setChargement(false));
  }, [page, recherche]);

  useEffect(() => {
    const t = setTimeout(charger, 300);
    return () => clearTimeout(t);
  }, [charger]);

  // recherche d'un élève à relier (2 lettres au moins)
  useEffect(() => {
    if (!edition || rechEleve.trim().length < 2) { setEleves([]); return undefined; }
    const t = setTimeout(() => {
      eleveService.getAll(`/eleves/?search=${encodeURIComponent(rechEleve.trim())}&page_size=15`)
        .then((res) => setEleves(getResults(res).items))
        .catch(() => setEleves([]));
    }, 300);
    return () => clearTimeout(t);
  }, [rechEleve, edition]);

  const ok = (m) => { setSucces(m); setTimeout(() => setSucces(''), 5000); };
  const affiches = parents.filter((p) => statut === 'tous' || (statut === 'actifs' ? p.is_active : !p.is_active));

  const ouvrir = (p) => {
    setRechEleve('');
    setEdition({ parent: p, prenom: p.first_name || '', nom: p.last_name || '', enfants: p.enfants_details || [] });
  };

  const enregistrer = async () => {
    setEnvoi(true);
    try {
      await userService.patch(edition.parent.id, {
        first_name: edition.prenom.trim(), last_name: edition.nom.trim(), enfants: edition.enfants.map((e) => e.id),
      });
      setEdition(null);
      ok('Compte du parent mis à jour.');
      charger();
    } catch (e) {
      setErreur(e.response?.data?.detail || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={2.5}>
        <Avatar variant="rounded" sx={{ bgcolor: 'primary.lighter', color: 'primary.main', width: 44, height: 44, borderRadius: 2 }}>
          <GroupsIcon />
        </Avatar>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Comptes des parents</Typography>
          <Typography variant="body2" color="text.secondary">
            {total} compte{total > 1 ? 's' : ''} · le parent se connecte avec son numéro de téléphone. Les comptes sont créés
            automatiquement à partir du téléphone du parent inscrit sur la fiche de l&apos;élève. Pour suspendre
            un compte (numéro réattribué, décision de justice…), contactez le support de la plateforme.
          </Typography>
        </Box>
      </Box>

      {erreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}
      {succes && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}>{succes}</Alert>}

      <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField size="small" placeholder="Nom du parent, téléphone, nom ou matricule d'un enfant…" value={recherche}
            onChange={(e) => { setRecherche(e.target.value); setPage(1); }} sx={{ flex: 1, minWidth: 220 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          <TextField select size="small" label="Statut" value={statut} onChange={(e) => setStatut(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="tous">Tous</MenuItem>
            <MenuItem value="actifs">Actifs</MenuItem>
            <MenuItem value="suspendus">Suspendus</MenuItem>
          </TextField>
        </Box>

        {chargement ? (
          <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
        ) : affiches.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>Aucun compte de parent trouvé.</Typography>
        ) : affiches.map((p) => (
          <Box key={p.id} sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider',
            flexWrap: 'wrap', opacity: p.is_active ? 1 : 0.6,
          }}>
            <Avatar sx={{ bgcolor: 'primary.main', fontWeight: 700 }}>{(nomParent(p) || '?')[0].toUpperCase()}</Avatar>
            <Box sx={{ minWidth: 180, flex: '0 1 240px' }}>
              <Typography fontWeight={700}>{nomParent(p) || <em style={{ color: '#999' }}>Nom non renseigné</em>}</Typography>
              <Typography variant="body2" color="text.secondary">{telephone(p.username)}</Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 200, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {(p.enfants_details || []).length === 0
                ? <Chip size="small" color="warning" variant="outlined" label="Aucun enfant relié" />
                : p.enfants_details.map((e) => <Chip key={e.id} size="small" label={`${e.prenom} ${e.nom}`} sx={{ fontWeight: 600 }} />)}
            </Box>
            <Chip size="small" variant="outlined" color={p.is_active ? 'success' : 'default'} label={p.is_active ? 'Actif' : 'Suspendu'} />
            <Box display="flex">
              <Tooltip title="Modifier le nom et les enfants reliés">
                <IconButton color="primary" onClick={() => ouvrir(p)}><EditIcon /></IconButton>
              </Tooltip>
            </Box>
          </Box>
        ))}

        {total > PAR_PAGE && (
          <Box display="flex" justifyContent="center" py={2} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
            <Pagination count={Math.ceil(total / PAR_PAGE)} page={page} onChange={(_, v) => setPage(v)} color="primary" />
          </Box>
        )}
      </Card>

      {/* Modifier : nom et enfants reliés */}
      <Dialog open={!!edition} onClose={() => setEdition(null)} fullWidth maxWidth="sm">
        <DialogTitle>Compte du parent — {edition && telephone(edition.parent.username)}</DialogTitle>
        {edition && (
          <DialogContent>
            <Box display="flex" gap={1.5} mt={1} mb={2.5} flexWrap="wrap">
              <TextField size="small" label="Prénom" value={edition.prenom} sx={{ flex: 1, minWidth: 160 }}
                onChange={(e) => setEdition({ ...edition, prenom: e.target.value })} />
              <TextField size="small" label="Nom" value={edition.nom} sx={{ flex: 1, minWidth: 160 }}
                onChange={(e) => setEdition({ ...edition, nom: e.target.value })} />
            </Box>
            <Typography fontWeight={700} mb={1}>Enfants reliés</Typography>
            <Box display="flex" gap={0.75} flexWrap="wrap" mb={1.5}>
              {edition.enfants.length === 0 && <Typography variant="body2" color="text.secondary">Aucun enfant relié.</Typography>}
              {edition.enfants.map((e) => (
                <Chip key={e.id} label={`${e.prenom} ${e.nom} · ${e.matricule}`}
                  onDelete={() => setEdition({ ...edition, enfants: edition.enfants.filter((x) => x.id !== e.id) })} />
              ))}
            </Box>
            <Autocomplete
              options={eleves.filter((e) => !edition.enfants.some((x) => x.id === e.id))}
              getOptionLabel={(e) => `${e.prenom} ${e.nom} · ${e.matricule}${e.classe_actuelle ? ` · ${e.classe_actuelle}` : ''}`}
              filterOptions={(x) => x}
              inputValue={rechEleve}
              onInputChange={(_, v) => setRechEleve(v)}
              value={null}
              onChange={(_, e) => { if (e) { setEdition({ ...edition, enfants: [...edition.enfants, e] }); setRechEleve(''); } }}
              noOptionsText={rechEleve.trim().length < 2 ? 'Tapez au moins 2 lettres' : 'Aucun élève trouvé'}
              renderInput={(params) => <TextField {...params} size="small" label="Relier un autre enfant" placeholder="Nom ou matricule de l'élève" />}
            />
          </DialogContent>
        )}
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEdition(null)} disabled={envoi}>Annuler</Button>
          <Button variant="contained" onClick={enregistrer} disabled={envoi}>
            {envoi ? <CircularProgress size={20} color="inherit" /> : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
