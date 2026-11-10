import { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Alert, CircularProgress, Button, Chip, Card, CardContent, Avatar, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, FormControl, InputLabel, Select,
  Tabs, Tab, IconButton, Tooltip, Divider,
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { demandeInscriptionService, classeService, getResults } from 'services/api';

const dateFr = (iso) => {
  if (!iso) return '—';
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR');
};
const taille = (o) => (o >= 1048576 ? `${(o / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { useIsOnline } from 'offline/RequireOnline';

import { estEnLigne } from 'offline/reseau';
import { peutSaisir } from 'utils/droits';
export default function DossiersRecus() {
  const saisie = peutSaisir('secretariat'); // le directeur consulte, le secrétaire traite les dossiers
  const online = useIsOnline();
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [acceptOpen, setAcceptOpen] = useState(false);
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState('');
  const [motif, setMotif] = useState('');
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState(null);
  const [detail, setDetail] = useState(null); // dossier ouvert en détail

  const statutFilter = tab === 0 ? 'EN_ATTENTE' : tab === 1 ? 'ACCEPTEE' : 'REFUSEE';

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    readThrough(CacheKeys.dossiersRecus(statutFilter), async () => {
      const res = await demandeInscriptionService.getAll({ statut: statutFilter, inclure_suspendus: 1 });
      return getResults(res).items;
    })
      .then((r) => {
        if (r.neverCached) {
          setError(NEVER_CACHED_MSG);
          setItems([]);
        } else {
          setItems(r.data || []);
        }
      })
      .catch(() => setError(estEnLigne() ? 'Impossible de charger les dossiers.' : NEVER_CACHED_MSG))
      .finally(() => setLoading(false));
  }, [statutFilter]);

  useEffect(() => { load(); }, [load]);

  const openAccept = async (row) => {
    setSelected(row);
    setClasseId('');
    setError('');
    try {
      const res = await classeService.getAll('?inclure_suspendus=0');
      const { items: list } = getResults(res);
      const filtered = list.filter(
        (c) => !row.niveau_souhaite || c.niveau === row.niveau_souhaite || c.niveau_id === row.niveau_souhaite
      );
      setClasses(filtered.length ? filtered : list);
    } catch {
      setClasses([]);
    }
    setAcceptOpen(true);
  };

  const ouvrirPiece = async (row, piece) => {
    try {
      const res = await demandeInscriptionService.piece(row.id, piece.id);
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError('Impossible d’ouvrir cette pièce.');
    }
  };

  const openRefuse = (row) => {
    setSelected(row);
    setMotif('');
    setRefuseOpen(true);
  };

  const handleAccept = async () => {
    if (!online) {
      setError('Connexion requise pour accepter un dossier (création du compte).');
      return;
    }
    if (!classeId) {
      setError('Choisissez une classe.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await demandeInscriptionService.accepter(selected.id, { classe_id: classeId });
      setAcceptOpen(false);
      setCreds({
        nom: `${selected.prenom} ${selected.nom}`,
        username: res.data.username,
        password: res.data.mot_de_passe_temporaire,
        matricule: res.data.matricule,
        parent: res.data.compte_parent || null,
      });
      setSuccess('Dossier accepté — élève et inscription créés.');
      load();
    } catch (err) {
      const data = err?.response?.data;
      setError(
        data?.detail
        || data?.classe_id?.[0]
        || "Échec de l'acceptation."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRefuse = async () => {
    if (!motif.trim()) {
      setError('Indiquez le motif du refus.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await demandeInscriptionService.refuser(selected.id, motif.trim());
      setRefuseOpen(false);
      setSuccess('Dossier refusé.');
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.response?.data?.motif?.[0] || 'Échec du refus.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <AssignmentIcon color="primary" sx={{ fontSize: 30 }} />
        <Typography variant="h4" fontWeight="bold">Inscriptions en ligne</Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Demandes envoyées par les parents depuis le site de l&apos;école. Ouvrez un dossier pour voir la photo, le message et les pièces jointes.
        « Accepter » crée l&apos;élève, son inscription et ses comptes ; les pièces rejoignent son dossier.
      </Alert>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !acceptOpen && !refuseOpen && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2 }}>
        <Tab label="En attente" />
        <Tab label="Acceptés" />
        <Tab label="Refusés" />
      </Tabs>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : items.length === 0 ? (
        <Alert severity="info">Aucun dossier dans cette catégorie.</Alert>
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
          {items.map((row) => (
            <Card key={row.id} sx={{ borderRadius: 3, boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}>
              <CardContent>
                <Box display="flex" gap={1.5} alignItems="center">
                  <Avatar variant="rounded" src={row.photo_url || undefined}
                    sx={{ width: 56, height: 70, bgcolor: 'primary.light', fontWeight: 700 }}>
                    {`${row.prenom?.[0] || ''}${row.nom?.[0] || ''}`.toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={800} fontSize={17} noWrap>{row.prenom} {row.nom}</Typography>
                    <Box display="flex" gap={0.5} flexWrap="wrap" sx={{ my: 0.5 }}>
                      {row.niveau_nom && <Chip size="small" color="primary" variant="outlined" label={row.niveau_nom} />}
                      {row.sexe && <Chip size="small" variant="outlined" label={row.sexe === 'M' ? 'Garçon' : 'Fille'} />}
                      {(row.pieces || []).length > 0 && (
                        <Chip size="small" color="success" variant="outlined" icon={<AttachFileIcon />} label={`${row.pieces.length} pièce${row.pieces.length > 1 ? 's' : ''}`} />
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      Parent : {row.nom_parent} · {row.telephone_parent}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Déposé le {row.date_depot ? new Date(row.date_depot).toLocaleDateString('fr-FR') : '—'}
                    </Typography>
                  </Box>
                </Box>
                {row.motif_refus && <Alert severity="error" sx={{ mt: 1 }}>Motif du refus : {row.motif_refus}</Alert>}
                <Box display="flex" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
                  <Button size="small" variant="outlined" startIcon={<DescriptionIcon />} onClick={() => setDetail(row)}>
                    Voir le dossier
                  </Button>
                  {saisie && tab === 0 && (
                    <>
                      <Button size="small" variant="contained" color="success" startIcon={<CheckIcon />} onClick={() => openAccept(row)}>Accepter</Button>
                      <Button size="small" color="error" startIcon={<CloseIcon />} onClick={() => openRefuse(row)}>Refuser</Button>
                    </>
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Dossier en détail */}
      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} maxWidth="sm" fullWidth>
        {detail && (
          <>
            <DialogTitle>Dossier de {detail.prenom} {detail.nom}</DialogTitle>
            <DialogContent dividers>
              <Box display="flex" gap={2} flexWrap="wrap" alignItems="flex-start">
                <Avatar variant="rounded" src={detail.photo_url || undefined}
                  sx={{ width: 110, height: 140, bgcolor: 'grey.200', color: 'grey.600', fontSize: 14 }}>
                  Pas de photo
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 220, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  {[
                    ['Date de naissance', dateFr(detail.date_naissance)],
                    ['Âge', detail.age != null ? `${detail.age} an${detail.age > 1 ? 's' : ''}` : '—'],
                    ['Sexe', detail.sexe === 'M' ? 'Garçon' : detail.sexe === 'F' ? 'Fille' : '—'],
                    ['Niveau demandé', detail.niveau_nom || '—'],
                    ['Déposé le', detail.date_depot ? new Date(detail.date_depot).toLocaleString('fr-FR') : '—'],
                    ['Parent / tuteur', detail.nom_parent],
                    ['Téléphone', detail.telephone_parent],
                    ['Email', detail.email_parent || '—'],
                    ['Statut', detail.statut_libelle || detail.statut],
                  ].map(([etiquette, valeur]) => (
                    <Box key={etiquette}>
                      <Typography variant="caption" color="text.secondary">{etiquette}</Typography>
                      <Typography fontWeight={600} sx={{ wordBreak: 'break-word' }}>{valeur}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              {detail.message && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2">Message du parent</Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>{detail.message}</Typography>
                </>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom>Pièces jointes</Typography>
              {(detail.pieces || []).length === 0 ? (
                <Alert severity="info">Aucune pièce jointe : demandez-les au parent (acte de naissance, bulletin…). Vous pourrez les ajouter au dossier de l&apos;élève après l&apos;acceptation.</Alert>
              ) : detail.pieces.map((pc) => (
                <Box key={pc.id} display="flex" alignItems="center" gap={1} sx={{ py: 0.5 }}>
                  <DescriptionIcon fontSize="small" color="action" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600}>{pc.type_libelle}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>{pc.nom_fichier} · {taille(pc.taille)}</Typography>
                  </Box>
                  <Button size="small" onClick={() => ouvrirPiece(detail, pc)}>Ouvrir</Button>
                </Box>
              ))}
            </DialogContent>
            <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button onClick={() => setDetail(null)} color="inherit">Fermer</Button>
              <Box flex={1} />
              {saisie && detail.statut === 'EN_ATTENTE' && (
                <>
                  <Button color="error" onClick={() => { const d = detail; setDetail(null); openRefuse(d); }}>Refuser</Button>
                  <Button variant="contained" color="success" onClick={() => { const d = detail; setDetail(null); openAccept(d); }}>Accepter</Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Accepter */}
      <Dialog open={acceptOpen} onClose={() => setAcceptOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Accepter le dossier</DialogTitle>
        <DialogContent>
          {selected && (
            <Typography mb={2}>
              {selected.prenom} {selected.nom}
              {selected.niveau_nom ? ` — ${selected.niveau_nom}` : ''}
            </Typography>
          )}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <FormControl fullWidth>
            <InputLabel id="classe-accept">Classe</InputLabel>
            <Select
              labelId="classe-accept"
              label="Classe"
              value={classeId}
              onChange={(e) => setClasseId(e.target.value)}
            >
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.nom}{c.niveau_nom ? ` (${c.niveau_nom})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAcceptOpen(false)}>Annuler</Button>
          <Button variant="contained" color="success" disabled={saving || !classeId} onClick={handleAccept}>
            {saving ? '…' : 'Confirmer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Refuser */}
      <Dialog open={refuseOpen} onClose={() => setRefuseOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Refuser le dossier</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Motif du refus"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefuseOpen(false)}>Annuler</Button>
          <Button variant="contained" color="error" disabled={saving || !motif.trim()} onClick={handleRefuse}>
            {saving ? '…' : 'Refuser'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Identifiants temporaires */}
      <Dialog open={Boolean(creds)} onClose={() => setCreds(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Compte élève créé</DialogTitle>
        <DialogContent>
          {creds && (
            <Box>
              <Typography mb={1}><strong>{creds.nom}</strong></Typography>
              <Typography>Matricule : <strong>{creds.matricule}</strong></Typography>
              <Typography>Identifiant : <strong>{creds.username}</strong></Typography>
              <Box display="flex" alignItems="center" gap={1} mt={1}>
                <Typography>Mot de passe temporaire : <strong>{creds.password}</strong></Typography>
                <Tooltip title="Copier">
                  <IconButton size="small" onClick={() => navigator.clipboard?.writeText(creds.password || '')}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Alert severity="warning" sx={{ mt: 2 }}>
                Notez ce mot de passe maintenant — il ne sera plus affiché.
              </Alert>
              {creds.parent?.cree && (
                <Box mt={2} p={1.5} sx={{ bgcolor: 'grey.100', borderRadius: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Compte du parent</Typography>
                  <Typography>Identifiant (téléphone) : <strong>{creds.parent.username}</strong></Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography>Mot de passe temporaire : <strong>{creds.parent.mot_de_passe_temporaire}</strong></Typography>
                    <Tooltip title="Copier">
                      <IconButton size="small" onClick={() => navigator.clipboard?.writeText(creds.parent.mot_de_passe_temporaire || '')}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              )}
              {creds.parent?.lie && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Le parent a déjà un compte ({creds.parent.username}) : cet enfant y a été ajouté.
                </Alert>
              )}
              {creds.parent === null && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Pas de compte parent créé : numéro de téléphone du parent absent ou invalide.
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setCreds(null)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
