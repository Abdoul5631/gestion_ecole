import PropTypes from 'prop-types';
import Box from '@mui/material/Box';

/**
 * Document imprimable (bulletin, classement…) : sur téléphone il garde sa mise en page
 * et se fait défiler horizontalement au lieu de déborder de la page.
 * Le conteneur est EXTÉRIEUR à l'élément exporté en PDF (id="…-print").
 */
export default function ScrollableDoc({ children, minWidth = 720 }) {
  return (
    <Box sx={{ overflowX: 'auto', maxWidth: '100%', '& > *': { minWidth: { xs: minWidth, md: 0 } } }}>
      {children}
    </Box>
  );
}

ScrollableDoc.propTypes = { children: PropTypes.node, minWidth: PropTypes.number };
