import { Navigate } from 'react-router-dom';

import MinimalLayout from 'layouts/minimalLayout';

const PagesRoutes = {
  path: 'pages',
  element: <MinimalLayout />,
  children: [
    {
      path: 'auth',
      children: [
        {
          path: 'login',
          element: <Navigate to="/login" replace />
        },
        {
          path: 'register',
          element: <Navigate to="/register" replace />
        }
      ]
    }
  ]
};

export default PagesRoutes;
