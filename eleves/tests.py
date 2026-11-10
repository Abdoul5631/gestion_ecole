from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from eleves.models import AppelJournalier, Eleve
from notifications.models import Notification
from parametres.models import Parametres
from scolarite.models import AnneeScolaire, Classe, Inscription, Niveau


class AppelJournalierTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ecole = Parametres.objects.create(
            nom_ecole='Complexe Scolaire Wend-Panga',
            statut=Parametres.STATUT_VALIDEE,
        )
        self.admin = User.objects.create_user(
            username='admin_wp', password='Ecole2025!', role='ADMIN', ecole=self.ecole,
        )
        self.annee = AnneeScolaire.objects.create(libelle='2026-2027', is_active=True, ecole=self.ecole)
        self.niveau = Niveau.objects.create(nom='6ème', ecole=self.ecole)
        self.classe = Classe.objects.create(nom='6ème A', niveau=self.niveau, ecole=self.ecole)
        self.eleve = Eleve.objects.create(
            nom='Ouédraogo', prenom='Awa', matricule='WP-APP-01', ecole=self.ecole,
            telephone_parent='70112233',
        )
        Inscription.objects.create(
            eleve=self.eleve, classe=self.classe, annee_scolaire=self.annee, ecole=self.ecole,
        )
        self.parent = User.objects.create_user(
            username='parent_awa', password='Ecole2025!', role='PARENT', ecole=self.ecole,
        )
        self.parent.enfants.add(self.eleve)
        User.objects.create_user(
            username='surv_wp', password='Ecole2025!', role='SURVEILLANT', ecole=self.ecole,
        )

    def _login(self, username, password='Ecole2025!'):
        res = self.client.post('/api/auth/login/', {'username': username, 'password': password}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")

    def test_saisie_appel_notifie_parent(self):
        self._login('surv_wp')
        jour = date(2026, 10, 5)
        res = self.client.post('/api/appels-journaliers/saisie-masse/', {
            'classe_id': self.classe.id,
            'date': jour.isoformat(),
            'presences': [{'eleve_id': self.eleve.id, 'statut': 'ABSENT'}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertTrue(AppelJournalier.objects.filter(eleve=self.eleve, date=jour, statut='ABSENT').exists())
        self.assertTrue(Notification.objects.filter(destinataire=self.parent, type='ABSENCE').exists())

    def test_parent_voit_appels_enfant(self):
        AppelJournalier.objects.create(
            eleve=self.eleve, classe=self.classe, date=date(2026, 10, 6),
            statut='ABSENT', ecole=self.ecole,
        )
        self._login('parent_awa')
        res = self.client.get(f'/api/eleves/{self.eleve.id}/appels/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['statut'], 'ABSENT')
