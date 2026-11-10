import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography
} from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import BadgeIcon from '@mui/icons-material/Badge';
import PrintIcon from '@mui/icons-material/Print';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { carteService, classeService, eleveService, parametresService, getResults } from 'services/api';
import ouvrirPdf from 'utils/ouvrirPdf';

import { useIsOnline } from 'offline/RequireOnline';

const COULEURS = ['#1976d2', '#1b5e20', '#c62828', '#6a1b9a', '#e65100', '#00695c', '#283593', '#37474f'];
const couleurOk = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '');

/** Charge l'aperçu PNG exact d'un modèle (même dessin que le PDF imprimé). */
function useApercu(modele, couleur, eleveId, echelle) {
  const [src, setSrc] = useState('');
  const [echec, setEchec] = useState('');
  useEffect(() => {
    let url = '';
    let actif = true;
    setEchec('');
    setSrc('');
    if (!modele) return undefined;
    const t = setTimeout(() => {
      carteService.apercu({ modele, couleur, ...(eleveId ? { eleve_id: eleveId } : {}), ...(echelle ? { echelle } : {}) })
        .then((res) => {
          if (!actif) return;
          url = URL.createObjectURL(res.data);
          setSrc(url);
        })
        .catch((err) => actif && setEchec(err?.response?.status ? `erreur ${err.response.status}` : 'serveur injoignable'));
    }, 150);
    return () => { actif = false; clearTimeout(t); if (url) URL.revokeObjectURL(url); };
  }, [modele, couleur, eleveId, echelle]);
  return { src, echec };
}

function VignetteModele({ modele, couleur, eleveId, choisi, onChoisir, onAgrandir }) {
  const { src, echec } = useApercu(modele.code, couleur, eleveId);
  return (
    <Card sx={{ borderRadius: 3, border: '3px solid', borderColor: choisi ? 'primary.main' : 'divider',
      boxShadow: choisi ? '0 4px 16px rgba(0,0,0,0.15)' : 'none', display: 'flex', flexDirection: 'column' }}>
      <Box onClick={() => onAgrandir(modele.code)} sx={{ p: 1.5, bgcolor: 'grey.100', display: 'flex', justifyContent: 'center',
        alignItems: 'center', height: 250, cursor: 'zoom-in', position: 'relative' }}>
        {src ? <Box component="img" src={src} alt={modele.nom} sx={{ maxWidth: '100%', maxHeight: '100%', boxShadow: 2, borderRadius: 1 }} />
          : echec ? <Typography variant="caption" color="text.secondary">Aperçu indisponible ({echec})</Typography>
            : <CircularProgress size={24} />}
        <Chip size="small" icon={<ZoomInIcon />} label="Agrandir" sx={{ position: 'absolute', right: 8, bottom: 8, bgcolor: 'white' }} />
      </Box>
      <CardContent sx={{ flex: 1, pb: 1 }}>
        <Typography fontWeight={700} fontSize={16}>{modele.nom}</Typography>
        <Typography variant="body2" color="text.secondary">{modele.description}</Typography>
      </CardContent>
      <Box sx={{ p: 1.5, pt: 0 }}>
        <Button fullWidth variant={choisi ? 'contained' : 'outlined'} color={choisi ? 'success' : 'primary'}
          startIcon={choisi ? <CheckCircleIcon /> : null} onClick={() => onChoisir(modele.code)}>
          {choisi ? 'Modèle utilisé' : 'Utiliser ce modèle'}
        </Button>
      </Box>
    </Card>
  );
}

/** Grand aperçu d'une carte : modèle ou carte réelle d'un élève. */
function FenetreApercu({ ouvert, modele, nomModele, couleur, eleve, choisi, onFermer, onChoisir, onImprimer }) {
  const { src, echec } = useApercu(ouvert ? modele : '', couleur, eleve?.id, 4);
  return (
    <Dialog open={Boolean(ouvert)} onClose={onFermer} maxWidth="md" fullWidth>
      <DialogTitle>
        {eleve ? `Carte de ${eleve.prenom} ${eleve.nom}` : `Modèle « ${nomModele} »`}
        {eleve && <Typography variant="body2" color="text.secondary">Modèle utilisé : {nomModele}</Typography>}
      </DialogTitle>
      <DialogContent sx={{ bgcolor: 'grey.100', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        {src ? <Box component="img" src={src} alt="Aperçu de la carte" sx={{ maxWidth: '100%', maxHeight: '70vh', boxShadow: 3, borderRadius: 1 }} />
          : echec ? <Typography color="text.secondary">Aperçu indisponible ({echec})</Typography> : <CircularProgress />}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onFermer}>Fermer</Button>
        <Box flex={1} />
        {onChoisir && !choisi && <Button variant="contained" onClick={onChoisir}>Utiliser ce modèle</Button>}
        {onChoisir && choisi && <Chip color="success" icon={<CheckCircleIcon />} label="Modèle utilisé" />}
        {onImprimer && <Button variant="contained" startIcon={<PrintIcon />} onClick={onImprimer}>Imprimer cette carte</Button>}
      </DialogActions>
    </Dialog>
  );
}

function dateFr(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR');
}

export default function CartesScolaires() {
  const online = useIsOnline();
  const fichierRef = useRef(null);
  const eleveCibleRef = useRef(null); // élève dont on envoie la photo

  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState('');
  const [eleves, setEleves] = useState([]);
  const [selection, setSelection] = useState(() => new Set());
  const [ecole, setEcole] = useState({});
  const [seulementSansPhoto, setSeulementSansPhoto] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [genere, setGenere] = useState(false);
  const [envoi, setEnvoi] = useState(null); // id de l'élève dont la photo est en cours d'envoi
  const [factices, setFactices] = useState(() => new Set()); // photos de 1 pixel (démo) : comptées comme absentes
  const aPhoto = (e) => Boolean(e.photo_url) && !factices.has(e.id);
  const [grand, setGrand] = useState(null); // { modele, eleve } : fenêtre d'aperçu agrandi
  const [modeles, setModeles] = useState([]);
  const [modele, setModele] = useState('classique');
  const [couleur, setCouleur] = useState('#1976d2');
  const [couleurSaisie, setCouleurSaisie] = useState('#1976d2');
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  // Modèles proposés + choix actuel de l'école
  useEffect(() => {
    carteService.modeles()
      .then((res) => {
        setModeles(res.data.modeles || []);
        setModele(res.data.modele);
        setCouleur(res.data.couleur);
        setCouleurSaisie(res.data.couleur);
      })
      .catch(() => {});
  }, []);

  const enregistrerChoix = async (patch) => {
    const avant = { modele, couleur };
    const suivant = { ...avant, ...patch };
    setModele(suivant.modele);
    setCouleur(suivant.couleur);
    setCouleurSaisie(suivant.couleur);
    try {
      await carteService.choisir({ modele_carte: suivant.modele, couleur_carte: suivant.couleur });
      setSucces('Modèle de carte enregistré.');
      setTimeout(() => setSucces(''), 2000);
    } catch {
      setModele(avant.modele);
      setCouleur(avant.couleur);
      setCouleurSaisie(avant.couleur);
      setErreur("Impossible d'enregistrer le modèle de carte.");
    }
  };

  // Classes d'examen + informations de l'école (logo, tampon, signature)
  useEffect(() => {
    Promise.all([classeService.getAll(), parametresService.get().catch(() => ({ data: {} }))])
      .then(([rc, rp]) => {
        const liste = getResults(rc).items.filter((c) => c.niveau_is_classe_examen && c.is_active !== false);
        liste.sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
        setClasses(liste);
        setEcole(rp.data || {});
        if (liste.length) setClasseId(String(liste[0].id));
      })
      .catch(() => setErreur('Impossible de charger les classes.'))
      .finally(() => setChargement(false));
  }, []);

  // Élèves de la classe choisie
  useEffect(() => {
    if (!classeId) { setEleves([]); return; }
    setChargement(true);
    setSelection(new Set());
    eleveService.getAll(`/eleves/?classe_id=${classeId}&page_size=300`)
      .then((res) => {
        const liste = getResults(res).items.filter((e) => e.is_active !== false);
        liste.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));
        setEleves(liste);
      })
      .catch(() => setErreur('Impossible de charger les élèves de la classe.'))
      .finally(() => setChargement(false));
  }, [classeId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sansPhoto = useMemo(() => eleves.filter((e) => !aPhoto(e)), [eleves, factices]);
  const visibles = useMemo(() => (seulementSansPhoto ? sansPhoto : eleves), [eleves, sansPhoto, seulementSansPhoto]);
  const classe = classes.find((c) => String(c.id) === String(classeId));
  const assetsManquants = [
    !ecole.logo_url && 'le logo',
    !ecole.tampon_url && 'le tampon',
    !ecole.signature_url && 'la signature',
  ].filter(Boolean);

  const basculer = (id) => setSelection((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toutSelectionner = () => setSelection(new Set(visibles.map((e) => e.id)));
  const toutDeselectionner = () => setSelection(new Set());

  const imprimer = async (ids) => {
    const concernes = ids?.length ? eleves.filter((e) => ids.includes(e.id)) : eleves;
    const manque = concernes.filter((e) => !aPhoto(e)).length;
    if (manque > 0 && !window.confirm(`${manque} élève(s) n'ont pas de photo : leur carte aura un cadre vide. Imprimer quand même ?`)) return;
    setGenere(true);
    setErreur('');
    try {
      await ouvrirPdf(classeService.cartes(classeId, ids, { modele, couleur }));
    } catch (err) {
      setErreur(err.message);
    } finally {
      setGenere(false);
    }
  };

  const apercu = (eleve) => setGrand({ modele, eleve });
  const imprimerUne = async (eleve) => {
    try {
      await ouvrirPdf(eleveService.carte(eleve.id, { modele, couleur }));
    } catch (err) {
      setErreur(err.message);
    }
  };
  const nomDe = (code) => modeles.find((m) => m.code === code)?.nom || code;

  const choisirPhoto = (eleve) => {
    eleveCibleRef.current = eleve;
    fichierRef.current?.click();
  };

  const envoyerPhoto = async (e) => {
    const fichier = e.target.files?.[0];
    const eleve = eleveCibleRef.current;
    e.target.value = '';
    if (!fichier || !eleve) return;
    setEnvoi(eleve.id);
    setErreur('');
    try {
      const fd = new FormData();
      fd.append('photo', fichier);
      const res = await eleveService.patch(eleve.id, fd);
      setFactices((prev) => { const n = new Set(prev); n.delete(eleve.id); return n; });
      setEleves((prev) => prev.map((x) => (x.id === eleve.id ? { ...x, photo_url: res.data.photo_url } : x)));
      setSucces(`Photo de ${eleve.prenom} ${eleve.nom} enregistrée.`);
      setTimeout(() => setSucces(''), 3000);
    } catch (err) {
      setErreur(err?.response?.data?.photo?.[0] || err?.response?.data?.detail || "Impossible d'envoyer la photo.");
    } finally {
      setEnvoi(null);
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={0.5}>
        <BadgeIcon sx={{ color: 'primary.main', fontSize: 32 }} />
        <Typography variant="h3" fontWeight="bold">Cartes scolaires</Typography>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Cartes des élèves des classes d&apos;examen (3ème, Terminale…) : vérifiez les photos, puis imprimez la classe ou une sélection.
      </Typography>

      {erreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}
      {succes && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}>{succes}</Alert>}
      {!online && <Alert severity="warning" sx={{ mb: 2 }}>Serveur injoignable : impossible de générer les cartes pour le moment.</Alert>}

      {assetsManquants.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Pour une carte plus complète, demandez au directeur d&apos;ajouter {assetsManquants.join(', ')} de l&apos;école dans les paramètres.
        </Alert>
      )}

      <input ref={fichierRef} type="file" accept="image/*" capture="user" hidden onChange={envoyerPhoto} />

      {classes.length === 0 && !chargement ? (
        <Alert severity="warning">
          Aucune classe d&apos;examen dans votre école. Marquez un niveau comme « classe d&apos;examen » dans Paramètres, onglet Niveaux.
        </Alert>
      ) : (
        <>
          <Card sx={{ mb: 2, borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <CardContent>
              <Typography variant="h5" fontWeight={700}>Étape 1 — Choisissez le modèle de carte</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Cliquez sur une image pour l&apos;agrandir, puis sur « Utiliser ce modèle ». Ce modèle sera appliqué à toutes les cartes que vous imprimerez
                (vous pouvez en changer à tout moment). Les aperçus montrent un vrai élève de la classe, avec le logo et les informations de votre école.
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(4, 1fr)' } }}>
                {modeles.map((m) => (
                  <VignetteModele key={m.code} modele={m} couleur={couleur} eleveId={eleves[0]?.id}
                    choisi={modele === m.code} onChoisir={(code) => enregistrerChoix({ modele: code })}
                    onAgrandir={(code) => setGrand({ modele: code, eleve: null })} />
                ))}
              </Box>
              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mt={2}>
                <Typography variant="body2" fontWeight={600} sx={{ mr: 1 }}>Couleur :</Typography>
                {COULEURS.map((c) => (
                  <Box key={c} role="button" aria-label={`Couleur ${c}`} tabIndex={0} onClick={() => enregistrerChoix({ couleur: c })}
                    onKeyDown={(e) => { if (e.key === 'Enter') enregistrerChoix({ couleur: c }); }}
                    sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                      border: '3px solid', borderColor: couleur.toLowerCase() === c ? 'text.primary' : 'transparent' }} />
                ))}
                <TextField size="small" label="Autre (#RRGGBB)" value={couleurSaisie} sx={{ width: 150, ml: 1 }}
                  error={!couleurOk(couleurSaisie)}
                  onChange={(e) => setCouleurSaisie(e.target.value)}
                  onBlur={() => { if (couleurOk(couleurSaisie) && couleurSaisie !== couleur) enregistrerChoix({ couleur: couleurSaisie }); else setCouleurSaisie(couleur); }} />
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ mb: 2, borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <CardContent>
              <Typography variant="h5" fontWeight={700}>Étape 2 — Choisissez la classe et imprimez</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Vérifiez les photos ci-dessous (bouton appareil photo pour en ajouter), puis imprimez toute la classe ou seulement les élèves cochés.
                Le PDF s&apos;ouvre dans un nouvel onglet : imprimez-le sur du papier cartonné et découpez suivant les pointillés.
              </Typography>
              <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 2 }}>
                Modèle utilisé pour l&apos;impression : <b>{nomDe(modele)}</b> — couleur <Box component="span" sx={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', bgcolor: couleur, verticalAlign: 'middle', border: '1px solid #999' }} />
              </Alert>
              <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
                <TextField select size="small" label="Classe" value={classeId} onChange={(e) => setClasseId(e.target.value)} sx={{ minWidth: 200 }}>
                  {classes.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.nom}</MenuItem>)}
                </TextField>
                <Chip label={`${eleves.length} élève${eleves.length > 1 ? 's' : ''}`} variant="outlined" />
                <Chip label={`${eleves.length - sansPhoto.length} avec photo`} color="success" variant="outlined" />
                {sansPhoto.length > 0 && (
                  <Chip label={`${sansPhoto.length} sans photo`} color="warning" clickable
                    variant={seulementSansPhoto ? 'filled' : 'outlined'} onClick={() => setSeulementSansPhoto(!seulementSansPhoto)} />
                )}
                <Box flex={1} />
                <Button variant="contained" startIcon={genere ? <CircularProgress size={16} color="inherit" /> : <PrintIcon />}
                  disabled={!online || genere || eleves.length === 0} onClick={() => imprimer(null)}>
                  Imprimer toute la classe ({eleves.length})
                </Button>
                <Button variant="outlined" startIcon={<PrintIcon />}
                  disabled={!online || genere || selection.size === 0} onClick={() => imprimer([...selection])}>
                  Imprimer la sélection ({selection.size})
                </Button>
              </Box>
              <Box display="flex" gap={1} mt={1.5}>
                <Button size="small" onClick={toutSelectionner} disabled={visibles.length === 0}>Tout sélectionner</Button>
                <Button size="small" onClick={toutDeselectionner} disabled={selection.size === 0}>Tout désélectionner</Button>
              </Box>
            </CardContent>
          </Card>

          {chargement ? (
            <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
          ) : visibles.length === 0 ? (
            <Alert severity="info">
              {seulementSansPhoto ? 'Tous les élèves de cette classe ont une photo.' : `Aucun élève inscrit en ${classe?.nom || 'cette classe'}.`}
            </Alert>
          ) : (
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr' } }}>
              {visibles.map((e) => (
                <Card key={e.id} sx={{ borderRadius: 3, boxShadow: '0 2px 10px rgba(0,0,0,0.07)', outline: selection.has(e.id) ? '2px solid' : 'none', outlineColor: 'primary.main' }}>
                  <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar variant="rounded" src={aPhoto(e) ? e.photo_url : undefined}
                        imgProps={{
                          onLoad: (ev) => {
                            if (ev.target.naturalWidth < 40) setFactices((prev) => new Set(prev).add(e.id));
                          },
                        }}
                        sx={{ width: 64, height: 80, bgcolor: aPhoto(e) ? 'transparent' : 'grey.200', color: 'grey.500', fontSize: 12 }}>
                        {!aPhoto(e) && 'PHOTO'}
                      </Avatar>
                      <Tooltip title={aPhoto(e) ? 'Changer la photo' : 'Ajouter une photo'}>
                        <span>
                          <IconButton size="small" disabled={!online || envoi === e.id} onClick={() => choisirPhoto(e)}
                            sx={{ position: 'absolute', right: -8, bottom: -8, bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' }, width: 28, height: 28 }}>
                            {envoi === e.id ? <CircularProgress size={14} color="inherit" /> : <PhotoCameraIcon sx={{ fontSize: 16 }} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography fontWeight={700} sx={{ wordBreak: 'break-word' }}>{e.nom} {e.prenom}</Typography>
                      <Typography variant="body2" color="text.secondary">Matricule : {e.matricule}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {e.date_naissance ? `Né(e) le ${dateFr(e.date_naissance)}` : 'Date de naissance manquante'}
                      </Typography>
                    </Box>
                    <Box display="flex" flexDirection="column" alignItems="center">
                      <Checkbox checked={selection.has(e.id)} onChange={() => basculer(e.id)} inputProps={{ 'aria-label': 'Sélectionner' }} />
                      <Tooltip title="Voir sa carte">
                        <span>
                          <IconButton size="small" disabled={!online} onClick={() => apercu(e)}><VisibilityIcon fontSize="small" /></IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </>
      )}
      <FenetreApercu ouvert={Boolean(grand)} modele={grand?.modele || modele} nomModele={nomDe(grand?.modele || modele)}
        couleur={couleur} eleve={grand?.eleve || null} choisi={(grand?.modele || modele) === modele}
        onFermer={() => setGrand(null)}
        onChoisir={grand && !grand.eleve ? () => { enregistrerChoix({ modele: grand.modele }); setGrand(null); } : null}
        onImprimer={grand?.eleve ? () => imprimerUne(grand.eleve) : null} />
    </Box>
  );
}
