import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, LinearProgress, MenuItem, Paper, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PaymentsIcon from '@mui/icons-material/Payments';
import CartesFinances, { fcfa } from 'components/CartesFinances';
import MaSignature from 'components/MaSignature';
import PrintIcon from '@mui/icons-material/Print';
import { depenseService, paiementService, parametresService, getResults } from 'services/api';
import { imprimerJournal } from 'utils/printJournal';
import { imprimerDepense } from 'utils/printDepense';
import authService from 'services/auth';
import { peutSaisir } from 'utils/droits';

const CATEGORIES = [
  ['SALAIRES', 'Salaires et primes'], ['FOURNITURES', 'Fournitures et matériel'], ['FACTURES', 'Eau, électricité, internet'],
  ['ENTRETIEN', 'Entretien et réparations'], ['TRANSPORT', 'Transport'], ['EVENEMENT', 'Événements et activités'], ['AUTRE', 'Autre'],
];
const MODES = [['ESPECES', 'Espèces'], ['MOBILE', 'Mobile money'], ['VIREMENT', 'Virement'], ['CHEQUE', 'Chèque']];
const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const VIDE = { libelle: '', categorie: 'FOURNITURES', montant: '', date_depense: aujourdhui(), mode: 'ESPECES', beneficiaire: '', commentaire: '' };
const dateFr = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR') : '—');
const libelleMois = (m) => { const [a, n] = m.split('-'); return `${MOIS[Number(n) - 1]} ${a}`; };

export default function FinancesEcole() {
  const saisie = peutSaisir('caisse');
  const [onglet, setOnglet] = useState(0);
  const [bilan, setBilan] = useState(null);
  const [depenses, setDepenses] = useState([]);
  const [entrees, setEntrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [form, setForm] = useState(VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [journalOuvert, setJournalOuvert] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [jourChoisi, setJourChoisi] = useState(aujourdhui());
  const [journal, setJournal] = useState(null);
  const [journalChargement, setJournalChargement] = useState(false);

  const chargerJournal = useCallback(async (jour) => {
    setJournalChargement(true);
    try {
      const res = await depenseService.journal(jour);
      setJournal(res.data);
    } catch (err) {
      setErreur(err.response?.data?.detail || 'Impossible de charger le journal.');
    } finally {
      setJournalChargement(false);
    }
  }, []);

  useEffect(() => { if (journalOuvert) chargerJournal(jourChoisi); }, [journalOuvert, jourChoisi, chargerJournal]);

  const imprimerRecuDepense = async (d, duplicata = true) => {
    let ecole = {};
    try { ecole = (await parametresService.get()).data || {}; } catch { /* nom par défaut */ }
    imprimerDepense(d, ecole, { duplicata });
  };

  const imprimerLeJournal = async () => {
    let ecole = {};
    try { ecole = (await parametresService.get()).data || {}; } catch { /* nom par défaut */ }
    imprimerJournal(journal, ecole, authService.getUsername?.() || '');
  };

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const [b, d, p] = await Promise.all([depenseService.bilan(), depenseService.getAll(), paiementService.getAll()]);
      setBilan(b.data);
      setDepenses(getResults(d).items);
      setEntrees(getResults(p).items);
    } catch (err) {
      setErreur(err.response?.data?.detail || 'Impossible de charger les finances.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const enregistrer = async () => {
    if (!form.libelle.trim() || !Number(form.montant)) {
      setErreur('Indiquez le motif et un montant supérieur à 0.');
      return;
    }
    setEnvoi(true);
    setErreur('');
    try {
      const res = await depenseService.create({ ...form, libelle: form.libelle.trim(), montant: Number(form.montant) });
      setOuvert(false);
      setForm(VIDE);
      setSucces({ texte: `Dépense enregistrée — pièce ${res.data.numero}.`, depense: res.data });
      await charger();
    } catch (err) {
      const d = err.response?.data;
      setErreur(d?.detail || (d && Object.values(d).flat().join(' ')) || "Impossible d'enregistrer la dépense.");
    } finally {
      setEnvoi(false);
    }
  };

  const annuler = async (d) => {
    if (!window.confirm(`Annuler la dépense « ${d.libelle} » (${fcfa(d.montant)}) ?`)) return;
    try {
      await depenseService.remove(d.id);
      setSucces('Dépense annulée.');
      await charger();
    } catch (err) {
      setErreur(err.response?.data?.detail || "Impossible d'annuler la dépense.");
    }
  };

  // du plus ancien au plus récent pour cumuler ce qui reste en caisse, puis affichage du plus récent au plus ancien
  const lignesMois = (() => {
    let cumul = 0;
    return (bilan?.par_mois || []).map((l) => {
      cumul += l.entrees - l.sorties;
      return { ...l, cumul };
    }).reverse();
  })();
  const montantOuTiret = (n, couleur) => (n ? <span style={{ color: couleur, fontWeight: 600 }}>{fcfa(n)}</span> : <span style={{ color: '#9e9e9e' }}>—</span>);
  const signe = (n) => `${n > 0 ? '+ ' : n < 0 ? '- ' : ''}${fcfa(Math.abs(n))}`;
  const couleurSolde = (n) => (n > 0 ? 'success.main' : n < 0 ? 'error.main' : 'text.secondary');
  const part = (total, valeur) => (total ? Math.round((valeur * 100) / total) : 0);

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} mb={2}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <PaymentsIcon sx={{ color: 'primary.main', fontSize: 30 }} />
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Finances de l’école</Typography>
        </Box>
        <Box display="flex" gap={1} flexWrap="wrap">
          {saisie && <Button variant="text" onClick={() => setSignatureOpen(true)}>Ma signature</Button>}
          {saisie && (
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => { setJourChoisi(aujourdhui()); setJournalOuvert(true); }}>
              Journal de caisse
            </Button>
          )}
          {saisie && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm(VIDE); setOuvert(true); }}>
              Noter une dépense
            </Button>
          )}
        </Box>
      </Box>

      {succes && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}
          action={succes.depense && (
            <Button color="inherit" size="small" startIcon={<PrintIcon />} onClick={() => imprimerRecuDepense(succes.depense, false)}>
              Imprimer le reçu
            </Button>
          )}>
          {succes.texte || succes}
        </Alert>
      )}
      {erreur && !ouvert && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}

      <CartesFinances bilan={bilan} loading={loading} />

      <Card sx={{ borderRadius: 3 }}>
        <Tabs value={onglet} onChange={(_, v) => setOnglet(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          <Tab label="Bilan par mois" />
          <Tab label={`Sorties (${depenses.length})`} />
          <Tab label={`Entrées (${entrees.length})`} />
        </Tabs>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          {loading && <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>}

          {!loading && onglet === 0 && (
            <>
              <Alert severity="info" icon={false} sx={{ mb: 2, py: 0.5 }}>
                <strong>Comment lire ce tableau :</strong> « Reçu » = scolarité payée par les parents · « Dépensé » = achats et
                paiements de l’école · « Différence » = reçu − dépensé pour le mois · « Total en caisse » = tout ce qui reste depuis le début de l’année.
              </Alert>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small" sx={{ '& td, & th': { py: 1.1 } }}>
                  <TableHead sx={{ bgcolor: 'grey.100' }}>
                    <TableRow>
                      <TableCell>Mois</TableCell>
                      <TableCell align="right"><Box sx={{ color: 'success.main', fontWeight: 700 }}>Reçu</Box><Typography variant="caption" color="text.secondary">argent entré</Typography></TableCell>
                      <TableCell align="right"><Box sx={{ color: 'error.main', fontWeight: 700 }}>Dépensé</Box><Typography variant="caption" color="text.secondary">argent sorti</Typography></TableCell>
                      <TableCell align="right"><Box sx={{ fontWeight: 700 }}>Différence</Box><Typography variant="caption" color="text.secondary">du mois</Typography></TableCell>
                      <TableCell align="right"><Box sx={{ fontWeight: 700 }}>Total en caisse</Box><Typography variant="caption" color="text.secondary">depuis le début</Typography></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lignesMois.length === 0 && <TableRow><TableCell colSpan={5} align="center">Aucun mouvement pour l’instant.</TableCell></TableRow>}
                    {lignesMois.map((l) => (
                      <TableRow key={l.mois} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{libelleMois(l.mois)}</TableCell>
                        <TableCell align="right">{montantOuTiret(l.entrees, '#2e7d32')}</TableCell>
                        <TableCell align="right">{montantOuTiret(l.sorties, '#c62828')}</TableCell>
                        <TableCell align="right" sx={{ color: couleurSolde(l.entrees - l.sorties), fontWeight: 700 }}>{signe(l.entrees - l.sorties)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{fcfa(l.cumul)}</TableCell>
                      </TableRow>
                    ))}
                    {lignesMois.length > 0 && (
                      <TableRow sx={{ bgcolor: 'grey.50', '& td': { borderTop: '2px solid', borderColor: 'divider' } }}>
                        <TableCell sx={{ fontWeight: 800 }}>Total de l’année</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: 'success.main' }}>{fcfa(bilan.entrees)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: 'error.main' }}>{fcfa(bilan.sorties)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: couleurSolde(bilan.solde) }}>{signe(bilan.solde)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>{fcfa(bilan.solde)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mt: 3 }}>
                {[
                  {
                    titre: 'Dépenses par catégorie', aide: 'Pour quoi l’école a dépensé', vide: 'Aucune dépense pour l’instant.',
                    lignes: (bilan?.depenses_par_categorie || []).map((c) => ({ cle: c.categorie, libelle: c.libelle, total: c.total })),
                    total: bilan?.sorties || 0, couleur: 'error',
                  },
                  {
                    titre: 'Paiements des parents par mode', aide: 'Comment les parents ont payé', vide: 'Aucun encaissement pour l’instant.',
                    lignes: (bilan?.entrees_par_mode || []).map((m) => ({ cle: m.mode, libelle: m.libelle, total: m.total })),
                    total: bilan?.entrees || 0, couleur: 'success',
                  },
                ].map((bloc) => (
                  <Box key={bloc.titre}>
                    <Typography fontWeight={700}>{bloc.titre}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block" mb={1}>{bloc.aide}</Typography>
                    {bloc.lignes.length === 0 && <Typography variant="body2" color="text.secondary">{bloc.vide}</Typography>}
                    {bloc.lignes.map((l) => (
                      <Box key={l.cle} sx={{ mb: 1.25 }}>
                        <Box display="flex" justifyContent="space-between" alignItems="baseline" gap={1}>
                          <Typography variant="body2">{l.libelle}</Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {fcfa(l.total)} <span style={{ color: '#757575', fontWeight: 400 }}>({part(bloc.total, l.total)} %)</span>
                          </Typography>
                        </Box>
                        <LinearProgress variant="determinate" value={part(bloc.total, l.total)} color={bloc.couleur}
                          sx={{ height: 6, borderRadius: 3, mt: 0.5, bgcolor: 'action.hover' }} />
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            </>
          )}

          {!loading && onglet === 1 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: 'grey.100' }}>
                  <TableRow>
                    <TableCell>Pièce</TableCell><TableCell>Date</TableCell><TableCell>Motif</TableCell><TableCell>Catégorie</TableCell><TableCell>Payé à</TableCell>
                    <TableCell>Mode</TableCell><TableCell align="right">Montant</TableCell><TableCell>Saisi par</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {depenses.length === 0 && <TableRow><TableCell colSpan={9} align="center">Aucune dépense notée.</TableCell></TableRow>}
                  {depenses.map((d) => (
                    <TableRow key={d.id} hover>
                      <TableCell>{d.numero || '—'}</TableCell>
                      <TableCell>{dateFr(d.date_depense)}</TableCell>
                      <TableCell>
                        {d.libelle}
                        {d.commentaire ? <Typography variant="caption" display="block" color="text.secondary">{d.commentaire}</Typography> : null}
                      </TableCell>
                      <TableCell><Chip size="small" label={d.categorie_libelle} /></TableCell>
                      <TableCell>{d.beneficiaire || '—'}</TableCell>
                      <TableCell>{d.mode_libelle}</TableCell>
                      <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>- {fcfa(d.montant)}</TableCell>
                      <TableCell>{d.saisi_par_nom || '—'}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Imprimer le reçu de dépense">
                          <IconButton size="small" onClick={() => imprimerRecuDepense(d)}><PrintIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        {saisie && (
                          <Tooltip title="Annuler cette dépense">
                            <IconButton size="small" color="error" onClick={() => annuler(d)}><DeleteIcon fontSize="small" /></IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {!loading && onglet === 2 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: 'grey.100' }}>
                  <TableRow>
                    <TableCell>Date</TableCell><TableCell>Reçu</TableCell><TableCell>Élève</TableCell><TableCell>Classe</TableCell><TableCell>Versement</TableCell>
                    <TableCell>Mode</TableCell><TableCell align="right">Montant</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entrees.length === 0 && <TableRow><TableCell colSpan={7} align="center">Aucun encaissement.</TableCell></TableRow>}
                  {entrees.map((p) => (
                    <TableRow key={p.id} hover>
                      <TableCell>{dateFr(p.date_paiement)}</TableCell>
                      <TableCell>{p.numero_recu}</TableCell>
                      <TableCell>{p.eleve_prenom} {p.eleve_nom}</TableCell>
                      <TableCell>{p.classe_nom || '—'}</TableCell>
                      <TableCell>{p.versement_libelle || '—'}</TableCell>
                      <TableCell>{p.mode_libelle}</TableCell>
                      <TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>+ {fcfa(p.montant)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <MaSignature open={signatureOpen} onClose={() => setSignatureOpen(false)} />

      <Dialog open={journalOuvert} onClose={() => setJournalOuvert(false)} fullWidth maxWidth="md">
        <DialogTitle>Journal de caisse</DialogTitle>
        <DialogContent>
          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap" mb={2} mt={0.5}>
            <TextField size="small" type="date" label="Jour" value={jourChoisi} InputLabelProps={{ shrink: true }}
              inputProps={{ max: aujourdhui() }} onChange={(e) => e.target.value && setJourChoisi(e.target.value)} />
            <Typography variant="body2" color="text.secondary">Tous les encaissements et toutes les dépenses de ce jour, à imprimer et faire viser.</Typography>
          </Box>
          {journalChargement && <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>}
          {!journalChargement && journal && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, mb: 2 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'success.main', color: 'white' }}><Typography variant="caption">Entrées</Typography><Typography variant="h6" fontWeight={800}>{fcfa(journal.total_entrees)}</Typography></Box>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'error.main', color: 'white' }}><Typography variant="caption">Sorties</Typography><Typography variant="h6" fontWeight={800}>{fcfa(journal.total_sorties)}</Typography></Box>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'primary.main', color: 'white' }}><Typography variant="caption">Résultat du jour</Typography><Typography variant="h6" fontWeight={800}>{fcfa(journal.solde)}</Typography></Box>
              </Box>
              {journal.entrees_par_mode.length > 0 && (
                <Typography variant="body2" mb={1}>
                  Par mode : {journal.entrees_par_mode.map((m) => `${m.libelle} ${fcfa(m.total)}`).join(' · ')}
                </Typography>
              )}
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320 }}>
                <Table size="small" stickyHeader>
                  <TableHead><TableRow><TableCell>Type</TableCell><TableCell>Détail</TableCell><TableCell>Mode</TableCell><TableCell align="right">Montant</TableCell></TableRow></TableHead>
                  <TableBody>
                    {journal.entrees.length + journal.sorties.length === 0 && <TableRow><TableCell colSpan={4} align="center">Aucun mouvement ce jour.</TableCell></TableRow>}
                    {journal.entrees.map((p) => (
                      <TableRow key={`e${p.id}`}>
                        <TableCell sx={{ color: 'success.main', fontWeight: 700 }}>Entrée</TableCell>
                        <TableCell>{p.numero_recu} · {p.eleve_prenom} {p.eleve_nom} ({p.classe_nom}) · {p.versement_libelle}</TableCell>
                        <TableCell>{p.mode_libelle}{p.commentaire ? ` — ${p.commentaire}` : ''}</TableCell>
                        <TableCell align="right">+ {fcfa(p.montant)}</TableCell>
                      </TableRow>
                    ))}
                    {journal.sorties.map((d) => (
                      <TableRow key={`s${d.id}`}>
                        <TableCell sx={{ color: 'error.main', fontWeight: 700 }}>Sortie</TableCell>
                        <TableCell>{d.libelle}{d.beneficiaire ? ` · ${d.beneficiaire}` : ''} ({d.categorie_libelle})</TableCell>
                        <TableCell>{d.mode_libelle}</TableCell>
                        <TableCell align="right">- {fcfa(d.montant)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJournalOuvert(false)}>Fermer</Button>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={imprimerLeJournal} disabled={!journal || journalChargement}>Imprimer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={ouvert} onClose={() => !envoi && setOuvert(false)} fullWidth maxWidth="sm">
        <DialogTitle>Noter une dépense</DialogTitle>
        <DialogContent>
          {erreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField size="small" label="Motif de la dépense" placeholder="Ex. Achat de craies et cahiers" value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value })} inputProps={{ maxLength: 160 }} autoFocus />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField size="small" type="number" label="Montant (F)" value={form.montant} inputProps={{ min: 0 }}
                onChange={(e) => setForm({ ...form, montant: e.target.value })} />
              <TextField size="small" type="date" label="Date (aujourd’hui)" value={form.date_depense} InputLabelProps={{ shrink: true }}
                disabled helperText="Non modifiable" />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField select size="small" label="Catégorie" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}>
                {CATEGORIES.map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Payé par" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                {MODES.map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
            </Box>
            <TextField size="small" label="Payé à (fournisseur, personne) — facultatif" value={form.beneficiaire}
              onChange={(e) => setForm({ ...form, beneficiaire: e.target.value })} inputProps={{ maxLength: 120 }} />
            <TextField size="small" label="Remarque — facultatif" value={form.commentaire}
              onChange={(e) => setForm({ ...form, commentaire: e.target.value })} inputProps={{ maxLength: 200 }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOuvert(false)} disabled={envoi}>Annuler</Button>
          <Button variant="contained" onClick={enregistrer} disabled={envoi}>Enregistrer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
