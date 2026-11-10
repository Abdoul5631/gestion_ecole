// project imports
import CommonAuthLayout from './CommonAuthLayout';
import AuthLogin from 'sections/auth/AuthLogin';

// ==============================|| LOGIN ||============================== //

export default function Login() {
  return (
    <CommonAuthLayout
      title="Connexion"
      subHeading="Connectez-vous à votre espace école."
      footerLink={{ title: 'Créer un compte', link: '/register' }}
    >
      {/* Login form */}
      <AuthLogin />
    </CommonAuthLayout>
  );
}
