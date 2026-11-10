import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';

const dashboard = {
  id: 'dashboard',
  title: 'Accueil',
  type: 'group',
  children: [
    {
      id: 'dashboards',
      title: 'Tableau de bord',
      type: 'item',
      icon: HomeOutlinedIcon,
      url: '/dashboard/default',
      breadcrumbs: false
    }
  ]
};

export default dashboard;
