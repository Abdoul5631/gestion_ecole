import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, IconButton, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SchoolIcon from '@mui/icons-material/School';
import PeopleIcon from '@mui/icons-material/People';
import GroupsIcon from '@mui/icons-material/Groups';
import LoginIcon from '@mui/icons-material/Login';
import VerifiedIcon from '@mui/icons-material/Verified';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorIcon from '@mui/icons-material/Error';
import api from 'services/api';
import BarresParJour from 'components/BarresParJour';

const ETAT = {
  OK: { color: 'success.main', icone: <CheckCircleIcon fontSize="small" />, label: 'OK' },
  ATTENTION: { color: 'warning.main', icone: <WarningAmberIcon fontSize="small" />, label: 'À surveiller' },
  PROBLEME: { color: 'error.main', icone: <ErrorIcon fontSize="small" />, label: 'Problème' },
};
const STATUT = { VALIDEE: ['Validée', 'success'], EN_ATTENTE: ['En attente', 'warning'], REFUSEE: ['Refusée', 'error'], SUSPENDUE: ['Suspendue', 'default'] };
const ACTUALISATION_MS = 60000;

function Chiffre({ icone, valeur, libelle, couleur }) {
  return (
    <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${couleur}18`, color: couleur }}>{icone}</Box>
      <Box>
        <Typography sx={{ fontWeight: 800, fontSize: 24, lineHeight: 1.1 }}>{valeur}</Typography>
        <Typography variant="body2" color="text.secondary">{libelle}</Typography>
      </Box>
    </Card>
  );
}

const activite = (e) => {
  if (e.jours_sans_activite === null) return ['Jamais', 'error.main'];
  if (e.jours_sans_activite === 0) return ["Aujourd'hui", 'success.main'];
  if (e.jours_sans_activite === 1) return ['Hier', 'success.main'];
  return [`Il y a ${e.jours_sans_activite} j`, e.jours_sans_activite >= 14 ? 'warning.main' : 'text.secondary'];
};

/** Poste de pilotage du super admin : alertes d'abord, état de la plateforme, puis chaque école. */
export default function TableauPlateforme() {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  const [maj, setMaj] = useState(null);
  const [trafic, setTrafic] = useState(null);
  const navigate = useNavigate();

  const charger = useCallback(() => {
    api.get('/plateforme/tableau/')
      .then((r) => { setData(r.data); setErreur(''); setMaj(new Date()); })
      .catch(() => setErreur('Impossible de joindre le serveur : la plateforme est peut-être en panne, ou votre connexion coupée.'));
    api.get('/plateforme/trafic/', { params: { jours: 7 } }).then((r) => setTrafic(r.data.jours)).catch(() => {});
  }, []);

  useEffect(() => {
    charger();
    const t = setInterval(charger, ACTUALISATION_MS);
    return () => clearInterval(t);
  }, [charger]);

  const t = data?.totaux || {};
  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap" mb={2.5}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Plateforme</Typography>
          <Typography variant="body2" color="text.secondary">
            Toutes les écoles et l&apos;état du système{maj ? ` · mis à jour à ${maj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}, automatiquement chaque minute` : ''}
          </Typography>
        </Box>
        <Tooltip title="Actualiser"><IconButton onClick={charger}><RefreshIcon /></IconButton></Tooltip>
      </Box>

      {erreur && <Alert severity="error" sx={{ mb: 2 }}>{erreur}</Alert>}
      {!data && !erreur && <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>}

      {data && (
        <>
          {/* ── À traiter maintenant ── */}
          {data.alertes.length === 0 ? (
            <Alert severity="success" sx={{ mb: 2.5 }}>Rien à signaler : tout fonctionne normalement.</Alert>
          ) : (
            <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', mb: 2.5, overflow: 'hidden' }}>
              <Typography fontWeight={800} sx={{ px: 2, py: 1.25, bgcolor: 'action.hover' }}>À traiter ({data.alertes.length})</Typography>
              {data.alertes.map((a, i) => (
                <Alert key={i} severity={a.niveau} sx={{ borderRadius: 0, borderTop: '1px solid', borderColor: 'divider' }}
                  action={a.lien ? <Button size="small" color="inherit" component={Link} to={a.lien}>Voir</Button> : null}>
                  {a.texte}
                </Alert>
              ))}
            </Card>
          )}

          {/* ── Chiffres ── */}
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, mb: 2.5 }}>
            <Chiffre icone={<SchoolIcon />} valeur={t.validees} libelle={`École${t.validees > 1 ? 's' : ''} active${t.validees > 1 ? 's' : ''}`} couleur="#1976d2" />
            <Chiffre icone={<VerifiedIcon />} valeur={t.en_attente} libelle="À valider" couleur={t.en_attente ? '#e65100' : '#2e7d32'} />
            <Chiffre icone={<PeopleIcon />} valeur={t.eleves} libelle="Élèves inscrits" couleur="#7b1fa2" />
            <Chiffre icone={<GroupsIcon />} valeur={t.enseignants} libelle="Enseignants" couleur="#00796b" />
            <Chiffre icone={<LoginIcon />} valeur={t.connexions_24h} libelle="Connexions (24 h)" couleur="#5d4037" />
          </Box>

          {/* ── État de la plateforme ── */}
          <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', mb: 2.5, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography fontWeight={800}>État de la plateforme</Typography>
              <Button size="small" component={Link} to="/plateforme/incidents" sx={{ textTransform: 'none' }}>Voir les incidents</Button>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
              {data.sante.map((c) => {
                const e = ETAT[c.etat] || ETAT.ATTENTION;
                return (
                  <Box key={c.code} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', px: 2, py: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ color: e.color, mt: 0.25 }}>{e.icone}</Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={700} variant="body2">{c.libelle}</Typography>
                      <Typography variant="body2" color="text.secondary">{c.texte}</Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Card>

          {/* ── Trafic des 7 derniers jours : une série par graphique (pas de double axe) ── */}
          {trafic && (
            <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', mb: 2.5, p: 2 }}>
              <Typography fontWeight={800} mb={1.5}>Trafic des 7 derniers jours</Typography>
              <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' } }}>
                <BarresParJour titre="Requêtes" couleur="primary.main"
                  donnees={trafic.map((j) => ({ jour: j.jour, valeur: j.requetes, detail: `${j.requetes.toLocaleString('fr-FR')} requêtes` }))} />
                <BarresParJour titre="Erreurs du serveur" couleur="error.main"
                  donnees={trafic.map((j) => ({ jour: j.jour, valeur: j.erreurs, detail: `${j.erreurs} erreur(s) · ${j.lentes} réponse(s) lente(s)` }))} />
                <BarresParJour titre="Temps de réponse moyen" couleur="primary.main" unite=" ms"
                  donnees={trafic.map((j) => ({ jour: j.jour, valeur: j.temps_moyen_ms, detail: `moyen ${j.temps_moyen_ms} ms · le plus long ${j.temps_max_ms} ms` }))} />
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
                Le comptage a commencé avec cette version : les jours précédents sont vides. Survolez une barre pour le détail du jour.
              </Typography>
            </Card>
          )}

          {/* ── Chaque école ── */}
          <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            <Typography fontWeight={800} sx={{ px: 2, py: 1.25, bgcolor: 'action.hover' }}>
              Écoles ({data.ecoles.length}) <Typography component="span" variant="caption" color="text.secondary">· cliquez sur une école pour sa fiche complète</Typography>
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>École</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell>Année en cours</TableCell>
                    <TableCell align="right">Élèves</TableCell>
                    <TableCell align="right">Enseignants</TableCell>
                    <TableCell align="right">Parents</TableCell>
                    <TableCell align="right">Connexions 7 j</TableCell>
                    <TableCell>Dernière activité</TableCell>
                    <TableCell align="right">Erreurs 7 j</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.ecoles.map((e) => {
                    const [libStatut, couleurStatut] = STATUT[e.statut] || [e.statut, 'default'];
                    const [libAct, couleurAct] = activite(e);
                    return (
                      <TableRow key={e.id} hover onClick={() => navigate(`/plateforme/ecoles/${e.id}`)} sx={{ cursor: 'pointer' }}>
                        <TableCell>
                          <Typography fontWeight={700} variant="body2">{e.nom}</Typography>
                          {e.ville && <Typography variant="caption" color="text.secondary">{e.ville}</Typography>}
                        </TableCell>
                        <TableCell><Chip size="small" label={libStatut} color={couleurStatut} variant="outlined" /></TableCell>
                        <TableCell>{e.annee_en_cours || <Typography variant="body2" color="warning.main">Aucune</Typography>}</TableCell>
                        <TableCell align="right">{e.eleves}</TableCell>
                        <TableCell align="right">{e.enseignants}</TableCell>
                        <TableCell align="right">{e.parents}</TableCell>
                        <TableCell align="right">{e.connexions_7j}</TableCell>
                        <TableCell><Typography variant="body2" sx={{ color: couleurAct }}>{libAct}</Typography></TableCell>
                        <TableCell align="right">
                          {e.incidents_7j
                            ? <Chip size="small" color="error" label={e.incidents_7j} component={Link} to={`/plateforme/incidents?ecole=${e.id}`} clickable
                              onClick={(ev) => ev.stopPropagation()} />
                            : <Typography variant="body2" color="text.secondary">0</Typography>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </>
      )}
    </Box>
  );
}
