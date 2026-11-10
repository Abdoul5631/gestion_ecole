from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from eleves.models import Eleve
from parametres.models import Parametres
from scolarite.models import AnneeScolaire, Classe, Inscription, Niveau


class MultiEcoleIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ecole_a = Parametres.objects.create(
            nom_ecole='Complexe Scolaire Wend-Panga',
            ville='Bobo-Dioulasso',
            statut=Parametres.STATUT_VALIDEE,
        )
        self.ecole_b = Parametres.objects.create(
            nom_ecole='École Test Banfora',
            ville='Banfora',
            statut=Parametres.STATUT_VALIDEE,
        )
        self.admin_a = User.objects.create_user(
            username='admin_wp', password='Ecole2025!', role='ADMIN', ecole=self.ecole_a,
        )
        self.admin_b = User.objects.create_user(
            username='admin_bf', password='Ecole2025!', role='ADMIN', ecole=self.ecole_b,
        )
        self.annee_a = AnneeScolaire.objects.create(
            libelle='2026-2027', is_active=True, ecole=self.ecole_a,
        )
        self.annee_b = AnneeScolaire.objects.create(
            libelle='2026-2027', is_active=True, ecole=self.ecole_b,
        )
        self.niv_a = Niveau.objects.create(nom='6ème', ecole=self.ecole_a)
        self.niv_b = Niveau.objects.create(nom='6ème', ecole=self.ecole_b)
        self.cl_a = Classe.objects.create(nom='6ème A', niveau=self.niv_a, ecole=self.ecole_a)
        self.cl_b = Classe.objects.create(nom='6ème A', niveau=self.niv_b, ecole=self.ecole_b)
        self.el_a = Eleve.objects.create(
            nom='Traoré', prenom='Moussa', matricule='WP-0001', ecole=self.ecole_a,
        )
        self.el_b = Eleve.objects.create(
            nom='Sanou', prenom='Awa', matricule='BAN-0001', ecole=self.ecole_b,
        )

    def _login(self, username):
        res = self.client.post(
            '/api/auth/login/',
            {'username': username, 'password': 'Ecole2025!'},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        return res.data

    def test_login_inclut_ecole_id(self):
        data = self._login('admin_wp')
        self.assertEqual(data['ecole_id'], self.ecole_a.id)
        self.assertEqual(data['ecole_nom'], 'Complexe Scolaire Wend-Panga')

    def test_admin_a_ne_voit_pas_eleves_b(self):
        self._login('admin_wp')
        res = self.client.get('/api/eleves/?tous=1')
        self.assertEqual(res.status_code, 200)
        items = res.data if isinstance(res.data, list) else res.data.get('results', [])
        ids = {e['id'] for e in items}
        self.assertIn(self.el_a.id, ids)
        self.assertNotIn(self.el_b.id, ids)

    def test_admin_b_ne_voit_pas_niveaux_a(self):
        self._login('admin_bf')
        res = self.client.get('/api/niveaux/')
        self.assertEqual(res.status_code, 200)
        items = res.data if isinstance(res.data, list) else res.data.get('results', [])
        ids = {n['id'] for n in items}
        self.assertIn(self.niv_b.id, ids)
        self.assertNotIn(self.niv_a.id, ids)

    def test_parametres_sont_ceux_de_lecole(self):
        self._login('admin_bf')
        res = self.client.get('/api/parametres/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['nom_ecole'], 'École Test Banfora')
        self.assertEqual(res.data['id'], self.ecole_b.id)

    def test_users_public_create_interdit(self):
        res = self.client.post(
            '/api/users/',
            {'username': 'intrus', 'password': 'secret12', 'role': 'ENSEIGNANT'},
            format='json',
        )
        self.assertIn(res.status_code, (401, 403))

    def test_creer_ecole_publique(self):
        res = self.client.post(
            '/api/ecoles/inscription/',
            {
                'nom_ecole': 'Collège de Dédougou',
                'ville': 'Dédougou',
                'telephone': '+226 20 00 00 00',
                'email': 'directeur@dedougou.bf',
                'directeur': 'Issa Kaboré',
                'telephone_directeur': '70 12 34 56',
                'statut_juridique': 'PRIVE_LAIC',
                'ordre_enseignement': 'POST_PRIMAIRE',
            },
            format='json',
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertNotIn('access', res.data)  # pas de connexion avant la validation
        ecole = Parametres.objects.get(nom_ecole='Collège de Dédougou')
        self.assertEqual(ecole.statut, Parametres.STATUT_EN_ATTENTE)
        self.assertEqual(ecole.statut_juridique, 'PRIVE_LAIC')
        user = User.objects.get(username='directeur@dedougou.bf')
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.ecole_id, ecole.id)
        self.assertEqual(user.role, 'ADMIN')
        self.assertFalse(user.is_plateforme)
        self.assertFalse(user.is_superuser)

    def test_admin_modifie_ses_parametres_seulement(self):
        self._login('admin_bf')
        res = self.client.put(
            '/api/parametres/',
            {'nom_ecole': 'Collège Banfora Nord', 'ville': 'Banfora', 'telephone': '70 00 00 00'},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.ecole_b.refresh_from_db()
        self.ecole_a.refresh_from_db()
        self.assertEqual(self.ecole_b.nom_ecole, 'Collège Banfora Nord')
        self.assertEqual(self.ecole_a.nom_ecole, 'Complexe Scolaire Wend-Panga')

    def test_suspendre_classe_avec_eleves_autorise(self):
        Inscription.objects.create(
            eleve=self.el_a, classe=self.cl_a, annee_scolaire=self.annee_a, ecole=self.ecole_a,
        )
        self._login('admin_wp')
        res = self.client.delete(f'/api/classes/{self.cl_a.id}/')
        self.assertEqual(res.status_code, 200)
        self.cl_a.refresh_from_db()
        self.assertFalse(self.cl_a.is_active)
        self.assertTrue(Classe.objects.filter(pk=self.cl_a.id).exists())
        self.assertIn('élève', res.data['detail'].lower())

    def test_suspendre_classe_vide_ok(self):
        self._login('admin_wp')
        res = self.client.delete(f'/api/classes/{self.cl_a.id}/')
        self.assertEqual(res.status_code, 200)
        self.cl_a.refresh_from_db()
        self.assertFalse(self.cl_a.is_active)
        self.assertTrue(Classe.objects.filter(pk=self.cl_a.id).exists())

    def test_admin_b_ne_peut_pas_supprimer_classe_a(self):
        self._login('admin_bf')
        res = self.client.delete(f'/api/classes/{self.cl_a.id}/')
        self.assertEqual(res.status_code, 404)
        self.assertTrue(Classe.objects.filter(pk=self.cl_a.id).exists())

    def test_suspendre_niveau_avec_eleves_autorise(self):
        Inscription.objects.create(
            eleve=self.el_a, classe=self.cl_a, annee_scolaire=self.annee_a, ecole=self.ecole_a,
        )
        self._login('admin_wp')
        res = self.client.delete(f'/api/niveaux/{self.niv_a.id}/')
        self.assertEqual(res.status_code, 200)
        self.niv_a.refresh_from_db()
        self.assertFalse(self.niv_a.is_active)
        self.assertTrue(Niveau.objects.filter(pk=self.niv_a.id).exists())

    def test_liste_classes_cache_suspendues(self):
        self.cl_a.is_active = False
        self.cl_a.save(update_fields=['is_active'])
        self._login('admin_wp')
        res = self.client.get('/api/classes/')
        self.assertEqual(res.status_code, 200)
        items = res.data if isinstance(res.data, list) else res.data.get('results', [])
        ids = {c['id'] for c in items}
        self.assertNotIn(self.cl_a.id, ids)
        res = self.client.get('/api/classes/?inclure_suspendus=1')
        items = res.data if isinstance(res.data, list) else res.data.get('results', [])
        ids = {c['id'] for c in items}
        self.assertIn(self.cl_a.id, ids)

    def test_reactiver_classe(self):
        self.cl_a.is_active = False
        self.cl_a.save(update_fields=['is_active'])
        self._login('admin_wp')
        res = self.client.post(f'/api/classes/{self.cl_a.id}/reactiver/')
        self.assertEqual(res.status_code, 200)
        self.cl_a.refresh_from_db()
        self.assertTrue(self.cl_a.is_active)

    def test_dernier_admin_non_suspendable(self):
        self._login('admin_wp')
        res = self.client.delete(f'/api/users/{self.admin_a.id}/')
        self.assertEqual(res.status_code, 409)
        self.admin_a.refresh_from_db()
        self.assertTrue(self.admin_a.is_active)

    def test_inscription_refuse_classe_suspendue(self):
        self.cl_a.is_active = False
        self.cl_a.save(update_fields=['is_active'])
        User.objects.create_user(username='secr_wp', password='Ecole2025!', role='SECRETAIRE', ecole=self.ecole_a)
        self._login('secr_wp')
        res = self.client.post('/api/inscriptions/', {
            'eleve': self.el_a.id,
            'classe': self.cl_a.id,
            'annee_scolaire': self.annee_a.id,
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_admin_ecole_ne_voit_pas_toutes_les_ecoles(self):
        self.admin_a.is_superuser = True
        self.admin_a.save(update_fields=['is_superuser'])
        self._login('admin_wp')
        res = self.client.get('/api/ecoles/')
        self.assertEqual(res.status_code, 403)


class ValidationEcolePlateformeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.filter(username='superadmin').first()
        if self.superadmin is None:
            self.superadmin = User.objects.create_user(
                username='superadmin',
                password='Ecole2025!',
                role='SUPER_ADMIN',
                is_plateforme=True,
                ecole=None,
                is_staff=True,
            )
        else:
            self.superadmin.role = 'SUPER_ADMIN'
            self.superadmin.is_plateforme = True
            self.superadmin.ecole = None
            self.superadmin.is_active = True
            self.superadmin.set_password('Ecole2025!')
            self.superadmin.save()
        self.ecole = Parametres.objects.create(
            nom_ecole='Collège de Koudougou',
            ville='Koudougou',
            statut=Parametres.STATUT_EN_ATTENTE,
        )
        self.directeur = User.objects.create_user(
            username='dir_kdg',
            password='Ecole2025!',
            role='ADMIN',
            ecole=self.ecole,
            is_plateforme=False,
        )

    def _login(self, username, password='Ecole2025!'):
        res = self.client.post(
            '/api/auth/login/',
            {'username': username, 'password': password},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        return res.data

    def test_attente_login_ok_mais_pedagogie_bloquee(self):
        data = self._login('dir_kdg')
        self.assertEqual(data['ecole_statut'], 'EN_ATTENTE')
        res = self.client.get('/api/eleves/')
        self.assertEqual(res.status_code, 403)
        self.assertIn('attente', res.json()['detail'].lower())
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['ecole_statut'], 'EN_ATTENTE')

    def test_superadmin_valide_puis_acces_ok(self):
        self._login('superadmin')
        res = self.client.get('/api/ecoles/')
        self.assertEqual(res.status_code, 200)
        ids = {e['id'] for e in res.data}
        self.assertIn(self.ecole.id, ids)
        res = self.client.post(f'/api/ecoles/{self.ecole.id}/valider/')
        self.assertEqual(res.status_code, 200, res.content)
        self.ecole.refresh_from_db()
        self.assertEqual(self.ecole.statut, Parametres.STATUT_VALIDEE)

        self.client.credentials()
        data = self._login('dir_kdg')
        self.assertEqual(data['ecole_statut'], 'VALIDEE')
        res = self.client.get('/api/eleves/')
        self.assertEqual(res.status_code, 200)

    def test_refus_bloque_login(self):
        self._login('superadmin')
        res = self.client.post(
            f'/api/ecoles/{self.ecole.id}/refuser/',
            {'motif': 'Établissement fictif'},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.client.credentials()
        res = self.client.post(
            '/api/auth/login/',
            {'username': 'dir_kdg', 'password': 'Ecole2025!'},
            format='json',
        )
        self.assertEqual(res.status_code, 401)
        self.assertIn('refus', str(res.data.get('detail', '')).lower())

    def test_suspendre_puis_reactiver(self):
        self.ecole.statut = Parametres.STATUT_VALIDEE
        self.ecole.save(update_fields=['statut'])
        self._login('superadmin')
        res = self.client.post(
            f'/api/ecoles/{self.ecole.id}/suspendre/',
            {'motif': 'Contrôle'},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.client.credentials()
        res = self.client.post(
            '/api/auth/login/',
            {'username': 'dir_kdg', 'password': 'Ecole2025!'},
            format='json',
        )
        self.assertEqual(res.status_code, 401)
        self._login('superadmin')
        res = self.client.post(f'/api/ecoles/{self.ecole.id}/reactiver/')
        self.assertEqual(res.status_code, 200)
        self.client.credentials()
        data = self._login('dir_kdg')
        self.assertEqual(data['ecole_statut'], 'VALIDEE')

    def test_refus_sans_motif_interdit(self):
        self._login('superadmin')
        res = self.client.post(f'/api/ecoles/{self.ecole.id}/refuser/', {}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_pas_de_suppression_ecole(self):
        self._login('superadmin')
        res = self.client.delete(f'/api/ecoles/{self.ecole.id}/')
        self.assertIn(res.status_code, (404, 405))
        self.assertTrue(Parametres.objects.filter(pk=self.ecole.id).exists())
