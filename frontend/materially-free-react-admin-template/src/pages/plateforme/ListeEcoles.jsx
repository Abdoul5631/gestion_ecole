import { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Button, Chip, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, CircularProgress,
  ToggleButton, ToggleButtonGroup, Stack
} from '@mui/material';
import KeyIcon from '@mui/icons-material/VpnKey';
import { useNavigate } from 'react-router-dom';
import { ecoleService } from 'services/api';

const STATUTS = [
  { value: '', label: 'Toutes' },
  { value: 'EN_ATTENTE', label: 'En attente' },
  { value: 'VALIDEE', label: 'Validées' },
  { value: 'REFUSEE', label: 'Refusées' },
  { value: 'SUSPENDUE', label: 'Suspendues' },
];

const CHIP = {
  EN_ATTENTE: { color: 'warning', label: 'En attente' },
  VALIDEE: { color: 'success', label: 'Validée' },
  REFUSEE: { color: 'error', label: 'Refusée' },
  SUSPENDUE: { color: 'default', label: 'Suspendue' },
};

export default function ListeEcolesPlateforme() {
  const navigate = useNavigate();
  const [ecoles, setEcoles] = useState([]);
  const [filtre, setFiltre] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialog, setDialog] = useState(null);
  const [motif, setMotif] = useState('');
  const [saving, setSaving] = useState(false);
  const [identifiants, setIdentifiants] = useState(null); // mot de passe provisoire du directeur, montré une fois

  const load = async (statut = filtre) => {
    setLoading(true);
    setError('');
    try {
      const params = statut ? { statut } : {};
      const { data } = await ecoleService.liste(params);
      setEcoles(Array.isArray(data) ? data : []);
    } catch {
      setError('Impossible de charger les établissements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAction = (ecole, action) => {
    setMotif(ecole.motif || '');
    setDialog({ ecole, action });
  };

  const runAction = async () => {
    if (!dialog) return;
    const { ecole, action } = dialog;
    setSaving(true);
    setError('');
    try {
      let res = null;
      if (action === 'valider') res = await ecoleService.valider(ecole.id);
      else if (action === 'refuser') await ecoleService.refuser(ecole.id, motif);
      else if (action === 'suspendre') await ecoleService.suspendre(ecole.id, motif);
      else if (action === 'reactiver') res = await ecoleService.reactiver(ecole.id);
      if (res?.data?.identifiants) setIdentifiants({ ...res.data.identifiants, ecole: ecole.nom_ecole });
      setSuccess(
        action === 'valider' ? 'École validée.'
          : action === 'refuser' ? 'École refusée.'
            : action === 'suspendre' ? 'École suspendue.'
              : 'École réactivée.'
      );
      setDialog(null);
      await load();
    } catch (err) {
      const d = err.response?.data;
      setError(d?.motif?.[0] || d?.detail || 'Action impossible.');
    } finally {
      setSaving(false);
    }
  };

  const actionLabel = {
    valider: 'Valider',
    refuser: 'Refuser',
    suspendre: 'Suspendre',
    reactiver: 'Réactiver',
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={1}>
        Établissements
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Validez les écoles avant qu’elles puissent utiliser la pédagogie et la caisse.
        Aucune suppression définitive : refusez ou suspendez seulement.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Stack direction="row" spacing={2} mb={2} flexWrap="wrap" useFlexGap>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={filtre}
          onChange={(_, v) => {
            if (v === null) return;
            setFiltre(v);
            load(v);
          }}
        >
          {STATUTS.map((s) => (
            <ToggleButton key={s.value || 'all'} value={s.value}>{s.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>École</TableCell>
                    <TableCell>Ville</TableCell>
                    <TableCell>Directeur</TableCell>
                    <TableCell>Contact</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell>Motif</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ecoles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography color="text.secondary">Aucun établissement.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {ecoles.map((e) => {
                    const chip = CHIP[e.statut] || CHIP.EN_ATTENTE;
                    return (
                      <TableRow key={e.id} hover>
                        <TableCell>
                          <Typography fontWeight={600}>{e.nom_ecole}</Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {[e.statut_juridique_libelle, e.ordre_enseignement_libelle, e.annee_creation && `créée en ${e.annee_creation}`].filter(Boolean).join(' · ')}
                          </Typography>
                          {e.numero_autorisation && <Typography variant="caption" color="text.secondary">Autorisation : {e.numero_autorisation}</Typography>}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{e.ville || '—'}</Typography>
                          <Typography variant="caption" color="text.secondary">{[e.adresse, e.direction_regionale, e.direction_provinciale].filter(Boolean).join(' · ')}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{e.directeur || '—'}</Typography>
                          <Typography variant="caption" color="text.secondary" display="block">{e.directeur_email || ''}</Typography>
                          {e.telephone_directeur && <Typography variant="caption" color="text.secondary">{e.telephone_directeur}</Typography>}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{e.telephone || '—'}</Typography>
                          <Typography variant="caption" color="text.secondary">{e.email || ''}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" color={chip.color} label={chip.label} />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 200 }}>
                          <Typography variant="caption">{e.motif || '—'}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                            {e.statut !== 'VALIDEE' && (
                              <Button size="small" variant="contained" color="success" onClick={() => openAction(e, e.statut === 'SUSPENDUE' ? 'reactiver' : 'valider')}>
                                {e.statut === 'SUSPENDUE' ? 'Réactiver' : 'Valider'}
                              </Button>
                            )}
                            {e.statut === 'EN_ATTENTE' && (
                              <Button size="small" color="error" onClick={() => openAction(e, 'refuser')}>Refuser</Button>
                            )}
                            {e.statut === 'VALIDEE' && (
                              <Button size="small" color="warning" onClick={() => openAction(e, 'suspendre')}>Suspendre</Button>
                            )}
                            {e.statut === 'VALIDEE' && (
                              <Button size="small" startIcon={<KeyIcon />} onClick={() => navigate(`/plateforme/comptes?ecole=${e.id}`)}>Comptes</Button>
                            )}
                            {e.statut === 'REFUSEE' && (
                              <Button size="small" onClick={() => openAction(e, 'valider')}>Valider</Button>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!dialog} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {dialog ? `${actionLabel[dialog.action]} — ${dialog.ecole.nom_ecole}` : ''}
        </DialogTitle>
        <DialogContent>
          {(dialog?.action === 'refuser' || dialog?.action === 'suspendre') && (
            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={3}
              label={dialog.action === 'refuser' ? 'Motif du refus' : 'Motif (optionnel)'}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              sx={{ mt: 1 }}
              required={dialog.action === 'refuser'}
            />
          )}
          {dialog?.action === 'valider' && (
            <Box sx={{ mt: 1 }}>
              <Typography mb={1.5}>Vérifiez l&apos;identité de l&apos;école avant de valider :</Typography>
              <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', mb: 1.5, display: 'grid', gap: 0.5 }}>
                {[['Établissement', dialog.ecole.nom_ecole], ['Statut', dialog.ecole.statut_juridique_libelle], ['Ordre', dialog.ecole.ordre_enseignement_libelle],
                  ['Création', dialog.ecole.annee_creation], ['Autorisation', dialog.ecole.numero_autorisation],
                  ['Lieu', [dialog.ecole.adresse, dialog.ecole.ville].filter(Boolean).join(', ')],
                  ['Directions', [dialog.ecole.direction_regionale, dialog.ecole.direction_provinciale].filter(Boolean).join(' · ')],
                  ['Téléphone école', dialog.ecole.telephone], ['Directeur', dialog.ecole.directeur],
                  ['E-mail de connexion', dialog.ecole.directeur_email], ['Téléphone directeur', dialog.ecole.telephone_directeur]]
                  .filter(([, v]) => v).map(([k, v]) => (
                    <Typography key={k} variant="body2"><strong>{k} :</strong> {v}</Typography>
                  ))}
              </Box>
              <Alert severity="info">
                En validant, un <strong>mot de passe provisoire</strong> est créé pour le directeur. Il vous sera affiché, et envoyé par SMS
                au directeur si la passerelle SMS est active. Le directeur se connecte avec son e-mail et le change à la première connexion.
              </Alert>
            </Box>
          )}
          {dialog?.action === 'reactiver' && (
            <Typography sx={{ mt: 1 }}>
              L’école redevient active. Ses utilisateurs pourront se reconnecter.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={runAction}
            disabled={saving || (dialog?.action === 'refuser' && !motif.trim())}
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Confirmer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Identifiants du directeur, montrés une seule fois après la validation */}
      <Dialog open={!!identifiants} onClose={() => setIdentifiants(null)} fullWidth maxWidth="sm">
        <DialogTitle>Accès du directeur — {identifiants?.ecole}</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            L&apos;école est validée. Transmettez ces accès au directeur{identifiants?.telephone ? ` (téléphone : ${identifiants.telephone})` : ''}.
            {identifiants?.sms === 'SENT' ? ' Ils lui ont aussi été envoyés par SMS.' : ' La passerelle SMS n’est pas active : appelez-le ou envoyez-les vous-même.'}
          </Alert>
          {[['E-mail de connexion', identifiants?.email], ['Mot de passe provisoire', identifiants?.mot_de_passe_temporaire]].map(([k, v]) => (
            <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, mb: 1, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Box flex={1}>
                <Typography variant="caption" color="text.secondary">{k}</Typography>
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 18 }}>{v}</Typography>
              </Box>
              <Button size="small" onClick={() => navigator.clipboard?.writeText(v || '')}>Copier</Button>
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary">
            Ce mot de passe ne sera plus affiché. En cas de perte : page Comptes utilisateurs, onglet Mot de passe.
          </Typography>
        </DialogContent>
        <DialogActions><Button variant="contained" onClick={() => setIdentifiants(null)}>J&apos;ai transmis les accès</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
