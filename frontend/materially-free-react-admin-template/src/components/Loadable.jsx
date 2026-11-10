import { Component, Suspense } from 'react';

// project imports
import Loader from './loader';
import { OfflineChunkFallback } from 'pages/errors/OfflineChunkError';
import { signalerErreur } from 'utils/signalerErreur';

/**
 * Catch les échecs de chunks lazy (hors ligne / SW périmé) avant le crash React.
 */
class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // hors ligne, c'est normal (page pas encore en cache) ; en ligne, c'est une vraie panne : on la remonte
    if (navigator.onLine) signalerErreur(error, 'Page impossible à afficher');
  }

  render() {
    if (this.state.hasError) {
      return <OfflineChunkFallback />;
    }
    return this.props.children;
  }
}

// ==============================|| LOADABLE - LAZY LOADING ||============================== //

/**
 * Higher-order component for lazy loading with suspense.
 *
 * @param Component - The component to be lazily loaded.
 * @returns A wrapped component with suspense fallback.
 */
export default function Loadable(Component) {
  return (props) => (
    <ChunkErrorBoundary>
      <Suspense fallback={<Loader />}>
        <Component {...props} />
      </Suspense>
    </ChunkErrorBoundary>
  );
}
