from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from eleves.models import Eleve
from parametres.models import Parametres
from scolarite.models import AnneeScolaire, Classe, Inscription, Niveau, Trimestre


class BulletinPdfTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ecole = Parametres.objects.create(
            nom_ecole='Complexe Scolaire Wend-Panga',
            ville='Bobo-Dioulasso',
            direction_regionale='DR-HOUE',
            direction_provinciale='DP-HOUET',
            statut=Parametres.STATUT_VALIDEE,
        )
        self.admin = User.objects.create_user(
            username='admin_wp', password='Ecole2025!', role='ADMIN', ecole=self.ecole,
        )
        self.annee = AnneeScolaire.objects.create(libelle='2026-2027', is_active=True, ecole=self.ecole)
        self.t1 = Trimestre.objects.create(nom='Trimestre 1', annee_scolaire=self.annee, ecole=self.ecole)
        self.t3 = Trimestre.objects.create(nom='Trimestre 3', annee_scolaire=self.annee, ecole=self.ecole)
        self.niveau = Niveau.objects.create(nom='6ème', ecole=self.ecole)
        self.classe = Classe.objects.create(nom='6ème A', niveau=self.niveau, ecole=self.ecole)
        self.eleve = Eleve.objects.create(
            nom='Sanou', prenom='Issa', matricule='WP-PDF-01', ecole=self.ecole,
        )
        Inscription.objects.create(
            eleve=self.eleve, classe=self.classe, annee_scolaire=self.annee, ecole=self.ecole,
        )

    def _login(self):
        res = self.client.post('/api/auth/login/', {'username': 'admin_wp', 'password': 'Ecole2025!'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")

    def test_bulletin_pdf_t1(self):
        self._login()
        res = self.client.get(f'/api/notes/bulletin-pdf/?eleve_id={self.eleve.id}&trimestre_id={self.t1.id}')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertTrue(res.content.startswith(b'%PDF'))

    def test_bulletin_json_t3_annuelle(self):
        self._login()
        res = self.client.get(f'/api/notes/bulletin/?eleve_id={self.eleve.id}&trimestre_id={self.t3.id}')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.data.get('est_trimestre_3'))
        self.assertIn('t1', res.data.get('moyennes_annuelles') or {})
        self.assertIn('annuelle', res.data.get('moyennes_annuelles') or {})
