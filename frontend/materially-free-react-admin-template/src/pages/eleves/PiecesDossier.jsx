import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, IconButton, LinearProgress, Tooltip, Typography
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import { eleveService } from 'services/api';
import { messageErreur } from 'utils/erreurs';
import { useIsOnline } from 'offline/RequireOnline';

const taille = (o) => (o >= 1048576 ? `${(o / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

/** Dossier administratif : pièces fournies / manquantes, ajout (fichier ou photo), consultation, suppression. */
export default function PiecesDossier({ eleveId }) {
  const online = useIsOnline();
  const fichierRef = useRef(null);
  const typeCible = useRef('');
  const [data, setData] = useState(null);
  const [envoi, setEnvoi] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = () => eleveService.documents(eleveId)
    .then((res) => setData(res.data))
    .catch((e) => setErreur(messageErreur(e, 'Impossible de charger les pièces du dossier.')));

  useEffect(() => { charger(); }, [eleveId]); // eslint-disable-line react-hooks/exhaustive-deps

  const choisir = (code) => { typeCible.current = code; fichierRef.current?.click(); };

  const envoyer = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setEnvoi(typeCible.current);
    setErreur('');
    try {
      const fd = new FormData();
      fd.append('type', typeCible.current);
      fd.append('fichier', f);
      await eleveService.ajouterDocument(eleveId, fd);
      await charger();
    } catch (err) {
      setErreur(err?.response?.data?.detail || "Impossible d'envoyer le document.");
    } finally {
      setEnvoi('');
    }
  };

  const ouvrir = async (doc) => {
    try {
      const res = await eleveService.voirDocument(eleveId, doc.id);
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setErreur('Impossible d\u2019ouvrir ce document.');
    }
  };

  const supprimer = async (doc) => {
    if (!window.confirm(`Supprimer « ${doc.nom_fichier} » du dossier ?`)) return;
    try {
      await eleveService.supprimerDocument(eleveId, doc.id);
      await charger();
    } catch {
      setErreur('Suppression impossible.');
    }
  };

  if (!data) return <Box display="flex" justifyContent="center" p={3}>{erreur ? <Alert severity="error">{erreur}</Alert> : <CircularProgress />}</Box>;

  const essentiels = data.types.filter((t) => t.essentiel);
  const fournis = essentiels.filter((t) => t.fourni).length;

  return (
    <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,.08)', mt: 2 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography variant="h5" fontWeight="bold">Pièces du dossier</Typography>
          <Chip color={fournis === essentiels.length ? 'success' : 'warning'} label={`${fournis} / ${essentiels.length} pièces essentielles`} />
        </Box>
        <LinearProgress variant="determinate" value={(fournis / essentiels.length) * 100} color={fournis === essentiels.length ? 'success' : 'warning'}
          sx={{ height: 6, borderRadius: 3, my: 1.5 }} />
        {data.manquants.length > 0 && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>Pièces manquantes : {data.manquants.join(' · ')}</Alert>
        )}
        {erreur && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setErreur('')}>{erreur}</Alert>}
        <input ref={fichierRef} type="file" hidden accept="image/*,.pdf" onChange={envoyer} />

        {data.types.map((t) => {
          const docs = data.documents.filter((d) => d.type === t.code);
          return (
            <Box key={t.code} sx={{ py: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                {t.fourni ? <CheckCircleIcon color="success" fontSize="small" /> : <RadioButtonUncheckedIcon color={t.essentiel ? 'warning' : 'disabled'} fontSize="small" />}
                <Typography fontWeight={600} sx={{ flex: 1, minWidth: 180 }}>
                  {t.libelle}
                  {t.essentiel && !t.fourni && <Chip size="small" color="warning" variant="outlined" label="Requis" sx={{ ml: 1 }} />}
                </Typography>
                <Button size="small" variant="outlined" disabled={!online || envoi === t.code}
                  startIcon={envoi === t.code ? <CircularProgress size={14} /> : <UploadFileIcon />} onClick={() => choisir(t.code)}>
                  {t.fourni ? 'Ajouter un autre' : 'Ajouter'}
                </Button>
              </Box>
              {docs.map((d) => (
                <Box key={d.id} display="flex" alignItems="center" gap={1} sx={{ pl: 4, mt: 0.5 }}>
                  <DescriptionIcon fontSize="small" color="action" />
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0, cursor: 'pointer', color: 'primary.main', wordBreak: 'break-all' }} onClick={() => ouvrir(d)}>
                    {d.nom_fichier}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{taille(d.taille)} · {new Date(d.date_ajout).toLocaleDateString('fr-FR')}</Typography>
                  <Tooltip title="Supprimer">
                    <span><IconButton size="small" color="error" disabled={!online} onClick={() => supprimer(d)}><DeleteOutlineIcon fontSize="small" /></IconButton></span>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          );
        })}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          PDF ou photo (JPG, PNG), 8 Mo maximum. Les documents sont confidentiels : seule la direction de l&apos;école peut les consulter.
        </Typography>
      </CardContent>
    </Card>
  );
}
