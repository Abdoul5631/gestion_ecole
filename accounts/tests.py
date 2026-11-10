from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from accounts.passwords import MOT_DE_PASSE_PARTAGE_INTERDIT, generer_mot_de_passe_temporaire
from eleves.models import Eleve
from parametres.models import Parametres


class SecuriteComptesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ecole = Parametres.objects.create(
            nom_ecole='Complexe Scolaire Wend-Panga',
            statut=Parametres.STATUT_VALIDEE,
        )
        self.admin = User.objects.create_user(
            username='admin_wp', password='Ecole2025!', role='ADMIN', ecole=self.ecole,
        )
        self.eleve = Eleve.objects.create(
            nom='Traoré', prenom='Moussa', matricule='WP-SEC-01', ecole=self.ecole,
        )

    def _login(self, username='admin_wp', password='Ecole2025!'):
        res = self.client.post('/api/auth/login/', {'username': username, 'password': password}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        return res.data

    def test_jwt_blacklist_installee(self):
        self.assertIn('rest_framework_simplejwt.token_blacklist', settings.INSTALLED_APPS)
        self.assertTrue(settings.SIMPLE_JWT.get('BLACKLIST_AFTER_ROTATION'))

    def test_post_users_public_interdit(self):
        res = self.client.post(
            '/api/users/',
            {'username': 'intrus', 'password': 'secret12', 'role': 'ENSEIGNANT'},
            format='json',
        )
        self.assertIn(res.status_code, (401, 403))
        self.assertFalse(User.objects.filter(username='intrus').exists())

    def test_admin_cree_eleve_mot_de_passe_unique(self):
        self._login()
        res = self.client.post('/api/users/', {
            'username': 'WP-SEC-01',
            'role': 'ELEVE',
            'eleve': self.eleve.id,
            'password': MOT_DE_PASSE_PARTAGE_INTERDIT,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        pwd = res.data.get('mot_de_passe_temporaire')
        self.assertTrue(pwd)
        self.assertNotEqual(pwd, MOT_DE_PASSE_PARTAGE_INTERDIT)
        user = User.objects.get(username='WP-SEC-01')
        self.assertTrue(user.must_change_password)
        self.assertTrue(user.check_password(pwd))

        self.client.credentials()
        login = self.client.post('/api/auth/login/', {'username': 'WP-SEC-01', 'password': pwd}, format='json')
        self.assertEqual(login.status_code, 200)
        self.assertTrue(login.data['must_change_password'])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        chg = self.client.post('/api/auth/change-password/', {'new_password': 'Nouveau#2026'}, format='json')
        self.assertEqual(chg.status_code, 200, chg.content)
        user.refresh_from_db()
        self.assertFalse(user.must_change_password)

    def test_admin_superuser_ne_voit_pas_toutes_les_ecoles(self):
        self.admin.is_superuser = True
        self.admin.save(update_fields=['is_superuser'])
        self._login()
        res = self.client.get('/api/ecoles/')
        self.assertEqual(res.status_code, 403)

    def test_generer_mot_de_passe_distinct(self):
        a = generer_mot_de_passe_temporaire()
        b = generer_mot_de_passe_temporaire()
        self.assertNotEqual(a, b)
        self.assertNotEqual(a, MOT_DE_PASSE_PARTAGE_INTERDIT)
