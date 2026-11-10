import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import PublicIcon from '@mui/icons-material/Public';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import api from 'services/api';
import BarresParJour from 'components/BarresParJour';

const STATUT = { VALIDEE: ['Validée', 'success'], EN_ATTENTE: ['En attente', 'warning'], REFUSEE: ['Refusée', 'error'], SUSPENDUE: ['Suspendue', 'default'] };
const ROLES = { ADMIN: 'Directeurs', SECRETAIRE: 'Secrétaires', COMPTABLE: 'Comptables', SURVEILLANT: 'Surveillants', COMMUNICATION: 'Responsables du site', ENSEIGNANT: 'Enseignants', ELEVE: 'Élèves (comptes)', PARENT: 'Parents' };
const date = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const telWhatsapp = (t) => { const n = String(t || '').replace(/\D/g, ''); return n.length === 8 ? `226${n}` : n; };

function Bloc({ titre, children, action }) {
  return (
    <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        <Typography fontWeight={800}>{titre}</Typography>{action}
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Card>
  );
}

/** Tout ce qu'il faut savoir d'une école pour l'aider ou la dépanner : contacts, effectifs, activité, incidents. */
export default function FicheEcole() {
  const { id } = useParams();
  const [e, setE] = useState(null);
  const [trafic, setTrafic] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    api.get(`/plateforme/ecoles/${id}/`).then((r) => setE(r.data)).catch(() => setErreur('Impossible de charger la fiche de cette école.'));
    api.get('/plateforme/trafic/', { params: { jours: 14, ecole: id } }).then((r) => setTrafic(r.data.jours)).catch(() => setTrafic([]));
  }, [id]);

  if (erreur) return <Alert severity="error">{erreur}</Alert>;
  if (!e) return <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;
  const [libStatut, couleurStatut] = STATUT[e.statut] || [e.statut, 'default'];

  return (
    <Box>
      <Button component={Link} to="/dashboard/default" startIcon={<ArrowBackIcon />} sx={{ mb: 1.5, textTransform: 'none' }}>Tableau de bord</Button>
      <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap" mb={2.5}>
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>{e.nom}</Typography>
        <Chip label={libStatut} color={couleurStatut} />
        {e.annee_en_cours ? <Chip variant="outlined" label={`Année ${e.annee_en_cours}`} /> : <Chip color="warning" label="Aucune année en cours" />}
        {e.incidents_ouverts > 0 && (
          <Chip color="error" icon={<ReportProblemIcon />} label={`${e.incidents_ouverts} incident(s)`} component={Link} to={`/plateforme/incidents?ecole=${e.id}`} clickable />
        )}
      </Box>
      {e.motif && <Alert severity="warning" sx={{ mb: 2 }}>Motif : {e.motif}</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        <Bloc titre="Contacts">
          <Typography fontWeight={700}>{e.directeur || 'Directeur non renseigné'}</Typography>
          <Typography variant="body2" color="text.secondary" mb={1.5}>{[e.adresse, e.ville].filter(Boolean).join(', ') || 'Adresse non renseignée'}</Typography>
          <Box display="flex" gap={1} flexWrap="wrap" mb={1.5}>
            {e.telephone && <Button size="small" variant="outlined" startIcon={<PhoneIcon />} href={`tel:${e.telephone}`}>{e.telephone}</Button>}
            {e.telephone && <Button size="small" variant="outlined" color="success" startIcon={<WhatsAppIcon />} href={`https://wa.me/${telWhatsapp(e.telephone)}`} target="_blank" rel="noopener">WhatsApp</Button>}
            {e.email && <Button size="small" variant="outlined" startIcon={<EmailIcon />} href={`mailto:${e.email}`}>{e.email}</Button>}
            {e.slug && e.vitrine_active && <Button size="small" startIcon={<PublicIcon />} href={`/ecole/${e.slug}`} target="_blank" rel="noopener">Site public</Button>}
          </Box>
          <Typography variant="caption" color="text.secondary" display="block">Demande le {date(e.date_demande)} · statut changé le {date(e.date_statut)}</Typography>
        </Bloc>

        <Bloc titre="Comptes de direction">
          {e.directeurs.length === 0 ? <Typography color="text.secondary">Aucun compte directeur.</Typography> : e.directeurs.map((d) => (
            <Box key={d.username} sx={{ py: 0.75, borderBottom: '1px dashed', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
              <Typography fontWeight={700} variant="body2">{d.nom || d.username} {!d.actif && <Chip size="small" label="Suspendu" sx={{ ml: 0.5 }} />}</Typography>
              <Typography variant="caption" color="text.secondary">Identifiant {d.username}{d.email ? ` · ${d.email}` : ''} · dernière connexion : {date(d.derniere_connexion)}</Typography>
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            Mot de passe perdu ou compte de parent à suspendre : page Établissements, bouton « Comptes ».
          </Typography>
        </Bloc>

        <Bloc titre={`Effectifs ${e.annee_en_cours || ''}`}>
          <Box display="flex" gap={1} flexWrap="wrap" mb={1.5}>
            <Chip label={`${e.eleves} élèves`} sx={{ fontWeight: 700 }} />
            <Chip variant="outlined" label={`${e.classes} classes`} />
            <Chip variant="outlined" label={`${e.paiements_annee} paiements enregistrés`} />
            <Chip variant="outlined" label={`${e.sms_30j.envoyes} SMS en 30 j`} />
            {e.sms_30j.echecs > 0 && <Chip color="error" label={`${e.sms_30j.echecs} SMS en échec`} />}
          </Box>
          <Table size="small">
            <TableHead><TableRow><TableCell>Niveau</TableCell><TableCell align="right">Élèves</TableCell></TableRow></TableHead>
            <TableBody>
              {e.effectifs_par_niveau.map((n) => <TableRow key={n.niveau}><TableCell>{n.niveau}</TableCell><TableCell align="right">{n.eleves}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </Bloc>

        <Bloc titre="Comptes actifs">
          <Table size="small">
            <TableBody>
              {Object.entries(ROLES).map(([code, lib]) => (
                <TableRow key={code}><TableCell>{lib}</TableCell><TableCell align="right">{e.comptes[code] || 0}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Bloc>

        <Bloc titre="Activité">
          <BarresParJour titre="Connexions par jour (30 jours)" couleur="primary.main"
            donnees={e.connexions_30j.map((c) => ({ jour: c.jour, valeur: c.connexions, detail: `${c.connexions} connexion(s)` }))} />
          {trafic && (
            <Box mt={2.5}>
              <BarresParJour titre="Requêtes par jour (14 jours)" couleur="primary.main"
                donnees={trafic.map((t) => ({ jour: t.jour, valeur: t.requetes,
                  detail: `${t.requetes} requêtes · ${t.erreurs} erreur(s) · temps moyen ${t.temps_moyen_ms} ms` }))} />
            </Box>
          )}
        </Bloc>

        <Bloc titre="Dernières actions dans l'école">
          {e.evenements.length === 0 ? <Typography color="text.secondary">Aucune action enregistrée.</Typography> : e.evenements.map((x, i) => (
            <Box key={i} sx={{ py: 0.6, borderBottom: '1px dashed', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
              <Typography variant="body2"><strong>{x.qui || '—'}</strong>{x.role ? ` (${x.role})` : ''} · {x.action} {x.objet}</Typography>
              <Typography variant="caption" color="text.secondary">{date(x.date)}</Typography>
            </Box>
          ))}
        </Bloc>
      </Box>
    </Box>
  );
}
