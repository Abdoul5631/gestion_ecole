import { RouterProvider } from 'react-router-dom';

// project imports
import ThemeCustomization from './themes';

import router from 'routes';
import PorteMaintenance from 'components/PorteMaintenance';
import ErreurGlobale from 'components/ErreurGlobale';

function App() {
  return (
    <ThemeCustomization>
      <PorteMaintenance>
        <RouterProvider router={router} />
        <ErreurGlobale />
      </PorteMaintenance>
    </ThemeCustomization>
  );
}

export default App;
