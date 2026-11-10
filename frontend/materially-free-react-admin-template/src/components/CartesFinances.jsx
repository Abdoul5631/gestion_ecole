import { Box, Card, CardContent, CircularProgress, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';

export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} F`;

function Carte({ titre, valeur, detail, couleur, icone, loading }) {
  return (
    <Card sx={{ background: couleur, color: 'white', height: '100%', borderRadius: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, mb: 0.5 }}>{titre}</Typography>
            {loading
              ? <CircularProgress size={26} sx={{ color: 'white' }} />
              : <Typography fontWeight="bold" lineHeight={1.2} sx={{ fontSize: { xs: '1.3rem', sm: '1.6rem' }, wordBreak: 'break-word' }}>{valeur}</Typography>}
            {detail && !loading && <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, mt: 0.5 }}>{detail}</Typography>}
          </Box>
          <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 2, width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {icone}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

/** Entrées, sorties, solde et reste à recouvrer de l'année (comptable : tableau de bord ; directeur : page Finances). */
export default function CartesFinances({ bilan, loading }) {
  const b = bilan || {};
  const solde = b.solde || 0;
  return (
    <Grid container spacing={1.5} sx={{ mb: 2 }}>
      <Grid size={{ xs: 6, md: 3 }}>
        <Carte loading={loading} titre="Entrées (scolarité)" valeur={fcfa(b.entrees)}
          detail={`Aujourd'hui : ${fcfa(b.aujourdhui?.entrees)}`}
          couleur="linear-gradient(135deg, #2e7d32, #66bb6a)" icone={<SouthWestIcon />} />
      </Grid>
      <Grid size={{ xs: 6, md: 3 }}>
        <Carte loading={loading} titre="Sorties (dépenses)" valeur={fcfa(b.sorties)}
          detail={`Aujourd'hui : ${fcfa(b.aujourdhui?.sorties)}`}
          couleur="linear-gradient(135deg, #c62828, #ef5350)" icone={<NorthEastIcon />} />
      </Grid>
      <Grid size={{ xs: 6, md: 3 }}>
        <Carte loading={loading} titre="Solde en caisse" valeur={`${solde < 0 ? '- ' : ''}${fcfa(Math.abs(solde))}`}
          detail={`Ce mois : ${fcfa((b.ce_mois?.entrees || 0) - (b.ce_mois?.sorties || 0))}`}
          couleur={solde < 0 ? 'linear-gradient(135deg, #e65100, #ff9800)' : 'linear-gradient(135deg, #1565c0, #42a5f5)'} icone={<AccountBalanceIcon />} />
      </Grid>
      <Grid size={{ xs: 6, md: 3 }}>
        <Carte loading={loading} titre="Reste à recouvrer" valeur={fcfa(b.reste_a_recouvrer)}
          detail={`${b.taux_recouvrement || 0} % encaissé · ${b.dossiers?.impaye || 0} impayé(s)`}
          couleur="linear-gradient(135deg, #6a1b9a, #ab47bc)" icone={<HourglassBottomIcon />} />
      </Grid>
    </Grid>
  );
}
