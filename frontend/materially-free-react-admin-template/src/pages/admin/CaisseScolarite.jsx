import { useEffect, useState } from 'react';
import {
  tarifService, dossierService, niveauService, classeService, anneeService,
  parametresService, getResults
} from 'services/api';
import {
  Box, Typography, Grid, Card, CardContent, Button, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, Chip, CircularProgress, InputAdornment,
  Snackbar, LinearProgress, IconButton, Tooltip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PaymentsIcon from '@mui/icons-material/Payments';
import CampaignIcon from '@mui/icons-material/Campaign';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PrintIcon from '@mui/icons-material/Print';
import DrawIcon from '@mui/icons-material/Draw';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VerifiedIcon from '@mui/icons-material/Verified';
import useIsMobile from 'hooks/useIsMobile';
import MaSignature from 'components/MaSignature';
import { imprimerRecu, formatDateFr, francsEnLettres } from 'utils/printRecu';
import { readThrough, CacheKeys, NEVER_CACHED_MSG, cacheSet, cacheGet } from 'offline/cacheStore';
import { sendOrQueue, QUEUED_MSG, RECU_PENDING_MSG } from 'offline/syncManager';
import { useIsOnline } from 'offline/RequireOnline';

import { estEnLigne } from 'offline/reseau';
import { peutSaisir } from 'utils/droits';
const STATUT_COLOR = { SOLDE: 'success', PARTIEL: 'warning', IMPAYE: 'error' };
const LIBELLE_MODE = { ESPECES: 'Espèces', MOBILE: 'Mobile money', VIREMENT: 'Virement', CHEQUE: 'Chèque' };
const fmt = (n) => `${Number(n || 0).toLocaleString('fr-FR')} F`;
const MSG_RELANCE_OK = 'Rappel envoyé au parent (visible dans Messages).';
const MSG_RELANCE_NO_PARENT = 'Aucun parent lié à cet élève';

function dedupeDossiers(list) {
  const ranked = [...list].sort((a, b) => {
    const rank = (d) => (d.statut === 'SOLDE' ? 0 : 1);
    return rank(b) - rank(a) || Number(b.reste || 0) - Number(a.reste || 0) || (b.id - a.id);
  });
  const seen = new Set();
  const out = [];
  ranked.forEach((d) => {
    const key = `${(d.eleve_nom || '').trim().toLowerCase()}|${(d.eleve_prenom || '').trim().toLowerCase()}|${d.classe_nom || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(d);
  });
  return out;
}

export default function CaisseScolarite() {
  const saisie = peutSaisir('caisse'); // le directeur consulte, le comptable encaisse
  const isMobile = useIsMobile();
  const online = useIsOnline();
  const [tab, setTab] = useState(0);
  const [annee, setAnnee] = useState(null);
  const [niveaux, setNiveaux] = useState([]);
  const [classes, setClasses] = useState([]);
  const [tarifs, setTarifs] = useState([]);
  const [dossiers, setDossiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [toast, setToast] = useState({ open: false, severity: 'success', message: '' });
  const [relanceId, setRelanceId] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [info, setInfo] = useState({ titre: '', message: '' });
  const [infoEnvoi, setInfoEnvoi] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterClasse, setFilterClasse] = useState('');

  const [tarifForm, setTarifForm] = useState({ niveau: '', tranche1: '', tranche2: '', tranche3: '' });
  const [editingTarif, setEditingTarif] = useState(null);

  const [payOpen, setPayOpen] = useState(false);
  const [relanceOpen, setRelanceOpen] = useState(false);
  const [relancePortee, setRelancePortee] = useState('filtres'); // 'filtres' | 'tous'
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [payConfirm, setPayConfirm] = useState(false);
  const [payEnvoi, setPayEnvoi] = useState(false);
  const [payErreur, setPayErreur] = useState('');
  const [recuCopie, setRecuCopie] = useState(false);
  const [recuOpen, setRecuOpen] = useState(false);
  const [recusOpen, setRecusOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [recu, setRecu] = useState(null);
  const [ecole, setEcole] = useState({});
  const [payForm, setPayForm] = useState({
    montant: '', date_paiement: new Date().toISOString().slice(0, 10), mode: 'ESPECES', commentaire: ''
  });

  const showToast = (message, severity = 'success') => {
    setToast({ open: true, severity, message });
    if (severity === 'success') {
      setSuccess(message);
      setError('');
      setTimeout(() => setSuccess(''), 4000);
    } else {
      setError(message);
      setSuccess('');
    }
  };
  const ok = (msg) => showToast(msg, 'success');

  // Certificat de non redevance : PDF ouvert dans un nouvel onglet ; si l'élève doit encore de l'argent, la raison est affichée
  const certificat = async (d) => {
    try {
      const res = await dossierService.certificatNonRedevance(d.id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      let message = 'Le certificat ne peut pas être délivré pour le moment.';
      try { message = JSON.parse(await e.response.data.text()).detail || message; } catch { /* réponse illisible : message par défaut */ }
      showToast(message, 'error');
    }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await readThrough(CacheKeys.caisse(), async () => {
        const [resA, resN, resC, resT, resD] = await Promise.all([
          anneeService.getActive(),
          niveauService.getAll(),
          classeService.getAll(),
          tarifService.getAll('?inclure_suspendus=1'),
          dossierService.getAll('?page_size=500'),
        ]);
        return {
          annee: resA.data,
          niveaux: Array.isArray(resN.data) ? resN.data : resN.data.results ?? [],
          classes: Array.isArray(resC.data) ? resC.data : resC.data.results ?? [],
          tarifs: Array.isArray(resT.data) ? resT.data : resT.data.results ?? [],
          dossiers: getResults(resD).items.length ? getResults(resD).items : (Array.isArray(resD.data) ? resD.data : []),
        };
      });
      if (result.neverCached) {
        setError(NEVER_CACHED_MSG);
        setDossiers([]);
      } else {
        const d = result.data || {};
        setAnnee(d.annee);
        setNiveaux(d.niveaux || []);
        setClasses(d.classes || []);
        setTarifs(d.tarifs || []);
        setDossiers(d.dossiers || []);
      }
    } catch {
      setError(estEnLigne() ? 'Impossible de charger la caisse.' : NEVER_CACHED_MSG);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    readThrough(CacheKeys.parametres(), async () => {
      const res = await parametresService.get();
      return res.data || {};
    }).then((r) => { if (r.data) setEcole(r.data); }).catch(() => {});
  }, []);

  // Le reçu imprimé juste après l'encaissement est l'original ; toute réimpression ultérieure est un duplicata
  const printPaiement = (p, duplicata = true) => imprimerRecu(p, ecole, { duplicata });

  const openRecus = (d) => {
    setSelected(d);
    setRecusOpen(true);
  };

  const saveTarif = async () => {
    const payload = {
      niveau: tarifForm.niveau,
      annee_scolaire: annee?.id,
      tranche1: Number(tarifForm.tranche1 || 0),
      tranche2: Number(tarifForm.tranche2 || 0),
      tranche3: Number(tarifForm.tranche3 || 0),
    };
    try {
      const result = await sendOrQueue({
        kind: 'http',
        label: editingTarif ? 'Modifier tarif' : 'Créer tarif',
        payload: {
          method: editingTarif ? 'PUT' : 'POST',
          url: editingTarif ? `/tarifs/${editingTarif.id}/` : '/tarifs/',
          data: payload,
        },
      });
      setTarifForm({ niveau: '', tranche1: '', tranche2: '', tranche3: '' });
      setEditingTarif(null);
      ok(result.queued ? QUEUED_MSG : 'Grille enregistrée.');
      if (!result.queued) load();
    } catch {
      setError("Impossible d'enregistrer la grille (niveau déjà tarifé ?).");
    }
  };

  const openPay = (d) => {
    setSelected(d);
    setPayForm({
      montant: '',
      date_paiement: new Date().toISOString().slice(0, 10),
      mode: 'ESPECES',
      commentaire: '',
    });
    setPayConfirm(false);
    setPayErreur('');
    setPayOpen(true);
  };

  const MODES_AVEC_REF = ['MOBILE', 'VIREMENT', 'CHEQUE'];
  const verifierPay = () => {
    const m = Number(payForm.montant);
    if (!Number.isInteger(m) || m <= 0) return 'Saisissez un montant en francs, supérieur à 0.';
    if (selected?.reste && m > Number(selected.reste)) return `Le montant dépasse le reste à payer (${fmt(selected.reste)}).`;
    if (MODES_AVEC_REF.includes(payForm.mode) && payForm.commentaire.trim().length < 3) {
      return 'Indiquez la référence de la transaction (n° Mobile money, virement ou chèque).';
    }
    return '';
  };
  const demanderConfirmation = () => {
    const err = verifierPay();
    setPayErreur(err);
    if (!err) setPayConfirm(true);
  };

  const savePay = async () => {
    if (payEnvoi) return; // un seul envoi à la fois : pas de double encaissement par double clic
    setPayEnvoi(true);
    try {
      const body = {
        montant: Number(payForm.montant),
        date_paiement: payForm.date_paiement,
        mode: payForm.mode,
        commentaire: payForm.commentaire,
      };
      const result = await sendOrQueue({
        kind: 'paiement',
        label: `Paiement ${selected.eleve_prenom} ${selected.eleve_nom}`,
        payload: { dossier_id: selected.id, ...body },
      });
      setPayOpen(false);
      setPayConfirm(false);
      setRecuCopie(false);

      if (result.queued) {
        const montant = Number(body.montant);
        const localPay = {
          id: `local-${result.client_id}`,
          numero_recu: RECU_PENDING_MSG,
          date_paiement: body.date_paiement,
          montant,
          mode: body.mode,
          mode_libelle: LIBELLE_MODE[body.mode],
          commentaire: body.commentaire,
          eleve_prenom: selected.eleve_prenom,
          eleve_nom: selected.eleve_nom,
          eleve_matricule: selected.eleve_matricule,
          classe_nom: selected.classe_nom,
          annee_libelle: selected.annee_libelle,
          parent_nom: selected.parent_nom,
          montant_du: Number(selected.montant_du || 0),
          cumul_paye: Number(selected.montant_paye || 0) + montant,
          reste_apres: Math.max(0, Number(selected.reste || 0) - montant),
          _pending: true,
          client_id: result.client_id,
        };
        setRecu(localPay);
        setRecuOpen(true);
        // Mise à jour locale immédiate (admin + parent)
        const appliquer = (d) => {
          if (d.id !== selected.id) return d;
          const reste = Math.max(0, Number(d.reste || 0) - montant);
          return {
            ...d,
            montant_paye: Number(d.montant_paye || 0) + montant,
            reste,
            statut: reste === 0 ? 'SOLDE' : 'PARTIEL',
            statut_libelle: reste === 0 ? 'Soldé' : 'Partiel',
            paiements: [...(d.paiements || []), localPay],
          };
        };
        setDossiers((prev) => prev.map(appliquer));
        try {
          const cached = await cacheGet(CacheKeys.caisse());
          if (cached?.dossiers) {
            cached.dossiers = cached.dossiers.map(appliquer);
            await cacheSet(CacheKeys.caisse(), cached);
          }
          const eleveId = selected.eleve || selected.eleve_id;
          if (eleveId) {
            const { rememberPendingPaiement } = await import('pages/parent/MesFrais');
            await rememberPendingPaiement(eleveId, {
              dossier_id: selected.id,
              client_id: result.client_id,
              ...body,
              numero_recu: RECU_PENDING_MSG,
            });
          }
        } catch { /* ignore */ }
        ok(`${QUEUED_MSG}. ${RECU_PENDING_MSG}.`);
      } else {
        setRecu(result.data.paiement);
        setRecuOpen(true);
        ok(`Paiement enregistré — reçu ${result.data.paiement.numero_recu}`);
        load();
      }
    } catch (err) {
      setPayConfirm(false);
      setPayErreur(err.response?.data?.detail || "Erreur lors de l'enregistrement du paiement.");
    } finally {
      setPayEnvoi(false);
    }
  };

  const relancer = async (ids = []) => {
    setRelanceId(ids.length === 1 ? ids[0] : 'all');
    setError('');
    try {
      const result = await sendOrQueue({
        kind: 'http',
        label: 'Relance frais',
        payload: {
          method: 'POST',
          url: '/dossiers-scolarite/relancer/',
          data: ids.length ? { dossier_ids: ids } : {},
        },
      });
      if (result.queued) {
        showToast(QUEUED_MSG, 'success');
        return;
      }
      const d = result.data || {};
      if (!d.envoyes) {
        showToast(d.detail || MSG_RELANCE_NO_PARENT, 'error');
        return;
      }
      showToast(d.message || MSG_RELANCE_OK, 'success');
    } catch (err) {
      const data = err.response?.data || {};
      showToast(data.detail || data.message || "Impossible d’envoyer les relances.", 'error');
    } finally {
      setRelanceId(null);
    }
  };

  const envoyerInfo = async () => {
    if (!info.message.trim()) {
      showToast('Écrivez le message à envoyer.', 'error');
      return;
    }
    setInfoEnvoi(true);
    try {
      const result = await sendOrQueue({
        kind: 'http',
        label: 'Message aux parents (impayés)',
        payload: {
          method: 'POST',
          url: '/dossiers-scolarite/informer/',
          data: {
            titre: info.titre.trim(),
            message: info.message.trim(),
            classe_id: filterClasse || undefined,
            statut: filterStatut === 'IMPAYE' || filterStatut === 'PARTIEL' ? filterStatut : undefined,
          },
        },
      });
      if (result.queued) {
        showToast(QUEUED_MSG, 'success');
      } else {
        showToast(result.data?.message || 'Message envoyé aux parents.', 'success');
      }
      setInfoOpen(false);
      setInfo({ titre: '', message: '' });
    } catch (err) {
      showToast(err.response?.data?.detail || "Impossible d’envoyer le message.", 'error');
    } finally {
      setInfoEnvoi(false);
    }
  };

  const ouvrirDossiers = async () => {
    try {
      const res = await dossierService.ouvrirManquants();
      ok(`${res.data.created} dossier(s) ouvert(s).`);
      load();
    } catch {
      setError("Impossible d'ouvrir les dossiers manquants.");
    }
  };

  const uniques = dedupeDossiers(dossiers);
  const filtered = uniques.filter((d) => {
    const q = search.toLowerCase();
    const matchQ = !q || `${d.eleve_nom} ${d.eleve_prenom} ${d.eleve_matricule}`.toLowerCase().includes(q);
    const matchS = !filterStatut || d.statut === filterStatut;
    const matchC = !filterClasse || d.classe_nom === classes.find((c) => String(c.id) === String(filterClasse))?.nom;
    return matchQ && matchS && matchC;
  });

  // Cibles d'une relance : les dossiers non soldés de la liste affichée (filtres) ou de toute l'école
  const aRelancerFiltres = filtered.filter((d) => d.statut !== 'SOLDE');
  const aRelancerTous = uniques.filter((d) => d.statut !== 'SOLDE');
  const filtresActifs = !!(search || filterStatut || filterClasse);
  const porteeEffective = filtresActifs ? relancePortee : 'tous';
  const cibles = porteeEffective === 'tous' ? aRelancerTous : aRelancerFiltres;

  const ouvrirRelance = () => {
    setRelancePortee(filtresActifs ? 'filtres' : 'tous');
    setRelanceOpen(true);
  };

  const confirmerRelance = async () => {
    setRelanceOpen(false);
    if (!cibles.length) return;
    // on envoie la liste exacte des dossiers choisis : ni plus, ni moins que ce qui a été annoncé
    await relancer(porteeEffective === 'tous' ? [] : cibles.map((d) => d.id));
  };

  const libelleFiltres = [
    filterClasse && `classe ${classes.find((c) => String(c.id) === String(filterClasse))?.nom || ''}`.trim(),
    filterStatut && `situation « ${{ SOLDE: 'Soldé', PARTIEL: 'Partiel', IMPAYE: 'Impayé' }[filterStatut]} »`,
    search && `recherche « ${search} »`,
  ].filter(Boolean).join(' · ');

  const recap = {
    solde: uniques.filter((d) => d.statut === 'SOLDE').length,
    partiel: uniques.filter((d) => d.statut === 'PARTIEL').length,
    impaye: uniques.filter((d) => d.statut === 'IMPAYE').length,
    encaisse: uniques.reduce((s, d) => s + Number(d.montant_paye || 0), 0),
    reste: uniques.reduce((s, d) => s + Number(d.reste || 0), 0),
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap" mb={2}>
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Caisse — Frais de scolarité
        </Typography>
        <Chip size="small" color="primary" variant="outlined" label={`Année ${annee?.libelle || '—'}`} />
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2} mb={2}>
        {[
          { label: 'Soldés', value: recap.solde, color: 'success.main' },
          { label: 'Partiels', value: recap.partiel, color: 'warning.main' },
          { label: 'Impayés', value: recap.impaye, color: 'error.main' },
          { label: 'Encaissé', value: fmt(recap.encaisse), color: 'primary.main' },
        ].map((c) => (
          <Grid size={{ xs: 6, md: 3 }} key={c.label}>
            <Card><CardContent>
              <Typography variant="caption" color="text.secondary">{c.label}</Typography>
              <Typography variant="h5" fontWeight="bold" sx={{ color: c.color }}>{c.value}</Typography>
            </CardContent></Card>
          </Grid>
        ))}
      </Grid>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2 }}>
        <Tab label="Situations" />
        <Tab label="Grille des frais" />
      </Tabs>

      {tab === 0 && (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 5 }}>
                  <TextField fullWidth size="small" placeholder="Nom ou matricule"
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField select fullWidth size="small" label="Situation" value={filterStatut}
                    onChange={(e) => setFilterStatut(e.target.value)}>
                    <MenuItem value="">Toutes</MenuItem>
                    <MenuItem value="SOLDE">Soldé</MenuItem>
                    <MenuItem value="PARTIEL">Partiel</MenuItem>
                    <MenuItem value="IMPAYE">Impayé</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 6, md: 4 }}>
                  <TextField select fullWidth size="small" label="Classe" value={filterClasse}
                    onChange={(e) => setFilterClasse(e.target.value)}>
                    <MenuItem value="">Toutes</MenuItem>
                    {classes.map((c) => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
                  </TextField>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Box display="flex" alignItems="center" justifyContent="space-between" gap={1.5} flexWrap="wrap" mb={1.5}>
            <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
              <Chip size="small" variant="outlined" label={`${filtered.length} dossier${filtered.length > 1 ? 's' : ''}`} />
              <Chip size="small" variant="outlined" label={`Dû : ${fmt(filtered.reduce((t, d) => t + Number(d.montant_du || 0), 0))}`} />
              <Chip size="small" color="success" variant="outlined" label={`Encaissé : ${fmt(filtered.reduce((t, d) => t + Number(d.montant_paye || 0), 0))}`} />
              <Chip size="small" color="error" variant="outlined" label={`Reste : ${fmt(filtered.reduce((t, d) => t + Number(d.reste || 0), 0))}`} />
            </Box>
            {saisie && (
              <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
                <Button size="small" variant="contained" startIcon={<CampaignIcon />} onClick={() => setInfoOpen(true)}>
                  Écrire aux parents
                </Button>
                <Button size="small" variant="outlined" color="warning" startIcon={<NotificationsActiveIcon />}
                  onClick={ouvrirRelance} disabled={!!relanceId}>
                  {relanceId === 'all' ? 'Envoi…' : 'Relancer les impayés'}
                </Button>
                <Button size="small" startIcon={<DrawIcon />} onClick={() => setSignatureOpen(true)}>Ma signature</Button>
              </Box>
            )}
          </Box>

          <TableContainer component={Paper}>
            <Table size="small" sx={{ '& td, & th': { py: 1.25 } }}>
              <TableHead sx={{ bgcolor: 'primary.main' }}>
                <TableRow>
                  <TableCell sx={{ color: 'white' }}><strong>Élève</strong></TableCell>
                  <TableCell sx={{ color: 'white' }}><strong>Classe</strong></TableCell>
                  <TableCell align="right" sx={{ color: 'white' }}><strong>Dû</strong></TableCell>
                  <TableCell align="right" sx={{ color: 'white', minWidth: 130 }}><strong>Payé</strong></TableCell>
                  <TableCell align="right" sx={{ color: 'white' }}><strong>Reste</strong></TableCell>
                  <TableCell align="center" sx={{ color: 'white' }}><strong>Situation</strong></TableCell>
                  <TableCell align="right" sx={{ color: 'white', width: 290 }}><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center">Aucun dossier</TableCell></TableRow>
                ) : filtered.map((d) => {
                  const du = Number(d.montant_du || 0);
                  const paye = Number(d.montant_paye || 0);
                  const pct = du ? Math.min(100, Math.round((paye * 100) / du)) : 0;
                  const solde = d.statut === 'SOLDE';
                  const nbRecus = (d.paiements || []).length;
                  return (
                    <TableRow key={d.id} hover>
                      <TableCell sx={{ minWidth: 170 }}>
                        <Typography fontWeight={700} lineHeight={1.25}>{d.eleve_nom} {d.eleve_prenom}</Typography>
                        <Typography variant="caption" color="text.secondary">{d.eleve_matricule}</Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{d.classe_nom}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{fmt(du)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" fontWeight={600}>{fmt(paye)}</Typography>
                        <LinearProgress variant="determinate" value={pct} color={solde ? 'success' : paye ? 'warning' : 'inherit'}
                          sx={{ height: 5, borderRadius: 3, mt: 0.5, bgcolor: 'action.hover' }} />
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: solde ? 'success.main' : 'error.main' }}>
                        {solde ? '—' : fmt(d.reste)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={d.statut_libelle} color={STATUT_COLOR[d.statut] || 'default'} sx={{ minWidth: 72 }} />
                      </TableCell>
                      <TableCell align="right">
                        <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5}>
                          <Box sx={{ width: 118, display: 'flex', justifyContent: 'flex-end' }}>
                            {saisie && !solde && (
                              <Button size="small" variant="contained" startIcon={<PaymentsIcon />} onClick={() => openPay(d)}>
                                Encaisser
                              </Button>
                            )}
                            {solde && (
                              <Typography variant="body2" color="success.main" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <CheckCircleIcon fontSize="small" /> Soldé
                              </Typography>
                            )}
                          </Box>
                          <Tooltip title={nbRecus ? `Reçus (${nbRecus}) — voir et réimprimer` : 'Aucun reçu pour l’instant'}>
                            <span>
                              <Button size="small" startIcon={<PrintIcon />} onClick={() => openRecus(d)} disabled={!nbRecus} sx={{ minWidth: 92 }}>
                                Reçus{nbRecus ? ` (${nbRecus})` : ''}
                              </Button>
                            </span>
                          </Tooltip>
                          {saisie && (
                            <Tooltip title={solde ? 'Certificat de non redevance : atteste que l’élève ne doit plus rien à l’école' : 'Le certificat n’est délivré que lorsque la scolarité est soldée'}>
                              <span>
                                <Button size="small" startIcon={<VerifiedIcon />} onClick={() => certificat(d)} disabled={!solde} sx={{ minWidth: 92 }}>
                                  Non-redevance
                                </Button>
                              </span>
                            </Tooltip>
                          )}
                          <Tooltip title={solde ? 'Scolarité soldée' : 'Envoyer un rappel au parent'}>
                            <span>
                              <IconButton size="small" color="warning" onClick={() => relancer([d.id])} disabled={solde || !saisie || !!relanceId}
                                aria-label="Relancer le parent">
                                <NotificationsActiveIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {tab === 1 && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" mb={2}>{editingTarif ? 'Modifier' : 'Nouvelle'} grille</Typography>
                <Box display="flex" flexDirection="column" gap={2}>
                  <TextField select label="Niveau" value={tarifForm.niveau}
                    onChange={(e) => setTarifForm({ ...tarifForm, niveau: e.target.value })}>
                    {niveaux.map((n) => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
                  </TextField>
                  {['tranche1', 'tranche2', 'tranche3'].map((k, i) => (
                    <TextField key={k} type="number" label={`${i + 1}re tranche (F CFA)`}
                      value={tarifForm[k]} onChange={(e) => setTarifForm({ ...tarifForm, [k]: e.target.value })} />
                  ))}
                  <Button variant="contained" onClick={saveTarif} disabled={!tarifForm.niveau || !annee}>
                    Enregistrer
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead sx={{ bgcolor: 'grey.100' }}>
                  <TableRow>
                    <TableCell>Niveau</TableCell>
                    <TableCell align="right">T1</TableCell>
                    <TableCell align="right">T2</TableCell>
                    <TableCell align="right">T3</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tarifs.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell><strong>{t.niveau_nom}</strong></TableCell>
                      <TableCell align="right">{fmt(t.tranche1)}</TableCell>
                      <TableCell align="right">{fmt(t.tranche2)}</TableCell>
                      <TableCell align="right">{fmt(t.tranche3)}</TableCell>
                      <TableCell align="right"><strong>{fmt(t.montant_total)}</strong></TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => {
                          setEditingTarif(t);
                          setTarifForm({
                            niveau: t.niveau, tranche1: t.tranche1, tranche2: t.tranche2, tranche3: t.tranche3
                          });
                        }}>Modifier</Button>
                        <Button size="small" color={t.is_active === false ? 'success' : 'warning'} onClick={async () => {
                          const actif = t.is_active !== false;
                          if (actif && !window.confirm(`Suspendre la grille de ${t.niveau_nom} ? Les paiements déjà faits restent.`)) return;
                          try {
                            if (actif) {
                              await tarifService.delete(t.id);
                              ok('Grille suspendue.');
                            } else {
                              await tarifService.reactiver(t.id);
                              ok('Grille réactivée.');
                            }
                            load();
                          } catch {
                            setError('Action impossible.');
                          }
                        }}>{t.is_active === false ? 'Réactiver' : 'Suspendre'}</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      )}

      <Dialog open={relanceOpen} onClose={() => setRelanceOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Relancer les impayés</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Chaque parent reçoit un rappel personnalisé avec le montant exact qu’il doit encore. Les élèves soldés ne sont jamais relancés.
          </Typography>
          {filtresActifs ? (
            <Box display="grid" gap={1}>
              {[
                ['filtres', `Selon la liste affichée — ${aRelancerFiltres.length} élève${aRelancerFiltres.length > 1 ? 's' : ''}`, libelleFiltres],
                ['tous', `Toute l’école — ${aRelancerTous.length} élève${aRelancerTous.length > 1 ? 's' : ''}`, 'Tous les élèves non soldés, sans tenir compte des filtres'],
              ].map(([val, titre, detail]) => (
                <Box key={val} onClick={() => setRelancePortee(val)} sx={{
                  cursor: 'pointer', p: 1.5, borderRadius: 2, border: '2px solid',
                  borderColor: relancePortee === val ? 'primary.main' : 'divider',
                  bgcolor: relancePortee === val ? 'action.hover' : 'transparent',
                }}>
                  <Typography fontWeight={700}>{titre}</Typography>
                  <Typography variant="body2" color="text.secondary">{detail}</Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Alert severity="info">Aucun filtre actif : le rappel part à <strong>toute l’école</strong> ({aRelancerTous.length} élève{aRelancerTous.length > 1 ? 's' : ''} non soldé{aRelancerTous.length > 1 ? 's' : ''}). Choisissez une classe ou une situation avant, pour cibler.</Alert>
          )}
          {!cibles.length && <Alert severity="warning" sx={{ mt: 2 }}>Aucun élève à relancer pour ce choix.</Alert>}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setRelanceOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" color="warning" onClick={confirmerRelance} disabled={!cibles.length}>
            Envoyer à {cibles.length} parent{cibles.length > 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>

      <MaSignature open={signatureOpen} onClose={() => setSignatureOpen(false)} />

      <Dialog open={payOpen} onClose={() => !payEnvoi && setPayOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{payConfirm ? 'Confirmer l’encaissement' : 'Encaisser'} — {selected?.eleve_prenom} {selected?.eleve_nom}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {payErreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPayErreur('')}>{payErreur}</Alert>}
          {!payConfirm && (
            <>
              <Box sx={{ p: 1.5, mb: 2, bgcolor: 'action.hover', borderRadius: 2, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                <Box><Typography variant="caption">Scolarité</Typography><Typography fontWeight={700}>{fmt(selected?.montant_du)}</Typography></Box>
                <Box><Typography variant="caption">Déjà payé</Typography><Typography fontWeight={700}>{fmt(selected?.montant_paye)}</Typography></Box>
                <Box><Typography variant="caption">Reste à payer</Typography><Typography fontWeight={700} color="error.main">{fmt(selected?.reste)}</Typography></Box>
              </Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Ce sera le <strong>{(selected?.paiements || []).length === 0 ? '1er' : `${(selected?.paiements || []).length + 1}e`} versement</strong> de cet élève.
              </Typography>
              <Box display="flex" flexDirection="column" gap={2} mt={1}>
                <TextField type="number" label="Montant versé (F CFA)" value={payForm.montant} autoFocus
                  inputProps={{ min: 1, max: selected?.reste || undefined }}
                  helperText={Number(payForm.montant) > 0 ? `${francsEnLettres(Number(payForm.montant))}` : 'Le versement compte pour le total de la scolarité (pas pour une tranche).'}
                  onChange={(e) => setPayForm({ ...payForm, montant: e.target.value })} />
                <TextField type="date" label="Date (jour de l’encaissement)" InputLabelProps={{ shrink: true }}
                  value={payForm.date_paiement} disabled
                  helperText="La date est celle d’aujourd’hui : elle ne peut pas être modifiée." />
                <TextField select label="Mode de paiement" value={payForm.mode}
                  onChange={(e) => setPayForm({ ...payForm, mode: e.target.value })}>
                  <MenuItem value="ESPECES">Espèces</MenuItem>
                  <MenuItem value="MOBILE">Mobile money</MenuItem>
                  <MenuItem value="VIREMENT">Virement</MenuItem>
                  <MenuItem value="CHEQUE">Chèque</MenuItem>
                </TextField>
                <TextField
                  label={MODES_AVEC_REF.includes(payForm.mode) ? 'Référence de la transaction (obligatoire)' : 'Observation (facultatif)'}
                  value={payForm.commentaire} required={MODES_AVEC_REF.includes(payForm.mode)}
                  placeholder={payForm.mode === 'MOBILE' ? 'N° de transaction Mobile money' : payForm.mode === 'CHEQUE' ? 'N° du chèque et banque' : payForm.mode === 'VIREMENT' ? 'Référence du virement' : ''}
                  inputProps={{ maxLength: 200 }}
                  onChange={(e) => setPayForm({ ...payForm, commentaire: e.target.value })} />
              </Box>
            </>
          )}
          {payConfirm && (
            <Box>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Vérifiez bien : un paiement enregistré ne peut plus être modifié ni supprimé.
              </Alert>
              <Box sx={{ border: '2px solid', borderColor: 'primary.main', borderRadius: 2, p: 2 }}>
                <Typography variant="body2" color="text.secondary">Élève</Typography>
                <Typography fontWeight={700}>{selected?.eleve_prenom} {selected?.eleve_nom} — {selected?.classe_nom}</Typography>
                <Typography variant="body2" color="text.secondary" mt={1.5}>Montant à encaisser</Typography>
                <Typography variant="h4" fontWeight={800} color="primary.main">{fmt(payForm.montant)}</Typography>
                <Typography variant="body2" sx={{ fontStyle: 'italic' }}>{francsEnLettres(Number(payForm.montant))}</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1.5 }}>
                  <Box><Typography variant="caption">Mode</Typography><Typography>{LIBELLE_MODE[payForm.mode]}</Typography></Box>
                  <Box><Typography variant="caption">Versement</Typography><Typography>{(selected?.paiements || []).length === 0 ? '1er' : `${(selected?.paiements || []).length + 1}e`}</Typography></Box>
                  <Box><Typography variant="caption">Reste après ce versement</Typography>
                    <Typography fontWeight={700} color={Number(selected?.reste) - Number(payForm.montant) <= 0 ? 'success.main' : 'error.main'}>
                      {Number(selected?.reste) - Number(payForm.montant) <= 0 ? 'Soldé' : fmt(Number(selected?.reste) - Number(payForm.montant))}
                    </Typography>
                  </Box>
                  {payForm.commentaire && <Box><Typography variant="caption">{MODES_AVEC_REF.includes(payForm.mode) ? 'Référence' : 'Observation'}</Typography><Typography>{payForm.commentaire}</Typography></Box>}
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          {!payConfirm ? (
            <>
              <Button onClick={() => setPayOpen(false)} color="inherit">Annuler</Button>
              <Button variant="contained" onClick={demanderConfirmation} disabled={!payForm.montant}>Continuer</Button>
            </>
          ) : (
            <>
              <Button onClick={() => setPayConfirm(false)} color="inherit" disabled={payEnvoi}>Corriger</Button>
              <Button variant="contained" color="success" onClick={savePay} disabled={payEnvoi}>
                {payEnvoi ? 'Enregistrement…' : 'Confirmer l’encaissement'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={recuOpen} onClose={() => setRecuOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptLongIcon /> {recu?._pending ? 'Reçu provisoire' : 'Reçu de paiement'}
          {recuCopie && !recu?._pending && <Chip size="small" color="error" label="DUPLICATA" sx={{ ml: 'auto' }} />}
        </DialogTitle>
        <DialogContent>
          {recu && (
            <Box>
              <Box sx={{ textAlign: 'center', pb: 1.5, borderBottom: '2px solid', borderColor: 'primary.main' }}>
                <Typography variant="h6" fontWeight={800}>{ecole.nom_ecole || 'Complexe Scolaire Wend-Panga'}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {recu._pending ? 'Le numéro définitif sera attribué à la synchronisation.' : <>Reçu n° <strong>{recu.numero_recu}</strong></>}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center', my: 2, py: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">MONTANT REÇU</Typography>
                <Typography variant="h4" fontWeight={800} color="success.main">{fmt(recu.montant)}</Typography>
                <Typography variant="body2" sx={{ fontStyle: 'italic', px: 1 }}>{francsEnLettres(recu.montant)}</Typography>
              </Box>
              {[
                ['Élève', `${recu.eleve_prenom || ''} ${recu.eleve_nom || ''}${recu.eleve_matricule ? ` (${recu.eleve_matricule})` : ''}`],
                ['Classe', `${recu.classe_nom || '—'}${recu.annee_libelle ? ` — ${recu.annee_libelle}` : ''}`],
                recu.parent_nom && ['Parent / tuteur', recu.parent_nom],
                recu.versement_libelle && ['Versement', recu.versement_libelle],
                ['Date', `${formatDateFr(recu.date_paiement)}${recu.created_at ? ` à ${new Date(recu.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}`],
                ['Mode', recu.mode_libelle],
                recu.commentaire && [['MOBILE', 'VIREMENT', 'CHEQUE'].includes(recu.mode) ? 'Référence' : 'Observation', recu.commentaire],
                recu.recu_par_nom && ['Encaissé par', recu.recu_par_nom],
              ].filter(Boolean).map(([k, v]) => (
                <Box key={k} display="flex" justifyContent="space-between" gap={2} py={0.6} sx={{ borderBottom: '1px dotted', borderColor: 'divider' }}>
                  <Typography variant="body2" color="text.secondary">{k}</Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ textAlign: 'right' }}>{v}</Typography>
                </Box>
              ))}
              {recu.montant_du > 0 && (
                <Box sx={{ mt: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">SITUATION APRÈS CE VERSEMENT</Typography>
                  <Box display="flex" justifyContent="space-between"><span>Scolarité totale</span><strong>{fmt(recu.montant_du)}</strong></Box>
                  <Box display="flex" justifyContent="space-between"><span>Total payé</span><strong>{fmt(recu.cumul_paye)}</strong></Box>
                  <Box display="flex" justifyContent="space-between" sx={{ color: recu.reste_apres ? 'error.main' : 'success.main' }}>
                    <span>Reste à payer</span><strong>{recu.reste_apres ? fmt(recu.reste_apres) : 'SOLDÉ ✔'}</strong>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecuOpen(false)}>Fermer</Button>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => printPaiement(recu, recuCopie)}>Imprimer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={recusOpen} onClose={() => setRecusOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          Reçus — {selected?.eleve_prenom} {selected?.eleve_nom}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Réimpression possible à tout moment (après rechargement de la page aussi).
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>N° reçu</TableCell>
                <TableCell>Versement</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Montant</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {(selected?.paiements || []).length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center">Aucun paiement</TableCell></TableRow>
              ) : (selected?.paiements || []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.numero_recu}</TableCell>
                  <TableCell>{p.versement_libelle || '—'}</TableCell>
                  <TableCell>{formatDateFr(p.date_paiement)}</TableCell>
                  <TableCell align="right">{fmt(p.montant)}</TableCell>
                  <TableCell align="right">
                    <Button size="small" startIcon={<PrintIcon />} onClick={() => printPaiement(p)}>
                      Imprimer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecusOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={infoOpen} onClose={() => !infoEnvoi && setInfoOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Écrire aux parents des impayés</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Le message part aux parents des élèves dont la scolarité n’est pas soldée
            {filterClasse ? ` (classe : ${classes.find((c) => String(c.id) === String(filterClasse))?.nom || 'choisie'})` : ' (toutes les classes)'}
            {filterStatut === 'IMPAYE' ? ', situation « Impayé »' : filterStatut === 'PARTIEL' ? ', situation « Partiel »' : ''}.
            Ils le lisent dans leur espace, menu Messages.
          </Alert>
          <TextField fullWidth size="small" label="Titre" sx={{ mb: 2 }} value={info.titre}
            onChange={(e) => setInfo({ ...info, titre: e.target.value })} placeholder="Ex. Dernier délai de paiement" />
          <TextField fullWidth multiline minRows={4} label="Message" value={info.message}
            onChange={(e) => setInfo({ ...info, message: e.target.value })}
            inputProps={{ maxLength: 800 }} helperText={`${info.message.length}/800`} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoOpen(false)} disabled={infoEnvoi}>Annuler</Button>
          <Button variant="contained" onClick={envoyerInfo} disabled={infoEnvoi}>Envoyer</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          severity={toast.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
