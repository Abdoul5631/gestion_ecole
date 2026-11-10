from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from caisse.models import DossierScolarite
from eleves.models import Eleve
from notifications.models import Notification, SmsOutbox
from parametres.models import Parametres
from scolarite.models import AnneeScolaire, Classe, Inscription, Niveau
from scolarite.utils import get_annee_active


class RelancerFraisAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ecole = Parametres.get()
        if self.ecole.statut != Parametres.STATUT_VALIDEE:
            self.ecole.statut = Parametres.STATUT_VALIDEE
            self.ecole.save(update_fields=['statut'])
        self.annee = get_annee_active(self.ecole)
        if self.annee is None:
            self.annee = AnneeScolaire.objects.create(
                libelle='2026-2027', is_active=True, ecole=self.ecole,
            )
        self.admin = User.objects.create_user(
            username='comptable_relance', password='pass1234', role='COMPTABLE',
            ecole=self.ecole,
        )
        self.parent = User.objects.create_user(
            username='parent_relance', password='pass1234', role='PARENT',
            ecole=self.ecole,
        )
        self.eleve = Eleve.objects.create(
            nom='Kaboré',
            prenom='Idrissa',
            matricule='2025-01267',
            telephone_parent='70123456',
            ecole=self.ecole,
        )
        self.parent.enfants.add(self.eleve)
        self.niveau = Niveau.objects.create(nom='1ère Relance', ecole=self.ecole)
        self.classe = Classe.objects.create(nom='1ère A', niveau=self.niveau, ecole=self.ecole)
        self.inscription = Inscription.objects.create(
            eleve=self.eleve, classe=self.classe, annee_scolaire=self.annee, ecole=self.ecole,
        )
        # le dossier est ouvert automatiquement à l'inscription : on fixe seulement sa situation
        self.dossier = DossierScolarite.objects.get(inscription=self.inscription)
        self.dossier.montant_du = 75000
        self.dossier.statut = 'PARTIEL'
        self.dossier.save()

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_relancer_cree_notification_et_sms(self):
        self._auth(self.admin)
        res = self.client.post(
            '/api/dossiers-scolarite/relancer/',
            {'dossier_ids': [self.dossier.id]},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.data['envoyes'], 1)
        self.assertEqual(
            res.data['message'],
            'Rappel envoyé au parent (visible dans Messages).',
        )
        notif = Notification.objects.get(destinataire=self.parent, type='FRAIS')
        self.assertIn('Rappel', notif.titre)
        self.assertEqual(notif.eleve_id, self.eleve.id)
        self.assertTrue(SmsOutbox.objects.filter(eleve=self.eleve, type='FRAIS').exists())

        self._auth(self.parent)
        inbox = self.client.get('/api/notifications/')
        self.assertEqual(inbox.status_code, 200)
        items = inbox.data if isinstance(inbox.data, list) else inbox.data.get('results', [])
        self.assertTrue(any(n['id'] == notif.id for n in items))
        unread = self.client.get('/api/notifications/non_lues/')
        self.assertGreaterEqual(unread.data['count'], 1)

    def test_relancer_sans_parent(self):
        self.parent.enfants.clear()
        self._auth(self.admin)
        res = self.client.post(
            '/api/dossiers-scolarite/relancer/',
            {'dossier_ids': [self.dossier.id]},
            format='json',
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.data['detail'], 'Aucun parent lié à cet élève')
        self.assertFalse(Notification.objects.filter(type='FRAIS').exists())

    def test_relancer_homonyme_doublon(self):
        """Parent lié à l'autre matricule (même nom, même classe) reçoit le rappel."""
        self.parent.enfants.clear()
        jumeau = Eleve.objects.create(
            nom='Kaboré', prenom='Idrissa', matricule='66-0127',
            telephone_parent='76654321',
            ecole=self.ecole,
        )
        Inscription.objects.create(
            eleve=jumeau, classe=self.classe, annee_scolaire=self.annee,
            ecole=self.ecole,
        )
        self.parent.enfants.add(jumeau)

        self._auth(self.admin)
        res = self.client.post(
            '/api/dossiers-scolarite/relancer/',
            {'dossier_ids': [self.dossier.id]},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(
            Notification.objects.filter(destinataire=self.parent, type='FRAIS').exists()
        )
