import { useEffect, useState } from 'react';
import api, { anneeService, trimestreService } from 'services/api';
import {
  Box, Typography, Grid, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, CircularProgress, Chip, Tooltip, Tabs, Tab
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import useIsMobile from 'hooks/useIsMobile';

// Une seule année est « en cours » : c'est elle que toute l'école utilise (classes, inscriptions, notes, caisse)
const ETATS = {
  EN_COURS: { label: 'Année en cours', color: 'success', variant: 'filled' },
  A_VENIR: { label: 'À venir', color: 'info', variant: 'outlined' },
  TERMINEE: { label: 'Terminée', color: 'default', variant: 'outlined' },
};
const NOMS_TRIMESTRES = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];
const numero = (nom) => Number(String(nom || '').replace(/\D/g, '')) || 0;
const libelleSuivant = (l) => { const m = /^(\d{4})-(\d{4})$/.exec(l || ''); return m ? `${+m[1] + 1}-${+m[2] + 1}` : ''; };

const erreurApi = (e, defaut) => {
  const d = e?.response?.data;
  if (!d) return defaut;
  if (typeof d.detail === 'string') return d.detail;
  const premier = Object.values(d)[0];
  return Array.isArray(premier) ? premier[0] : (typeof premier === 'string' ? premier : defaut);
};

/** Ce que contient une année ou un trimestre, affiché avant toute action. */
function Contenu({ c, titre }) {
  if (!c) return <Box display="flex" justifyContent="center" py={1.5}><CircularProgress size={22} /></Box>;
  const lignes = [
    ['inscriptions', 'élève(s) inscrit(s)'], ['classes', 'classe(s)'], ['trimestres', 'trimestre(s)'],
    ['evaluations', 'évaluation(s)'], ['notes', 'note(s)'], ['paiements', 'paiement(s)'],
  ].filter(([k]) => c[k] !== undefined);
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', mb: 1.5 }}>
      {titre && <Typography variant="body2" fontWeight={700} mb={0.75}>{titre}</Typography>}
      <Box display="flex" gap={0.75} flexWrap="wrap">
        {lignes.map(([k, l]) => <Chip key={k} size="small" variant="outlined" label={`${c[k]} ${l}`} />)}
      </Box>
    </Box>
  );
}

export default function GestionAnneeScolaire() {
  const isMobile = useIsMobile();
  const [annees, setAnnees] = useState([]);
  const [trimestres, setTrimestres] = useState([]);
  const [anneeVue, setAnneeVue] = useState(null); // année dont on affiche les trimestres
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreurDialogue, setErreurDialogue] = useState('');

  // Année : créer / modifier / définir comme année en cours
  const [openAnnee, setOpenAnnee] = useState(false);
  const [formAnnee, setFormAnnee] = useState({ libelle: '' });
  const [selectedAnnee, setSelectedAnnee] = useState(null);
  const [contenuAnnee, setContenuAnnee] = useState(null);
  const [aBasculer, setABasculer] = useState(null);
  const [contenuCible, setContenuCible] = useState(null);
  const [contenuActuelle, setContenuActuelle] = useState(null);
  const [confirmation, setConfirmation] = useState('');

  // Trimestre
  const [openTrimestre, setOpenTrimestre] = useState(false);
  const [suspendTrimestreOpen, setSuspendTrimestreOpen] = useState(false);
  const [formTrimestre, setFormTrimestre] = useState({ annee_scolaire: '', nom: '' });
  const [selectedTrimestre, setSelectedTrimestre] = useState(null);
  const [contenuTrimestre, setContenuTrimestre] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resA, resT] = await Promise.all([anneeService.getAll(), trimestreService.getAll('?annee_id=all')]);
      const liste = [...resA.data].sort((a, b) => b.libelle.localeCompare(a.libelle));
      setAnnees(liste);
      setTrimestres(resT.data);
      setAnneeVue((prev) => (prev && liste.some((a) => a.id === prev) ? prev : (liste.find((a) => a.etat === 'EN_COURS') || liste[0])?.id ?? null));
    } catch {
      setError('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const ok = (msg) => { setSuccess(msg); fetchData(); setTimeout(() => setSuccess(''), 7000); };
  const lire = (url, set) => { set(null); api.get(url).then((r) => set(r.data)).catch(() => set({})); };
  const enCours = annees.find((a) => a.etat === 'EN_COURS');

  // ── Années scolaires ──
  const ouvrirAnnee = (a) => {
    setErreurDialogue(''); setSelectedAnnee(a); setFormAnnee({ libelle: a ? a.libelle : libelleSuivant(annees[0]?.libelle) });
    if (a) lire(`/annees/${a.id}/contenu/`, setContenuAnnee); else setContenuAnnee(null);
    setOpenAnnee(true);
  };
  const libelleVerrouille = !!selectedAnnee && contenuAnnee && (contenuAnnee.inscriptions > 0 || contenuAnnee.notes > 0);
  const libelleSaisi = formAnnee.libelle.trim();
  const nonConsecutive = !selectedAnnee && enCours && libelleSaisi && libelleSaisi !== libelleSuivant(enCours.libelle)
    && /^\d{4}-\d{4}$/.test(libelleSaisi) && !annees.some((a) => a.libelle === libelleSaisi);

  const handleSaveAnnee = async () => {
    setErreurDialogue(''); setEnvoi(true);
    try {
      if (selectedAnnee) await anneeService.patch(selectedAnnee.id, { libelle: libelleSaisi });
      else await anneeService.create({ libelle: libelleSaisi });
      setOpenAnnee(false);
      ok(selectedAnnee ? `Année renommée en ${libelleSaisi}.`
        : `Année ${libelleSaisi} créée avec ses trimestres 1, 2 et 3. Elle n'est pas l'année en cours : l'école continue sur ${enCours?.libelle || 'l’année actuelle'}.`);
    } catch (e) { setErreurDialogue(erreurApi(e, "Impossible d'enregistrer l'année.")); }
    finally { setEnvoi(false); }
  };

  const ouvrirBascule = (a) => {
    setErreurDialogue(''); setConfirmation(''); setABasculer(a);
    lire(`/annees/${a.id}/contenu/`, setContenuCible);
    if (enCours) lire(`/annees/${enCours.id}/contenu/`, setContenuActuelle); else setContenuActuelle({});
  };

  const definirEnCours = async () => {
    setErreurDialogue(''); setEnvoi(true);
    try {
      await api.post(`/annees/${aBasculer.id}/en-cours/`, { confirmation: confirmation.trim() });
      setABasculer(null);
      ok(`${aBasculer.libelle} est maintenant l'année en cours. Rechargez la page (Ctrl+Maj+R) pour que tous les écrans suivent.`);
    } catch (e) { setErreurDialogue(erreurApi(e, "Impossible de changer l'année en cours.")); }
    finally { setEnvoi(false); }
  };

  // ── Trimestres ──
  const trimestresDe = (anneeId) => trimestres.filter((t) => t.annee_scolaire === anneeId);
  const nomsLibres = (anneeId, sauf) => NOMS_TRIMESTRES.filter((n) => !trimestresDe(anneeId).some((t) => t.id !== sauf?.id && numero(t.nom) === numero(n)));

  const ouvrirTrimestre = (t) => {
    setErreurDialogue(''); setSelectedTrimestre(t);
    if (t) { setFormTrimestre({ annee_scolaire: t.annee_scolaire, nom: t.nom }); lire(`/trimestres/${t.id}/contenu/`, setContenuTrimestre); }
    else { setFormTrimestre({ annee_scolaire: anneeVue || '', nom: nomsLibres(anneeVue)[0] || '' }); setContenuTrimestre(null); }
    setOpenTrimestre(true);
  };
  const trimestreVerrouille = !!selectedTrimestre && contenuTrimestre && contenuTrimestre.evaluations > 0;

  const handleSaveTrimestre = async () => {
    setErreurDialogue(''); setEnvoi(true);
    try {
      if (selectedTrimestre) await trimestreService.patch(selectedTrimestre.id, { annee_scolaire: formTrimestre.annee_scolaire, nom: formTrimestre.nom });
      else await trimestreService.create({ annee_scolaire: formTrimestre.annee_scolaire, nom: formTrimestre.nom });
      setOpenTrimestre(false);
      ok('Trimestre enregistré.');
    } catch (e) { setErreurDialogue(erreurApi(e, "Impossible d'enregistrer le trimestre.")); }
    finally { setEnvoi(false); }
  };

  const ouvrirSuspension = (t) => {
    setErreurDialogue(''); setSelectedTrimestre(t);
    lire(`/trimestres/${t.id}/contenu/`, setContenuTrimestre);
    setSuspendTrimestreOpen(true);
  };
  const handleToggleTrimestre = async () => {
    setErreurDialogue(''); setEnvoi(true);
    try {
      await trimestreService.patch(selectedTrimestre.id, { is_active: !selectedTrimestre.is_active });
      setSuspendTrimestreOpen(false);
      ok(selectedTrimestre.is_active ? 'Trimestre suspendu.' : 'Trimestre réactivé.');
    } catch (e) { setErreurDialogue(erreurApi(e, 'Modification impossible.')); }
    finally { setEnvoi(false); }
  };

  const vue = annees.find((a) => a.id === anneeVue);
  const trimestresVus = trimestresDe(anneeVue).sort((a, b) => numero(a.nom) - numero(b.nom));
  const cibleEnArriere = aBasculer && enCours && aBasculer.libelle < enCours.libelle;

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={1} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Gestion de l&apos;Année Scolaire</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Une seule année est en cours à la fois : c&apos;est celle que toute l&apos;école utilise (classes, inscriptions, notes, caisse).
        Les autres années restent consultables, rien n&apos;est supprimé. Chaque action vous montre d&apos;abord ce qu&apos;elle touche.
      </Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {!loading && !enCours && annees.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>Aucune année n&apos;est définie comme année en cours : choisissez-en une ci-dessous.</Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={3}>

          {/* ── Années scolaires ── */}
          <Grid size={12}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" mb={2} gap={1} flexWrap="wrap">
                  <Typography variant="h6">Années Scolaires</Typography>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => ouvrirAnnee(null)}>Nouvelle Année</Button>
                </Box>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'grey.100' }}>
                      <TableRow>
                        <TableCell><strong>Libellé</strong></TableCell>
                        <TableCell><strong>Statut</strong></TableCell>
                        <TableCell><strong>Trimestres</strong></TableCell>
                        <TableCell align="right"><strong>Actions</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {annees.length === 0 ? (
                        <TableRow><TableCell colSpan={4} align="center">Aucune année scolaire</TableCell></TableRow>
                      ) : annees.map(a => {
                        const etat = ETATS[a.etat] || ETATS.TERMINEE;
                        return (
                          <TableRow key={a.id} hover sx={{ bgcolor: a.etat === 'EN_COURS' ? 'primary.lighter' : 'inherit' }}>
                            <TableCell><strong>{a.libelle}</strong></TableCell>
                            <TableCell><Chip size="small" label={etat.label} color={etat.color} variant={etat.variant} sx={{ fontWeight: 700 }} /></TableCell>
                            <TableCell>{a.nb_trimestres}</TableCell>
                            <TableCell align="right">
                              <Box display="flex" gap={0.5} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
                                {a.etat !== 'EN_COURS' && (
                                  <Button size="small" startIcon={<CheckCircleIcon />} onClick={() => ouvrirBascule(a)} sx={{ textTransform: 'none' }}>
                                    Définir comme année en cours
                                  </Button>
                                )}
                                <Tooltip title="Modifier le libellé">
                                  <IconButton size="small" color="primary" onClick={() => ouvrirAnnee(a)}><EditIcon fontSize="small" /></IconButton>
                                </Tooltip>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* ── Trimestres : rangés sous leur année, jamais mélangés ── */}
          <Grid size={12}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" mb={1} gap={1} flexWrap="wrap">
                  <Typography variant="h6">Trimestres{vue ? ` de l'année ${vue.libelle}` : ''}</Typography>
                  <Button variant="contained" color="secondary" startIcon={<AddIcon />} disabled={!anneeVue || nomsLibres(anneeVue).length === 0}
                    onClick={() => ouvrirTrimestre(null)}>
                    Nouveau Trimestre
                  </Button>
                </Box>
                {annees.length > 0 && (
                  <Tabs value={anneeVue || false} onChange={(_, v) => setAnneeVue(v)} variant="scrollable" scrollButtons="auto"
                    sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    {annees.map((a) => (
                      <Tab key={a.id} value={a.id} sx={{ textTransform: 'none', fontWeight: 700 }}
                        label={a.etat === 'EN_COURS' ? `${a.libelle} (en cours)` : a.libelle} />
                    ))}
                  </Tabs>
                )}
                {anneeVue && nomsLibres(anneeVue).length === 0 && (
                  <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                    Les trois trimestres de cette année existent déjà.
                  </Typography>
                )}
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'grey.100' }}>
                      <TableRow>
                        <TableCell><strong>Trimestre</strong></TableCell>
                        <TableCell><strong>Statut</strong></TableCell>
                        <TableCell align="right"><strong>Actions</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {trimestresVus.length === 0 ? (
                        <TableRow><TableCell colSpan={3} align="center">Aucun trimestre pour cette année</TableCell></TableRow>
                      ) : trimestresVus.map(t => (
                        <TableRow key={t.id} hover sx={{ opacity: t.is_active ? 1 : 0.6, bgcolor: t.is_active ? 'inherit' : '#fff8e1' }}>
                          <TableCell><strong>{t.nom}</strong></TableCell>
                          <TableCell>
                            <Chip size="small" label={t.is_active ? 'Actif' : 'Suspendu'} color={t.is_active ? 'success' : 'default'}
                              variant={t.is_active ? 'filled' : 'outlined'} />
                          </TableCell>
                          <TableCell align="right">
                            <Box display="flex" gap={0.5} justifyContent="flex-end">
                              <Tooltip title="Modifier">
                                <IconButton size="small" color="primary" onClick={() => ouvrirTrimestre(t)}><EditIcon fontSize="small" /></IconButton>
                              </Tooltip>
                              <Tooltip title={t.is_active ? 'Suspendre' : 'Réactiver'}>
                                <IconButton size="small" color={t.is_active ? 'warning' : 'success'} onClick={() => ouvrirSuspension(t)}>
                                  {t.is_active ? <PauseCircleIcon fontSize="small" /> : <PlayCircleIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ── Année : créer / modifier ── */}
      <Dialog open={openAnnee} onClose={() => setOpenAnnee(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{selectedAnnee ? `Modifier l'année ${selectedAnnee.libelle}` : 'Ajouter une année scolaire'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {erreurDialogue && <Alert severity="error" sx={{ mb: 2 }}>{erreurDialogue}</Alert>}
          {selectedAnnee && <Contenu c={contenuAnnee} titre="Cette année contient :" />}
          {libelleVerrouille ? (
            <Alert severity="info">
              Cette année contient déjà des inscriptions ou des notes : son libellé ne peut plus changer.
              Les bulletins, les reçus et les historiques des élèves y font référence.
            </Alert>
          ) : (
            <>
              {!selectedAnnee && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  La nouvelle année est créée avec ses trimestres 1, 2 et 3. Elle <strong>ne devient pas</strong> l&apos;année en cours :
                  l&apos;école continue de travailler sur {enCours ? <strong>{enCours.libelle}</strong> : 'l’année actuelle'} jusqu&apos;à ce que
                  vous décidiez de passer à la nouvelle. En général, le passage d&apos;année la prépare déjà pour vous.
                </Alert>
              )}
              <TextField label="Libellé" fullWidth value={formAnnee.libelle} autoFocus sx={{ mt: 1 }}
                onChange={e => setFormAnnee({ libelle: e.target.value })} placeholder="2027-2028"
                helperText="Deux années qui se suivent, ex. 2027-2028." />
              {nonConsecutive && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  L&apos;année qui suit l&apos;année en cours ({enCours.libelle}) est <strong>{libelleSuivant(enCours.libelle)}</strong>.
                  Vérifiez que {libelleSaisi} est bien l&apos;année voulue.
                </Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenAnnee(false)} color="inherit">{libelleVerrouille ? 'Fermer' : 'Annuler'}</Button>
          {!libelleVerrouille && (
            <Button variant="contained" onClick={handleSaveAnnee} disabled={envoi || !libelleSaisi || (selectedAnnee && !contenuAnnee)}>
              Enregistrer
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Année : définir comme année en cours ── */}
      <Dialog open={!!aBasculer} onClose={() => setABasculer(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Passer à l&apos;année {aBasculer?.libelle} ?</DialogTitle>
        <DialogContent>
          {erreurDialogue && <Alert severity="error" sx={{ mb: 2 }}>{erreurDialogue}</Alert>}
          <Typography mb={1.5}>
            <strong>{aBasculer?.libelle}</strong> deviendra l&apos;année en cours de toute l&apos;école, à la place de{' '}
            <strong>{enCours?.libelle || 'aucune'}</strong>.
          </Typography>
          {enCours && <Contenu c={contenuActuelle} titre={`Année en cours aujourd'hui (${enCours.libelle}) :`} />}
          <Contenu c={contenuCible} titre={`Année ${aBasculer?.libelle || ''} :`} />
          {cibleEnArriere && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              Attention : {aBasculer.libelle} est une année <strong>terminée</strong>. Revenir en arrière n&apos;est utile que pour corriger
              une erreur : les enseignants, les élèves et la caisse travailleraient de nouveau sur cette ancienne année.
            </Alert>
          )}
          {contenuCible && contenuCible.inscriptions === 0 && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              Aucun élève n&apos;est encore inscrit en {aBasculer?.libelle} : les classes seraient vides.
              Faites d&apos;abord le <strong>passage d&apos;année</strong> (menu Configuration) ou inscrivez les élèves.
            </Alert>
          )}
          <Alert severity="warning" sx={{ mb: 2 }}>
            Tout l&apos;établissement bascule sur cette année : classes, inscriptions, notes, bulletins et caisse affichés par défaut.
            Les données de {enCours?.libelle || 'l’ancienne année'} sont conservées et restent consultables. À faire à la rentrée,
            une fois le passage d&apos;année terminé.
          </Alert>
          <TextField fullWidth size="small" value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
            label={`Pour confirmer, écrivez ${aBasculer?.libelle || ''}`} placeholder={aBasculer?.libelle} />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setABasculer(null)} color="inherit">Annuler</Button>
          <Button variant="contained" color={cibleEnArriere ? 'error' : 'primary'} onClick={definirEnCours}
            disabled={envoi || confirmation.trim() !== aBasculer?.libelle}>
            Définir comme année en cours
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Trimestre : créer / modifier ── */}
      <Dialog open={openTrimestre} onClose={() => setOpenTrimestre(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>{selectedTrimestre ? `Modifier ${selectedTrimestre.nom} (${selectedTrimestre.annee_libelle})` : 'Ajouter un trimestre'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {erreurDialogue && <Alert severity="error" sx={{ mb: 2 }}>{erreurDialogue}</Alert>}
          {selectedTrimestre && <Contenu c={contenuTrimestre} titre="Ce trimestre contient :" />}
          {trimestreVerrouille ? (
            <Alert severity="info">
              Ce trimestre contient déjà des évaluations : son nom et son année ne peuvent plus changer.
              Le calcul des moyennes et des bulletins en dépend.
            </Alert>
          ) : (
            <Box display="flex" flexDirection="column" gap={2} sx={{ mt: 1 }}>
              <TextField select label="Année scolaire" fullWidth value={formTrimestre.annee_scolaire}
                onChange={e => setFormTrimestre({ annee_scolaire: e.target.value, nom: nomsLibres(e.target.value, selectedTrimestre)[0] || '' })}>
                {annees.map(a => <MenuItem key={a.id} value={a.id}>{a.libelle}{a.etat === 'EN_COURS' ? ' (en cours)' : ''}</MenuItem>)}
              </TextField>
              <TextField select label="Trimestre" fullWidth value={formTrimestre.nom}
                onChange={e => setFormTrimestre({ ...formTrimestre, nom: e.target.value })}
                helperText="Chaque année a au plus un Trimestre 1, un Trimestre 2 et un Trimestre 3.">
                {nomsLibres(formTrimestre.annee_scolaire, selectedTrimestre).map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
              </TextField>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenTrimestre(false)} color="inherit">{trimestreVerrouille ? 'Fermer' : 'Annuler'}</Button>
          {!trimestreVerrouille && (
            <Button variant="contained" onClick={handleSaveTrimestre}
              disabled={envoi || !formTrimestre.annee_scolaire || !formTrimestre.nom || (selectedTrimestre && !contenuTrimestre)}>
              Enregistrer
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Trimestre : suspendre / réactiver ── */}
      <Dialog open={suspendTrimestreOpen} onClose={() => setSuspendTrimestreOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selectedTrimestre?.is_active ? 'Suspendre' : 'Réactiver'} {selectedTrimestre?.nom} ({selectedTrimestre?.annee_libelle})
        </DialogTitle>
        <DialogContent>
          {erreurDialogue && <Alert severity="error" sx={{ mb: 2 }}>{erreurDialogue}</Alert>}
          <Contenu c={contenuTrimestre} titre="Ce trimestre contient :" />
          {selectedTrimestre?.is_active ? (
            contenuTrimestre && contenuTrimestre.evaluations > 0 ? (
              <Alert severity="error">
                Impossible : ce trimestre contient des évaluations et des notes. Le suspendre les ferait disparaître des bulletins.
              </Alert>
            ) : (
              <Alert severity="warning">
                Le trimestre ne sera plus proposé dans les listes (devoirs, notes, bulletins). À n&apos;utiliser que pour un trimestre
                créé par erreur. Vous pourrez le réactiver.
              </Alert>
            )
          ) : (
            <Alert severity="info">Le trimestre sera de nouveau proposé dans les listes.</Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSuspendTrimestreOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" color={selectedTrimestre?.is_active ? 'warning' : 'success'} onClick={handleToggleTrimestre}
            disabled={envoi || !contenuTrimestre || (selectedTrimestre?.is_active && contenuTrimestre.evaluations > 0)}>
            {selectedTrimestre?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
