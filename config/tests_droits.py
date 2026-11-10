"""Tests des droits d'accès.

1. La politique écrite (config/droits.py) doit correspondre exactement à l'API réelle.
2. La matrice complète (config/matrice_droits.json) ne change que par décision explicite :
   après une modification voulue, relire puis régénérer avec
       python manage.py audit_permissions --json > config/matrice_droits.json
3. Les attaques connues restent impossibles (élève qui saisit des notes, enseignant d'une autre
   école, injection d'identifiants entre écoles, école non validée…).
"""
import json
from pathlib import Path

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.audit import droits_par_vue, matrice_permissions
from accounts.models import User
from config.droits import DROITS
from cours.models import ClasseMatiere, Enseignant, Matiere
from eleves.models import Eleve
from evaluations.models import Evaluation
from parametres.models import Parametres
from scolarite.models import AnneeScolaire, Classe, Inscription, Niveau, Trimestre


def _ecole(nom, statut=Parametres.STATUT_VALIDEE):
    e = Parametres.objects.create(nom_ecole=nom, statut=statut)
    annee = AnneeScolaire.objects.create(libelle='2026-2027', is_active=True, ecole=e)
    tri = Trimestre.objects.create(nom='Trimestre 1', annee_scolaire=annee, ecole=e)
    niveau = Niveau.objects.create(nom='6ème', ecole=e)
    classe = Classe.objects.create(nom='6ème A', niveau=niveau, ecole=e)
    matiere = Matiere.objects.create(nom='Maths', ecole=e)
    prof = Enseignant.objects.create(nom='Prof', ecole=e)
    cm = ClasseMatiere.objects.create(classe=classe, matiere=matiere, enseignant=prof, coef=2, ecole=e)
    ev = Evaluation.objects.create(type='DEVOIR1', trimestre=tri, classe_matiere=cm, ecole=e)
    eleve = Eleve.objects.create(nom='Élève', prenom='Un', matricule=f'M-{e.pk}', ecole=e)
    Inscription.objects.create(eleve=eleve, classe=classe, annee_scolaire=annee, ecole=e)

    def user(username, role, **kw):
        return User.objects.create_user(username=username, password='x', role=role, ecole=e, **kw)

    return {
        'ecole': e, 'annee': annee, 'trimestre': tri, 'classe': classe, 'cm': cm, 'eval': ev, 'eleve': eleve, 'prof': prof,
        'admin': user(f'admin{e.pk}', 'ADMIN'),
        'enseignant': user(f'ens{e.pk}', 'ENSEIGNANT', enseignant=prof),
        'eleve_user': user(f'ele{e.pk}', 'ELEVE', eleve=eleve),
        'parent': (lambda p: (p.enfants.add(eleve), p)[1])(user(f'par{e.pk}', 'PARENT')),
    }


def _secretaire(ecole_dict):
    """Secrétaire d'une école de test (créé à la demande pour ne pas fausser les décomptes par rôle)."""
    return User.objects.create_user(username=f"sec{ecole_dict['ecole'].pk}", password='x', role='SECRETAIRE', ecole=ecole_dict['ecole'])


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class PolitiqueDesDroitsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = _ecole('École A')
        cls.super = User.objects.create_user(username='super', password='x', role='SUPER_ADMIN', is_plateforme=True)

    def test_chaque_vue_et_action_est_declaree_et_conforme(self):
        reel = droits_par_vue()
        ecarts = []
        for vue, actions in reel.items():
            if vue not in DROITS:
                ecarts.append(f'vue non déclarée dans config/droits.py : {vue}')
                continue
            for action, roles in actions.items():
                attendu = set(DROITS[vue].get(action, ()))
                if roles != attendu:
                    ecarts.append(f'{vue}.{action} : réel {sorted(roles)} ≠ politique {sorted(attendu)}')
        for vue, actions in DROITS.items():
            for action in actions:
                if action not in reel.get(vue, {}):
                    ecarts.append(f'déclaré mais absent de l\'API : {vue}.{action}')
        self.assertEqual(ecarts, [], '\n'.join(ecarts))

    def test_matrice_complete_inchangee(self):
        chemin = Path(__file__).with_name('matrice_droits.json')
        reference = json.loads(chemin.read_text(encoding='utf-8'))
        actuelle = matrice_permissions()
        diff = [f'{k}: {reference.get(k)} → {actuelle.get(k)}'
                for k in sorted(set(reference) | set(actuelle)) if reference.get(k) != actuelle.get(k)]
        self.assertEqual(diff, [], 'Droits modifiés — vérifier puis régénérer config/matrice_droits.json :\n' + '\n'.join(diff))


class AttaquesConnuesTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = _ecole('École A')
        cls.b = _ecole('École B')
        cls.attente = _ecole('École en attente', statut=Parametres.STATUT_EN_ATTENTE)

    # ── rôles ────────────────────────────────────────────────────────────────────────────────────
    def test_le_directeur_corrige_le_nom_d_un_eleve_et_rien_d_autre(self):
        url = f"/api/eleves/{self.a['eleve'].id}/corriger-nom/"
        r = _client(self.a['admin']).patch(url, {'nom': ' Ouédraogo ', 'prenom': 'Aminata', 'matricule': 'HACK'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.a['eleve'].refresh_from_db()
        self.assertEqual((self.a['eleve'].nom, self.a['eleve'].prenom), ('Ouédraogo', 'Aminata'))
        self.assertNotEqual(self.a['eleve'].matricule, 'HACK')
        self.assertEqual(_client(self.a['admin']).patch(url, {'nom': ' '}, format='json').status_code, 400)
        # modification complète de la fiche toujours interdite au directeur ; autre école et autres rôles refusés
        self.assertEqual(_client(self.a['admin']).patch(f"/api/eleves/{self.a['eleve'].id}/", {'nom': 'X'}, format='json').status_code, 403)
        self.assertEqual(_client(self.b['admin']).patch(url, {'nom': 'X'}, format='json').status_code, 404)
        for qui in ('enseignant', 'eleve_user', 'parent'):
            self.assertEqual(_client(self.a[qui]).patch(url, {'nom': 'X'}, format='json').status_code, 403, qui)

    def test_le_directeur_affecte_et_retire_un_cours_a_un_enseignant(self):
        admin = _client(self.a['admin'])
        cm = self.a['cm']
        r = admin.patch(f'/api/classe-matieres/{cm.id}/', {'enseignant': None}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        cm.refresh_from_db()
        self.assertIsNone(cm.enseignant_id)
        r = admin.patch(f'/api/classe-matieres/{cm.id}/', {'enseignant': self.a['prof'].id}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        # un enseignant d'une autre école ne peut pas être affecté
        r = admin.patch(f'/api/classe-matieres/{cm.id}/', {'enseignant': self.b['prof'].id}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(_client(self.a['enseignant']).patch(f'/api/classe-matieres/{cm.id}/', {'enseignant': None}, format='json').status_code, 403)

    def test_un_eleve_ou_parent_ne_saisit_ni_notes_ni_presences(self):
        for qui in ('eleve_user', 'parent'):
            c = _client(self.a[qui])
            r = c.post('/api/notes/saisie-masse/', {'evaluation_id': self.a['eval'].id, 'notes': [
                {'eleve_id': self.a['eleve'].id, 'valeur': 20}]}, format='json')
            self.assertEqual(r.status_code, 403, f'{qui} saisit des notes')
            r = c.post('/api/presences/saisie-masse/', {'classe_matiere_id': self.a['cm'].id, 'date': '2026-10-19',
                                                       'presences': [{'eleve_id': self.a['eleve'].id, 'statut': 'ABSENT'}]}, format='json')
            self.assertEqual(r.status_code, 403, f'{qui} saisit des présences')

    def test_actions_de_direction_interdites_aux_autres_roles(self):
        e = self.a['eleve']
        for qui in ('eleve_user', 'parent', 'enseignant'):
            c = _client(self.a[qui])
            for methode, url in [
                ('post', '/api/eleves/creer-comptes-parents/'),
                ('post', '/api/notes/publier-bulletin/'),
                ('get', f'/api/eleves/{e.id}/carte/'),
                ('get', '/api/users/'),
                ('get', '/api/sauvegarde/'),
                ('get', '/api/tarifs/'),
                ('get', '/api/cartes/modeles/'),
                ('get', f'/api/eleves/{e.id}/documents/'),
                ('get', '/api/cartes/apercu/?modele=moderne'),
            ]:
                self.assertEqual(getattr(c, methode)(url).status_code, 403, f'{qui} {methode} {url}')

    def test_un_eleve_ne_modifie_ni_ne_supprime_un_dossier_de_frais(self):
        c = _client(self.a['eleve_user'])
        self.assertEqual(c.put('/api/dossiers-scolarite/1/', {}, format='json').status_code, 403)
        self.assertEqual(c.delete('/api/dossiers-scolarite/1/').status_code, 403)

    def test_un_eleve_ne_lit_pas_les_notes_de_ses_camarades(self):
        r = _client(self.a['eleve_user']).get(f"/api/evaluations/{self.a['eval'].id}/notes/")
        self.assertEqual(r.status_code, 403)

    def test_un_enseignant_ne_note_que_ses_cours(self):
        autre_prof = Enseignant.objects.create(nom='Autre', ecole=self.a['ecole'])
        autre_user = User.objects.create_user(username='autre', password='x', role='ENSEIGNANT', ecole=self.a['ecole'], enseignant=autre_prof)
        r = _client(autre_user).post('/api/notes/saisie-masse/', {'evaluation_id': self.a['eval'].id, 'notes': [
            {'eleve_id': self.a['eleve'].id, 'valeur': 15}]}, format='json')
        self.assertEqual(r.status_code, 403)
        ok = _client(self.a['enseignant']).post('/api/notes/saisie-masse/', {'evaluation_id': self.a['eval'].id, 'notes': [
            {'eleve_id': self.a['eleve'].id, 'valeur': 15}]}, format='json')
        self.assertEqual(ok.status_code, 201)

    def test_note_hors_bareme_refusee(self):
        r = _client(self.a['enseignant']).post('/api/notes/saisie-masse/', {'evaluation_id': self.a['eval'].id, 'notes': [
            {'eleve_id': self.a['eleve'].id, 'valeur': 99}]}, format='json')
        self.assertEqual(r.status_code, 400)

    # ── écoles ───────────────────────────────────────────────────────────────────────────────────
    def test_une_ecole_ne_voit_ni_ne_modifie_une_autre(self):
        c = _client(self.b['admin'])
        self.assertEqual(c.get(f"/api/eleves/{self.a['eleve'].id}/").status_code, 404)
        prof_b = _client(self.b['enseignant'])
        self.assertEqual(prof_b.post('/api/notes/saisie-masse/', {'evaluation_id': self.a['eval'].id, 'notes': [
            {'eleve_id': self.a['eleve'].id, 'valeur': 10}]}, format='json').status_code, 404)

    def test_injection_d_identifiants_d_une_autre_ecole_refusee(self):
        c = _client(self.b['admin'])
        r = _client(_secretaire(self.b)).post('/api/inscriptions/', {'eleve': self.a['eleve'].id, 'classe': self.b['classe'].id}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        r = c.post('/api/classe-matieres/', {'classe': self.a['classe'].id, 'matiere': self.b['cm'].matiere_id, 'coef': 1}, format='json')
        self.assertEqual(r.status_code, 400, r.content)

    def test_reinscription_et_relance_limitees_a_l_ecole(self):
        c = _client(_secretaire(self.b))
        r = c.post('/api/inscriptions/reinscription/', {'annee_cible_id': self.b['annee'].id, 'items': [
            {'eleve_id': self.a['eleve'].id, 'classe_id': self.b['classe'].id}]}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['created'], 0)
        self.assertFalse(Inscription.objects.filter(eleve=self.a['eleve'], annee_scolaire=self.b['annee']).exists())

    def test_ecole_en_attente_ne_donne_pas_acces_aux_donnees(self):
        for qui in ('admin', 'enseignant'):
            self.assertEqual(_client(self.attente[qui]).get('/api/eleves/').status_code, 403, qui)

    # ── essais de mots de passe ──────────────────────────────────────────────────────────────────
    @override_settings(THROTTLES_DESACTIVES=False)
    def test_essais_repetes_de_connexion_freines(self):
        from django.core.cache import cache
        cache.clear()
        c = APIClient()
        codes = [c.post('/api/auth/login/', {'username': 'inconnu-test', 'password': 'x'}, format='json').status_code
                 for _ in range(10)]
        self.assertEqual(codes[:8], [401] * 8)
        self.assertEqual(codes[8:], [429, 429])
        # un autre compte n'est pas touché
        self.assertEqual(c.post('/api/auth/login/', {'username': self.a['admin'].username, 'password': 'mauvais'}, format='json').status_code, 401)
        cache.clear()

    # ── confidentialité ──────────────────────────────────────────────────────────────────────────
    def test_coordonnees_enseignant_masquees_hors_direction(self):
        prof = self.a['prof']
        prof.telephone = '22670123456'; prof.save()
        vu_par_admin = _client(self.a['admin']).get(f'/api/enseignants/{prof.id}/').json()
        self.assertEqual(vu_par_admin.get('telephone'), '22670123456')
        autre = Enseignant.objects.create(nom='Autre', ecole=self.a['ecole'])
        u = User.objects.create_user(username='autre2', password='x', role='ENSEIGNANT', ecole=self.a['ecole'], enseignant=autre)
        vu_par_collegue = _client(u).get(f'/api/enseignants/{prof.id}/')
        # un collègue ne voit que sa propre fiche (404) : ses coordonnées ne fuient jamais
        self.assertEqual(vu_par_collegue.status_code, 404)

    def test_les_camarades_n_exposent_pas_le_matricule(self):
        r = _client(self.a['eleve_user']).get('/api/eleves/ma-classe/')
        self.assertEqual(r.status_code, 200)
        for camarade in r.json().get('camarades', []):
            self.assertNotIn('matricule', camarade)

    def test_cartes_scolaires_entierement_au_secretaire(self):
        e = self.a['eleve']
        classe = self.a['classe'].id
        secr, admin = _client(_secretaire(self.a)), _client(self.a['admin'])
        adresses = [('get', '/api/cartes/modeles/'), ('get', '/api/cartes/apercu/?modele=moderne'),
                    ('put', '/api/cartes/choix/'), ('get', f'/api/classes/{classe}/cartes-apercu/'),
                    ('get', f'/api/classes/{classe}/cartes/'), ('get', f'/api/eleves/{e.id}/carte/')]
        for methode, url in adresses:   # le directeur n'a plus rien à faire avec les cartes
            self.assertEqual(getattr(admin, methode)(url).status_code, 403, f'admin {methode} {url}')
        self.assertEqual(secr.get('/api/cartes/apercu/?modele=moderne').status_code, 200)
        self.assertEqual(secr.get(f'/api/classes/{classe}/cartes-apercu/').status_code, 200)
        self.assertNotEqual(secr.get(f'/api/eleves/{e.id}/carte/').status_code, 403)
        # le secrétaire choisit le modèle, sans pouvoir toucher aux autres paramètres de l'école
        r = secr.put('/api/cartes/choix/', {'modele_carte': 'moderne', 'couleur_carte': '#c62828', 'nom_ecole': 'Piraté'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['modele'], 'moderne')
        self.a['ecole'].refresh_from_db()
        self.assertNotEqual(self.a['ecole'].nom_ecole, 'Piraté')
        self.assertEqual(secr.put('/api/cartes/choix/', {'modele_carte': 'inexistant'}, format='json').status_code, 400)
        self.assertEqual(secr.put('/api/parametres/', {'modele_carte': 'moderne'}, format='json').status_code, 403)

    def test_apercu_carte_pour_le_secretariat(self):
        c = _client(_secretaire(self.a))
        r = c.get('/api/cartes/apercu/?modele=moderne&couleur=%23c62828')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.content[1:4], b'PNG')
        self.assertEqual(len(c.get('/api/cartes/modeles/').json()['modeles']), 4)

    def test_dossier_administratif_reserve_a_la_direction_de_l_ecole(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        eid = self.a['eleve'].id
        admin = _client(self.a['admin'])
        fichier = SimpleUploadedFile('acte.pdf', b'%PDF-1.4 test', content_type='application/pdf')
        r = admin.post(f'/api/eleves/{eid}/documents/', {'type': 'ACTE_NAISSANCE', 'fichier': fichier}, format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        doc_id = r.json()['id']
        liste = admin.get(f'/api/eleves/{eid}/documents/').json()
        self.assertEqual(len(liste['documents']), 1)
        self.assertNotIn('Acte / extrait de naissance', liste['manquants'])
        lecture = admin.get(f'/api/eleves/{eid}/documents/{doc_id}/')
        self.assertEqual(lecture.status_code, 200)
        b''.join(lecture.streaming_content)  # Windows : lit tout, ce qui ferme le fichier avant la suppression
        # format refusé
        mauvais = SimpleUploadedFile('virus.exe', b'MZ', content_type='application/octet-stream')
        self.assertEqual(admin.post(f'/api/eleves/{eid}/documents/', {'type': 'AUTRE', 'fichier': mauvais}, format='multipart').status_code, 400)
        # les autres rôles et l'autre école n'y ont pas accès
        for qui in ('eleve_user', 'parent', 'enseignant'):
            self.assertEqual(_client(self.a[qui]).get(f'/api/eleves/{eid}/documents/{doc_id}/').status_code, 403, qui)
        self.assertEqual(_client(self.b['admin']).get(f'/api/eleves/{eid}/documents/{doc_id}/').status_code, 404)
        self.assertEqual(admin.delete(f'/api/eleves/{eid}/documents/{doc_id}/').status_code, 204)

    def test_pieces_d_une_inscription_en_ligne_suivent_l_eleve(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from eleves.models import DocumentEleve
        ecole = self.a['ecole']
        ecole.vitrine_active = True
        ecole.ensure_slug()
        ecole.save()
        niveau = self.a['classe'].niveau
        public = APIClient()
        r = public.post(f'/api/vitrine/{ecole.slug}/dossiers/', {
            'nom': 'Kaboré', 'prenom': 'Salimata', 'niveau_souhaite': niveau.id,
            'nom_parent': 'Kaboré Ali', 'telephone_parent': '71001122',
            'piece_ACTE_NAISSANCE': SimpleUploadedFile('acte.pdf', b'%PDF-1.4 test', content_type='application/pdf'),
            'piece_PIECE_PARENT': SimpleUploadedFile('virus.exe', b'MZ', content_type='application/octet-stream'),
        }, format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        admin = _client(self.a['admin'])
        demande = admin.get('/api/demandes-inscription/?statut=EN_ATTENTE').json()
        demande = (demande['results'] if isinstance(demande, dict) else demande)[0]
        self.assertEqual([p['type'] for p in demande['pieces']], ['ACTE_NAISSANCE'])  # l'.exe est écarté
        url_piece = f"/api/demandes-inscription/{demande['id']}/pieces/{demande['pieces'][0]['id']}/"
        lecture = admin.get(url_piece)
        self.assertEqual(lecture.status_code, 200)
        b''.join(lecture.streaming_content)
        for qui in ('eleve_user', 'parent', 'enseignant'):
            self.assertEqual(_client(self.a[qui]).get(url_piece).status_code, 403, qui)
        self.assertEqual(_client(self.b['admin']).get(url_piece).status_code, 404)
        self.assertEqual(admin.post(f"/api/demandes-inscription/{demande['id']}/accepter/", {'classe_id': self.a['classe'].id}, format='json').status_code, 403)
        ok = _client(_secretaire(self.a)).post(f"/api/demandes-inscription/{demande['id']}/accepter/", {'classe_id': self.a['classe'].id}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        docs = DocumentEleve.objects.filter(eleve_id=ok.json()['eleve_id'])
        self.assertEqual([d.type for d in docs], ['ACTE_NAISSANCE'])
        for d in docs:
            d.fichier.delete(save=False)


class RolesIntermediairesTests(TestCase):
    """Secrétaire, comptable, surveillant : chacun ne touche qu'à son domaine."""

    @classmethod
    def setUpTestData(cls):
        cls.a = _ecole('École A')
        cls.b = _ecole('École B')
        cls.u = {}
        for role in ('SECRETAIRE', 'COMPTABLE', 'SURVEILLANT'):
            cls.u[role] = User.objects.create_user(username=f'{role.lower()}-a', password='x', role=role, ecole=cls.a['ecole'])

    def code(self, role, methode, url, **kw):
        return getattr(_client(self.u[role]), methode)(url, **kw).status_code

    def test_chacun_son_domaine(self):
        eid = self.a['eleve'].id
        autorise = {
            'SECRETAIRE': [('get', '/api/eleves/'), ('get', f'/api/eleves/{eid}/documents/'),
                           ('get', '/api/demandes-inscription/'), ('get', '/api/inscriptions/'), ('get', '/api/classes/')],
            'COMPTABLE': [('get', '/api/tarifs/'), ('get', '/api/paiements/'), ('get', '/api/dossiers-scolarite/'),
                          ('get', '/api/eleves/'), ('get', '/api/classes/')],
            'SURVEILLANT': [('get', '/api/appels-journaliers/'), ('get', '/api/presences/'),
                            ('get', '/api/eleves/'), ('get', '/api/classes/')],
        }
        interdit = {
            'SECRETAIRE': [('get', '/api/tarifs/'), ('get', '/api/paiements/'), ('get', '/api/dossiers-scolarite/'),
                           ('get', '/api/appels-journaliers/')],
            'COMPTABLE': [('get', '/api/notes/'), ('get', '/api/evaluations/'), ('post', '/api/notes/saisie-masse/'), ('post', '/api/eleves/'),
                          ('get', f'/api/eleves/{eid}/documents/'), ('get', '/api/demandes-inscription/'),
                          ('get', '/api/appels-journaliers/')],
            'SURVEILLANT': [('post', '/api/presences/saisie-masse/'), ('post', '/api/notes/saisie-masse/'),
                            ('get', '/api/presences/appel-du-jour/'),
                            ('get', '/api/tarifs/'), ('get', '/api/paiements/'), ('get', '/api/notes/'),
                            ('post', '/api/eleves/'), ('get', f'/api/eleves/{eid}/documents/'),
                            ('get', '/api/demandes-inscription/')],
        }
        communs_interdits = [('get', '/api/users/'), ('get', '/api/sauvegarde/'), ('get', '/api/sms/'),
                             ('post', '/api/notes/publier-bulletin/'),
                             ('put', '/api/parametres/')]
        for role, liste in autorise.items():
            for methode, url in liste:
                self.assertEqual(self.code(role, methode, url), 200, f'{role} devrait pouvoir {methode} {url}')
        for role, liste in interdit.items():
            for methode, url in liste + communs_interdits:
                self.assertEqual(self.code(role, methode, url), 403, f'{role} ne doit pas pouvoir {methode} {url}')

    def test_le_personnel_ne_voit_pas_une_autre_ecole(self):
        autre_eleve = self.b['eleve']
        for role in self.u:
            self.assertEqual(self.code(role, 'get', f'/api/eleves/{autre_eleve.id}/'), 404, role)

    def test_creation_d_un_compte_personnel_et_connexion_par_telephone(self):
        admin = _client(self.a['admin'])
        r = admin.post('/api/users/', {'username': '22670123456', 'first_name': 'Awa', 'last_name': 'Sankara',
                                       'role': 'COMPTABLE'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        mdp = r.json()['mot_de_passe_temporaire']
        self.assertTrue(mdp)
        self.assertTrue(r.json()['must_change_password'])
        connexion = APIClient().post('/api/auth/login/', {'username': '70 12 34 56', 'password': mdp}, format='json')
        self.assertEqual(connexion.status_code, 200, connexion.content)
        self.assertEqual(connexion.json()['role'], 'COMPTABLE')
        # un directeur ne peut pas se créer un autre directeur ni un super admin
        for role in ('ADMIN', 'SUPER_ADMIN'):
            self.assertEqual(admin.post('/api/users/', {'username': 'x-' + role, 'role': role}, format='json').status_code, 400)


class EquipeEntreRolesTests(TestCase):
    """Communication entre les membres d'une école, sans jamais déborder sur une autre."""

    @classmethod
    def setUpTestData(cls):
        cls.a = _ecole('École A')
        cls.b = _ecole('École B')
        mk = lambda nom, role, e: User.objects.create_user(username=nom, password='x', role=role, ecole=e['ecole'])
        cls.compta_a = mk('compta-a', 'COMPTABLE', cls.a)
        cls.secr_a = mk('secr-a', 'SECRETAIRE', cls.a)
        cls.compta_b = mk('compta-b', 'COMPTABLE', cls.b)
        cls.prof_user_a = cls.a['enseignant']

    def test_le_directeur_ecrit_a_son_equipe_et_pas_a_l_autre_ecole(self):
        from notifications.models import Notification
        r = _client(self.a['admin']).post('/api/equipe/message/', {
            'destinataires': ['TOUS'], 'titre': 'Réunion', 'message': 'Lundi 8h en salle des profs.'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        recus = set(Notification.objects.filter(titre='Réunion').values_list('destinataire__username', flat=True))
        self.assertEqual(recus, {'compta-a', 'secr-a', self.prof_user_a.username})
        self.assertNotIn('compta-b', recus)

    def test_message_a_un_seul_role(self):
        from notifications.models import Notification
        r = _client(self.a['admin']).post('/api/equipe/message/', {
            'destinataires': ['COMPTABLE'], 'titre': 'Clôture', 'message': 'Clôture de caisse vendredi.'}, format='json')
        self.assertEqual(r.json()['envoyes'], 1)
        self.assertEqual(list(Notification.objects.filter(titre='Clôture').values_list('destinataire__username', flat=True)), ['compta-a'])

    def test_seul_le_directeur_ecrit_a_l_equipe(self):
        for u in (self.compta_a, self.secr_a, self.a['enseignant'], self.a['parent'], self.a['eleve_user']):
            r = _client(u).post('/api/equipe/message/', {'destinataires': ['TOUS'], 'titre': 'x', 'message': 'y'}, format='json')
            self.assertEqual(r.status_code, 403, u.username)

    def test_message_invalide_refuse(self):
        c = _client(self.a['admin'])
        self.assertEqual(c.post('/api/equipe/message/', {'destinataires': ['TOUS'], 'titre': '', 'message': 'y'}, format='json').status_code, 400)
        self.assertEqual(c.post('/api/equipe/message/', {'destinataires': ['ELEVE', 'ADMIN'], 'titre': 'x', 'message': 'y'}, format='json').status_code, 400)

    def test_inscription_previent_le_comptable_de_la_meme_ecole(self):
        from notifications.models import Notification
        eleve = Eleve.objects.create(nom='Zongo', prenom='Paul', matricule='Z-1', ecole=self.a['ecole'])
        r = _client(self.secr_a).post('/api/inscriptions/', {'eleve': eleve.id, 'classe': self.a['classe'].id, 'annee_scolaire': self.a['annee'].id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        notifs = Notification.objects.filter(titre__startswith='Nouvelle inscription')
        self.assertEqual(list(notifs.values_list('destinataire__username', flat=True)), ['compta-a'])

    def test_le_personnel_d_une_ecole_ne_voit_pas_l_equipe_d_une_autre(self):
        self.assertEqual(_client(self.b['admin']).get(f'/api/users/{self.compta_a.id}/').status_code, 404)
        self.assertEqual(_client(self.b['admin']).patch(f'/api/users/{self.compta_a.id}/', {'is_active': False}, format='json').status_code, 404)
        usernames = [u['username'] for u in (lambda d: d['results'] if isinstance(d, dict) else d)(_client(self.b['admin']).get('/api/users/').json())]
        self.assertNotIn('compta-a', usernames)


class AbsentsDuJourTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = _ecole('École A')
        cls.b = _ecole('École B')
        cls.surv = User.objects.create_user(username='surv-a', password='x', role='SURVEILLANT', ecole=cls.a['ecole'])

    def test_le_surveillant_voit_les_absents_du_jour_par_classe_sans_filtre(self):
        from datetime import date
        from eleves.models import AppelJournalier, Presence
        e = self.a['eleve']
        Presence.objects.create(eleve=e, classe_matiere=self.a['cm'], date=date.today(), statut='ABSENT', ecole=self.a['ecole'])
        autre = Eleve.objects.create(nom='Retardataire', prenom='Luc', matricule='R-1', ecole=self.a['ecole'])
        Inscription.objects.create(eleve=autre, classe=self.a['classe'], annee_scolaire=self.a['annee'], ecole=self.a['ecole'])
        AppelJournalier.objects.create(eleve=autre, classe=self.a['classe'], date=date.today(), statut='RETARD', ecole=self.a['ecole'])
        # un absent d'une autre école ne doit jamais apparaître
        Presence.objects.create(eleve=self.b['eleve'], classe_matiere=self.b['cm'], date=date.today(), statut='ABSENT', ecole=self.b['ecole'])
        r = _client(self.surv).get('/api/presences/absents-du-jour/')
        self.assertEqual(r.status_code, 200, r.content)
        d = r.json()
        self.assertEqual(d['total_absents'], 1)
        self.assertEqual(d['total_retards'], 1)
        self.assertEqual(len(d['classes']), 1)
        self.assertEqual(d['classes'][0]['classe'], '6ème A')
        noms = {x['matricule'] for x in d['classes'][0]['eleves']}
        self.assertEqual(noms, {e.matricule, 'R-1'})
        for qui in ('parent', 'eleve_user'):
            self.assertEqual(_client(self.a[qui]).get('/api/presences/absents-du-jour/').status_code, 403)
        compta = User.objects.create_user(username='c', password='x', role='COMPTABLE', ecole=self.a['ecole'])
        self.assertEqual(_client(compta).get('/api/presences/absents-du-jour/').status_code, 403)

    def test_historique_des_absences_sur_une_periode(self):
        from datetime import date, timedelta
        from eleves.models import Presence
        e = self.a['eleve']
        hier = date.today() - timedelta(days=1)
        il_y_a_3_semaines = date.today() - timedelta(days=21)
        for d in (hier, il_y_a_3_semaines):
            Presence.objects.create(eleve=e, classe_matiere=self.a['cm'], date=d, statut='ABSENT', ecole=self.a['ecole'])
        c = _client(self.surv)
        auj = c.get('/api/presences/absents-du-jour/').json()
        self.assertEqual(auj['total_absents'], 0)  # rien aujourd'hui
        mois = c.get(f'/api/presences/absents-du-jour/?debut={il_y_a_3_semaines}&fin={date.today()}').json()
        self.assertEqual(mois['total_absents'], 1)
        self.assertEqual(mois['classes'][0]['eleves'][0]['jours_absent'], 2)
        semaine = c.get(f'/api/presences/absents-du-jour/?debut={hier}&fin={hier}').json()
        self.assertEqual(semaine['classes'][0]['eleves'][0]['jours_absent'], 1)
        self.assertEqual(c.get('/api/presences/absents-du-jour/?debut=2020-01-01&fin=2026-12-31').status_code, 400)
        self.assertEqual(c.get('/api/presences/absents-du-jour/?debut=pas-une-date').status_code, 400)

    def test_liste_pdf_d_une_classe_pour_le_personnel(self):
        cid = self.a['classe'].id
        for role in ('SURVEILLANT',):
            r = _client(self.surv).get(f'/api/classes/{cid}/liste-pdf/')
            self.assertEqual(r.status_code, 200, r.content)
            self.assertTrue(r.content.startswith(b'%PDF'))
        r = _client(self.surv).get(f'/api/classes/{cid}/liste-pdf/?telecharger=1')
        self.assertIn('attachment', r['Content-Disposition'])
        self.assertEqual(_client(self.a['parent']).get(f'/api/classes/{cid}/liste-pdf/').status_code, 403)
        self.assertEqual(_client(self.b['admin']).get(f'/api/classes/{cid}/liste-pdf/').status_code, 404)


class BulletinsOuvertsTests(TestCase):
    """Élèves et parents ne récupèrent le bulletin que si la direction a ouvert le trimestre."""

    @classmethod
    def setUpTestData(cls):
        cls.a = _ecole('École Bulletins')

    def _bulletin(self, user, pdf=False):
        a = self.a
        url = 'bulletin-pdf' if pdf else 'bulletin'
        return _client(user).get(f"/api/notes/{url}/?eleve_id={a['eleve'].id}&trimestre_id={a['trimestre'].id}")

    def test_ferme_par_defaut_pour_eleve_et_parent(self):
        for u in (self.a['eleve_user'], self.a['parent']):
            for pdf in (False, True):
                res = self._bulletin(u, pdf)
                self.assertEqual(res.status_code, 403, (u.role, pdf))
                self.assertEqual(res.json()['code'], 'bulletins_fermes')

    def test_la_direction_le_voit_toujours_pas_les_enseignants(self):
        self.assertEqual(self._bulletin(self.a['admin']).status_code, 200)
        for pdf in (False, True):
            self.assertEqual(self._bulletin(self.a['enseignant'], pdf).status_code, 403)

    def test_ouverture_par_la_direction_seulement(self):
        a = self.a
        url = f"/api/trimestres/{a['trimestre'].id}/bulletins/"
        for u in (a['enseignant'], a['eleve_user'], a['parent']):
            self.assertEqual(_client(u).post(url, {'ouverts': True}, format='json').status_code, 403, u.role)
        res = _client(a['admin']).post(url, {'ouverts': True}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['bulletins_ouverts'])
        for u in (a['eleve_user'], a['parent']):
            self.assertEqual(self._bulletin(u).status_code, 200, u.role)
        _client(a['admin']).post(url, {'ouverts': False}, format='json')
        self.assertEqual(self._bulletin(a['eleve_user']).status_code, 403)

    def test_annonce_impossible_tant_que_ferme(self):
        a = self.a
        res = _client(a['admin']).post('/api/notes/publier-bulletin/', {'trimestre_id': a['trimestre'].id}, format='json')
        self.assertEqual(res.status_code, 400)
        a['trimestre'].bulletins_ouverts = True
        a['trimestre'].save()
        res = _client(a['admin']).post('/api/notes/publier-bulletin/', {'trimestre_id': a['trimestre'].id}, format='json')
        self.assertEqual(res.status_code, 200)

    def test_le_drapeau_ne_se_modifie_pas_par_patch(self):
        a = self.a
        _client(a['admin']).patch(f"/api/trimestres/{a['trimestre'].id}/", {'bulletins_ouverts': True}, format='json')
        a['trimestre'].refresh_from_db()
        self.assertFalse(a['trimestre'].bulletins_ouverts)


class ActualitesTests(TestCase):
    """La direction gère les actualités de la page publique ; les autres rôles n'y touchent pas."""

    @classmethod
    def setUpTestData(cls):
        cls.a = _ecole('École Actus')
        cls.b = _ecole('École Autre')
        for e in (cls.a, cls.b):
            e['ecole'].vitrine_active = True
            e['ecole'].ensure_slug()
            e['ecole'].save()

    def test_seule_la_direction_gere(self):
        a = self.a
        data = {'titre': 'Rentrée', 'contenu': 'Le 5 octobre.'}
        for u in (a['enseignant'], a['eleve_user'], a['parent'], _secretaire(a)):
            self.assertEqual(_client(u).post('/api/actualites/', data, format='json').status_code, 403, u.role)
        res = _client(a['admin']).post('/api/actualites/', data, format='json')
        self.assertEqual(res.status_code, 201, res.content)

    def test_la_page_publique_montre_seulement_le_publie(self):
        a = self.a
        c = _client(a['admin'])
        c.post('/api/actualites/', {'titre': 'Visible', 'contenu': 'x', 'publie': True}, format='json')
        c.post('/api/actualites/', {'titre': 'Brouillon', 'contenu': 'x', 'publie': False}, format='json')
        pub = APIClient().get(f"/api/vitrine/{a['ecole'].slug}/").json()
        self.assertEqual([x['titre'] for x in pub['actualites']], ['Visible'])

    def test_epingle_en_premier(self):
        a = self.a
        c = _client(a['admin'])
        c.post('/api/actualites/', {'titre': 'Ancienne', 'contenu': 'x', 'epingle': True, 'date_publication': '2026-01-01T08:00:00Z'}, format='json')
        c.post('/api/actualites/', {'titre': 'Récente', 'contenu': 'x'}, format='json')
        pub = APIClient().get(f"/api/vitrine/{a['ecole'].slug}/").json()
        self.assertEqual(pub['actualites'][0]['titre'], 'Ancienne')

    def test_isolation_entre_ecoles(self):
        a, b = self.a, self.b
        res = _client(a['admin']).post('/api/actualites/', {'titre': 'Privée A', 'contenu': 'x'}, format='json')
        pk = res.json()['id']
        self.assertEqual(_client(b['admin']).get('/api/actualites/').json().__len__() if isinstance(_client(b['admin']).get('/api/actualites/').json(), list) else _client(b['admin']).get('/api/actualites/').json()['count'], 0)
        self.assertEqual(_client(b['admin']).patch(f'/api/actualites/{pk}/', {'titre': 'Piraté'}, format='json').status_code, 404)
        pub_b = APIClient().get(f"/api/vitrine/{b['ecole'].slug}/").json()
        self.assertEqual(pub_b['actualites'], [])

    def test_titre_obligatoire(self):
        res = _client(self.a['admin']).post('/api/actualites/', {'titre': '   ', 'contenu': 'x'}, format='json')
        self.assertEqual(res.status_code, 400)


class InformerImpayesTests(TestCase):
    """Le comptable écrit aux parents des élèves dont la scolarité n'est pas soldée."""

    @classmethod
    def setUpTestData(cls):
        from caisse.services import ouvrir_dossier
        from notifications.models import Notification
        cls.Notification = Notification
        cls.a = _ecole('École A')
        cls.b = _ecole('École B')
        cls.compta = User.objects.create_user(username='compta-i', password='x', role='COMPTABLE', ecole=cls.a['ecole'])
        cls.secretaire = _secretaire(cls.a)
        cls.parent = User.objects.create_user(username='parent-i', password='x', role='PARENT', ecole=cls.a['ecole'])
        cls.parent.enfants.add(cls.a['eleve'])
        cls.parent_b = User.objects.create_user(username='parent-ib', password='x', role='PARENT', ecole=cls.b['ecole'])
        cls.parent_b.enfants.add(cls.b['eleve'])
        for x in (cls.a, cls.b):
            ouvrir_dossier(Inscription.objects.get(eleve=x['eleve']))

    def envoyer(self, user, **data):
        return _client(user).post('/api/dossiers-scolarite/informer/', {'message': 'Merci de passer à la caisse.', **data}, format='json')

    def test_le_comptable_ecrit_aux_parents_de_son_ecole_seulement(self):
        r = self.envoyer(self.compta, titre='Dernier délai')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['eleves'], 1)
        self.assertTrue(self.Notification.objects.filter(destinataire=self.parent, titre='Dernier délai').exists())
        self.assertFalse(self.Notification.objects.filter(destinataire=self.parent_b).exists())

    def test_les_autres_roles_ne_peuvent_pas(self):
        self.assertEqual(self.envoyer(self.secretaire).status_code, 403)
        self.assertEqual(self.envoyer(self.a['enseignant']).status_code, 403)

    def test_message_obligatoire(self):
        r = _client(self.compta).post('/api/dossiers-scolarite/informer/', {'message': '  '}, format='json')
        self.assertEqual(r.status_code, 400)


class ProgrammationEvaluationsTests(TestCase):
    """Un devoir ne se programme qu'une fois par trimestre ; composition et examen blanc : directeur seul."""

    @classmethod
    def setUpTestData(cls):
        cls.a = _ecole('École A')
        cls.b = _ecole('École B')

    def corps(self, type_, **kw):
        return {'type': type_, 'trimestre': self.a['trimestre'].id, 'classe_matiere': self.a['cm'].id, **kw}

    def test_un_devoir_ne_peut_pas_etre_reprogramme(self):
        prof = _client(self.a['enseignant'])
        # DEVOIR1 existe déjà pour ce cours et ce trimestre (créé par _ecole)
        r = prof.post('/api/evaluations/', self.corps('DEVOIR1'), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(prof.post('/api/evaluations/', self.corps('DEVOIR2'), format='json').status_code, 201)
        self.assertEqual(prof.post('/api/evaluations/', self.corps('DEVOIR2'), format='json').status_code, 400)

    def test_l_enseignant_ne_programme_ni_composition_ni_examen_blanc(self):
        prof = _client(self.a['enseignant'])
        self.assertEqual(prof.post('/api/evaluations/', self.corps('COMPOSITION'), format='json').status_code, 400)
        self.assertEqual(prof.post('/api/evaluations/', self.corps('EXAMEN_BLANC'), format='json').status_code, 400)
        self.assertEqual(prof.post('/api/evaluations/generer/', {'type': 'COMPOSITION', 'trimestre_id': self.a['trimestre'].id}, format='json').status_code, 403)

    def test_le_directeur_programme_les_compositions_une_seule_fois(self):
        d = _client(self.a['admin'])
        corps = {'type': 'COMPOSITION', 'trimestre_id': self.a['trimestre'].id}
        r = d.post('/api/evaluations/generer/', corps, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['crees'], 1)
        r = d.post('/api/evaluations/generer/', corps, format='json')
        self.assertEqual(r.json()['crees'], 0)
        self.assertEqual(Evaluation.objects.filter(type='COMPOSITION', classe_matiere=self.a['cm']).count(), 1)
        # rien n'est créé dans l'autre école
        self.assertFalse(Evaluation.objects.filter(type='COMPOSITION', ecole=self.b['ecole']).exists())

    def test_pas_deux_compositions_dans_le_meme_trimestre(self):
        d = _client(self.a['admin'])
        self.assertEqual(d.post('/api/evaluations/', self.corps('COMPOSITION'), format='json').status_code, 201)
        r = d.post('/api/evaluations/', self.corps('COMPOSITION'), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('deuxième fois', str(r.json()))
        # un seul calendrier de compositions par niveau et par trimestre
        from datetime import date
        corps = {'niveau': self.a['classe'].niveau_id, 'trimestre': self.a['trimestre'].id,
                 'date_debut': date(2026, 12, 7).isoformat(), 'date_fin': date(2026, 12, 11).isoformat()}
        self.assertEqual(d.post('/api/calendriers-composition/', corps, format='json').status_code, 201)
        self.assertEqual(d.post('/api/calendriers-composition/', corps, format='json').status_code, 400)

    def test_le_directeur_ne_programme_pas_les_devoirs(self):
        d = _client(self.a['admin'])
        self.assertEqual(d.post('/api/evaluations/', self.corps('DEVOIR2'), format='json').status_code, 400)

    def test_l_enseignant_n_annule_pas_une_composition(self):
        _client(self.a['admin']).post('/api/evaluations/generer/', {'type': 'COMPOSITION', 'trimestre_id': self.a['trimestre'].id}, format='json')
        compo = Evaluation.objects.get(type='COMPOSITION', classe_matiere=self.a['cm'])
        self.assertEqual(_client(self.a['enseignant']).patch(f'/api/evaluations/{compo.id}/', {'is_active': False}, format='json').status_code, 403)
        self.assertEqual(_client(self.a['admin']).patch(f'/api/evaluations/{compo.id}/', {'is_active': False}, format='json').status_code, 200)

    def test_examen_blanc_reserve_aux_classes_d_examen(self):
        r = _client(self.a['admin']).post('/api/evaluations/generer/', {'type': 'EXAMEN_BLANC', 'trimestre_id': self.a['trimestre'].id}, format='json')
        self.assertEqual(r.status_code, 400, r.content)  # la 6ème n'est pas une classe d'examen


class SecretaireNotesTests(TestCase):
    """La secrétaire programme les devoirs et saisit les notes de toutes les classes (pas des compositions)."""

    @classmethod
    def setUpTestData(cls):
        cls.a = _ecole('École A')
        cls.b = _ecole('École B')
        cls.sec = _secretaire(cls.a)

    def test_la_secretaire_programme_un_devoir_dans_n_importe_quelle_classe(self):
        c = _client(self.sec)
        corps = {'type': 'DEVOIR2', 'trimestre': self.a['trimestre'].id, 'classe_matiere': self.a['cm'].id}
        self.assertEqual(c.post('/api/evaluations/', corps, format='json').status_code, 201)
        self.assertEqual(c.post('/api/evaluations/', corps, format='json').status_code, 400)  # une seule fois
        self.assertEqual(c.get('/api/evaluations/').json()['count'] if isinstance(c.get('/api/evaluations/').json(), dict) else len(c.get('/api/evaluations/').json()), 2)

    def test_la_secretaire_saisit_les_notes_de_tous_les_cours_de_son_ecole(self):
        c = _client(self.sec)
        ev = self.a['eval']
        r = c.post('/api/notes/saisie-masse/', {'evaluation_id': ev.id, 'notes': [{'eleve_id': self.a['eleve'].id, 'valeur': 14}]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        # pas dans une autre école
        r = c.post('/api/notes/saisie-masse/', {'evaluation_id': self.b['eval'].id, 'notes': [{'eleve_id': self.b['eleve'].id, 'valeur': 14}]}, format='json')
        self.assertEqual(r.status_code, 404)

    def test_la_secretaire_programme_compositions_et_examens_blancs(self):
        c = _client(self.sec)
        corps = {'type': 'COMPOSITION', 'trimestre': self.a['trimestre'].id, 'classe_matiere': self.a['cm'].id}
        self.assertEqual(c.post('/api/evaluations/', corps, format='json').status_code, 201)
        self.assertEqual(c.post('/api/evaluations/', corps, format='json').status_code, 400)  # une seule fois
        r = c.post('/api/evaluations/generer/', {'type': 'COMPOSITION', 'trimestre_id': self.a['trimestre'].id}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        # le calendrier se programme et se publie aussi
        cal = {'niveau': self.a['classe'].niveau.id, 'trimestre': self.a['trimestre'].id, 'date_debut': '2026-12-01', 'date_fin': '2026-12-10'}
        r = c.post('/api/calendriers-composition/', cal, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(c.post(f"/api/calendriers-composition/{r.json()['id']}/publier/").status_code, 200)
        # le directeur reste dans son rôle et un autre rôle (enseignant) n'a toujours pas ce droit
        self.assertEqual(_client(self.a['enseignant']).post('/api/calendriers-composition/', cal, format='json').status_code, 403)
        self.assertEqual(_client(self.a['enseignant']).post('/api/evaluations/generer/', {'type': 'COMPOSITION', 'trimestre_id': self.a['trimestre'].id}, format='json').status_code, 403)
        # une secrétaire d'une autre école ne touche pas à cette école
        autre = _client(_secretaire(self.b))
        self.assertEqual(autre.post('/api/evaluations/', corps, format='json').status_code, 400)


class MessageSecretariatTests(TestCase):
    """L'enseignant écrit à la secrétaire de son école, et à elle seule."""

    @classmethod
    def setUpTestData(cls):
        cls.a = _ecole('École A')
        cls.b = _ecole('École B')
        cls.sec_a = _secretaire(cls.a)
        cls.sec_b = _secretaire(cls.b)
        cls.compta_a = User.objects.create_user(username='cpt-ms', password='x', role='COMPTABLE', ecole=cls.a['ecole'])

    def test_l_enseignant_ecrit_a_la_secretaire_de_son_ecole_seulement(self):
        from notifications.models import Notification
        r = _client(self.a['enseignant']).post('/api/equipe/message-secretariat/', {'titre': 'Absence', 'message': 'Je serai absent lundi.'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        recus = list(Notification.objects.filter(titre__startswith='Absence').values_list('destinataire__username', flat=True))
        self.assertEqual(recus, [self.sec_a.username])

    def test_les_autres_roles_ne_peuvent_pas(self):
        for u in (self.sec_a, self.compta_a, self.a['admin'], self.a['parent'], self.a['eleve_user']):
            r = _client(u).post('/api/equipe/message-secretariat/', {'titre': 'x', 'message': 'y'}, format='json')
            self.assertEqual(r.status_code, 403, u.username)

    def test_message_vide_ou_sans_secretaire(self):
        c = _client(self.a['enseignant'])
        self.assertEqual(c.post('/api/equipe/message-secretariat/', {'titre': '', 'message': 'y'}, format='json').status_code, 400)
        self.sec_a.delete()
        self.assertEqual(c.post('/api/equipe/message-secretariat/', {'titre': 'x', 'message': 'y'}, format='json').status_code, 400)


class DepensesEtBilanTests(TestCase):
    """Le comptable note les dépenses ; le directeur et lui voient entrées, sorties et solde."""

    @classmethod
    def setUpTestData(cls):
        from caisse.services import ouvrir_dossier, enregistrer_paiement
        from datetime import date
        cls.a = _ecole('École A')
        cls.b = _ecole('École B')
        cls.compta = User.objects.create_user(username='compta-d', password='x', role='COMPTABLE', ecole=cls.a['ecole'])
        cls.compta_b = User.objects.create_user(username='compta-db', password='x', role='COMPTABLE', ecole=cls.b['ecole'])
        cls.secretaire = _secretaire(cls.a)
        dossier = ouvrir_dossier(Inscription.objects.get(eleve=cls.a['eleve']))
        dossier.montant_du = 100000
        dossier.save()
        enregistrer_paiement(dossier, tranche=1, montant=40000, date_paiement=date.today(), recu_par=cls.compta)

    def depense(self, user, **kw):
        from datetime import date
        return _client(user).post('/api/depenses/', {
            'libelle': 'Craies et cahiers', 'categorie': 'FOURNITURES', 'montant': 15000,
            'date_depense': str(date.today()), **kw}, format='json')

    def test_le_comptable_note_une_depense_et_le_bilan_se_met_a_jour(self):
        r = self.depense(self.compta)
        self.assertEqual(r.status_code, 201, r.content)
        bilan = _client(self.compta).get('/api/depenses/bilan/').json()
        self.assertEqual((bilan['entrees'], bilan['sorties'], bilan['solde']), (40000, 15000, 25000))
        self.assertEqual(bilan['attendu'], 100000)
        self.assertEqual(bilan['reste_a_recouvrer'], 60000)
        self.assertEqual(bilan['taux_recouvrement'], 40)
        self.assertEqual(bilan['depenses_par_categorie'][0]['total'], 15000)

    def test_le_directeur_n_a_aucun_acces_aux_depenses(self):
        self.assertEqual(self.depense(self.a['admin']).status_code, 403)
        self.depense(self.compta)
        self.assertEqual(_client(self.a['admin']).get('/api/depenses/').status_code, 403)
        self.assertEqual(_client(self.a['admin']).get('/api/depenses/bilan/').status_code, 403)

    def test_les_autres_roles_sont_refuses(self):
        for u in (self.secretaire, self.a['enseignant']):
            self.assertEqual(self.depense(u).status_code, 403)
            self.assertEqual(_client(u).get('/api/depenses/bilan/').status_code, 403)

    def test_montant_positif_et_isolation_des_ecoles(self):
        self.assertEqual(self.depense(self.compta, montant=0).status_code, 400)
        self.depense(self.compta)
        self.assertEqual(_client(self.compta_b).get('/api/depenses/bilan/').json()['sorties'], 0)

    def test_annuler_une_depense_la_retire_du_bilan(self):
        did = self.depense(self.compta).json()['id']
        self.assertEqual(_client(self.compta).delete(f'/api/depenses/{did}/').status_code, 200)
        self.assertEqual(_client(self.compta).get('/api/depenses/bilan/').json()['sorties'], 0)


class PaiementsComptableSeulTests(TestCase):
    """Le directeur n'a rien à voir avec les paiements ; un paiement enregistré ne se modifie jamais."""

    @classmethod
    def setUpTestData(cls):
        from caisse.services import ouvrir_dossier, enregistrer_paiement
        from datetime import date
        cls.a = _ecole('École A')
        cls.compta = User.objects.create_user(username='compta-p', password='x', role='COMPTABLE', ecole=cls.a['ecole'])
        cls.dossier = ouvrir_dossier(Inscription.objects.get(eleve=cls.a['eleve']))
        cls.dossier.montant_du = 100000
        cls.dossier.save()
        cls.paiement = enregistrer_paiement(cls.dossier, tranche=1, montant=40000, date_paiement=date.today(), recu_par=cls.compta)

    def test_le_directeur_ne_voit_aucun_paiement(self):
        c = _client(self.a['admin'])
        for url in ('/api/paiements/', '/api/dossiers-scolarite/', '/api/depenses/', '/api/depenses/bilan/'):
            self.assertEqual(c.get(url).status_code, 403, url)
        self.assertEqual(c.post(f'/api/dossiers-scolarite/{self.dossier.id}/paiement/', {'montant': 1000, 'tranche': 1}, format='json').status_code, 403)

    def test_le_comptable_voit_ses_paiements(self):
        c = _client(self.compta)
        self.assertEqual(c.get('/api/paiements/').status_code, 200)
        self.assertEqual(c.get('/api/dossiers-scolarite/').status_code, 200)

    def test_un_paiement_et_un_dossier_ne_se_modifient_pas(self):
        c = _client(self.compta)
        url = f'/api/paiements/{self.paiement.id}/'
        for methode in ('put', 'patch', 'delete'):
            self.assertIn(getattr(c, methode)(url, {'montant': 1}, format='json').status_code, (403, 405), methode)
        dossier_url = f'/api/dossiers-scolarite/{self.dossier.id}/'
        for methode in ('put', 'patch', 'delete'):
            self.assertIn(getattr(c, methode)(dossier_url, {'montant_du': 1}, format='json').status_code, (403, 405), methode)
        self.assertEqual(c.post('/api/dossiers-scolarite/', {'inscription': 1, 'montant_du': 1}, format='json').status_code, 403)
        self.paiement.refresh_from_db()
        self.dossier.refresh_from_db()
        self.assertEqual((int(self.paiement.montant), int(self.dossier.montant_du)), (40000, 100000))


class DatePaiementFigeeTests(TestCase):
    """La date d'un encaissement est le jour même ; elle ne se choisit pas."""

    @classmethod
    def setUpTestData(cls):
        from caisse.services import ouvrir_dossier
        cls.a = _ecole('École A')
        cls.compta = User.objects.create_user(username='compta-date', password='x', role='COMPTABLE', ecole=cls.a['ecole'])
        cls.dossier = ouvrir_dossier(Inscription.objects.get(eleve=cls.a['eleve']))
        cls.dossier.montant_du = 100000
        cls.dossier.save()

    def payer(self, **extra):
        return _client(self.compta).post(f'/api/dossiers-scolarite/{self.dossier.id}/paiement/',
                                         {'montant': 1000, 'tranche': 1, **extra}, format='json')

    def test_la_date_envoyee_est_ignoree(self):
        from datetime import date
        r = self.payer(date_paiement='2020-01-01')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['paiement']['date_paiement'], str(date.today()))

    def test_un_encaissement_hors_ligne_garde_son_jour_dans_la_limite(self):
        from datetime import date, timedelta
        hier = str(date.today() - timedelta(days=1))
        r = self.payer(date_paiement=hier, client_id='offline-1')
        self.assertEqual(r.json()['paiement']['date_paiement'], hier)
        trop_ancien = self.payer(date_paiement='2020-01-01', client_id='offline-2')
        self.assertEqual(trop_ancien.json()['paiement']['date_paiement'], str(date.today()))


class RecuCompletTests(TestCase):
    """Le reçu donne la situation du dossier : total dû, déjà payé, reste."""

    def test_le_recu_porte_le_total_le_cumul_et_le_reste(self):
        from caisse.services import ouvrir_dossier
        a = _ecole('École A')
        compta = User.objects.create_user(username='compta-r', password='x', role='COMPTABLE', ecole=a['ecole'])
        dossier = ouvrir_dossier(Inscription.objects.get(eleve=a['eleve']))
        dossier.montant_du = 100000
        dossier.save()
        c = _client(compta)
        url = f'/api/dossiers-scolarite/{dossier.id}/paiement/'
        c.post(url, {'montant': 30000, 'tranche': 1}, format='json')
        p = c.post(url, {'montant': 20000, 'tranche': 1}, format='json').json()['paiement']
        self.assertEqual((p['montant_du'], p['cumul_paye'], p['reste_apres']), (100000, 50000, 50000))
        self.assertEqual((p['numero_versement'], p['versement_libelle']), (2, '2e versement'))
        self.assertEqual(p['annee_libelle'], '2026-2027')
        liste = c.get('/api/paiements/').json()
        items = liste['results'] if isinstance(liste, dict) else liste
        premier = [x for x in items if int(x['montant']) == 30000][0]
        self.assertEqual((premier['cumul_paye'], premier['reste_apres']), (30000, 70000))


class PaiementSansTrancheTests(TestCase):
    """Un versement compte pour le total ; les tranches ne sont qu'un échéancier affiché ; soldé = terminé."""

    def test_total_echeancier_et_blocage_quand_solde(self):
        from caisse.models import TarifNiveau
        from caisse.services import ouvrir_dossier
        a = _ecole('École A')
        compta = User.objects.create_user(username='compta-t', password='x', role='COMPTABLE', ecole=a['ecole'])
        ins = Inscription.objects.get(eleve=a['eleve'])
        TarifNiveau.objects.create(niveau=ins.classe.niveau, annee_scolaire=ins.annee_scolaire,
                                   tranche1=50000, tranche2=30000, tranche3=20000, ecole=a['ecole'])
        dossier = ouvrir_dossier(ins)
        self.assertEqual(int(dossier.montant_du), 100000)
        c = _client(compta)
        url = f'/api/dossiers-scolarite/{dossier.id}/paiement/'
        self.assertEqual(c.post(url, {'montant': 60000}, format='json').status_code, 201)
        d = c.get(f'/api/dossiers-scolarite/{dossier.id}/').json()
        self.assertEqual([(t['paye'], t['statut']) for t in d['tranches']],
                         [(50000, 'SOLDE'), (10000, 'PARTIEL'), (0, 'A_VENIR')])
        self.assertEqual(c.post(url, {'montant': 50000}, format='json').status_code, 400)  # dépasse le reste (40 000)
        self.assertEqual(c.post(url, {'montant': 40000}, format='json').status_code, 201)
        self.assertEqual(c.get(f'/api/dossiers-scolarite/{dossier.id}/').json()['statut'], 'SOLDE')
        self.assertEqual(c.post(url, {'montant': 1000}, format='json').status_code, 400)  # soldé : fini


class CaisseRigoureTests(TestCase):
    """Encaissement : référence exigée hors espèces, un seul reçu par numéro, journal du jour exact."""

    @classmethod
    def setUpTestData(cls):
        from caisse.services import ouvrir_dossier
        cls.a = _ecole('École A')
        cls.compta = User.objects.create_user(username='compta-rig', password='x', role='COMPTABLE', ecole=cls.a['ecole'])
        cls.dossier = ouvrir_dossier(Inscription.objects.get(eleve=cls.a['eleve']))
        cls.dossier.montant_du = 100000
        cls.dossier.save()
        cls.url = f'/api/dossiers-scolarite/{cls.dossier.id}/paiement/'

    def payer(self, **data):
        return _client(self.compta).post(self.url, data, format='json')

    def test_reference_obligatoire_hors_especes(self):
        for mode in ('MOBILE', 'VIREMENT', 'CHEQUE'):
            r = self.payer(montant=5000, mode=mode)
            self.assertEqual(r.status_code, 400, mode)
            self.assertIn('référence', r.json()['detail'])
        self.assertEqual(self.payer(montant=5000, mode='MOBILE', commentaire='TX-889977').status_code, 201)
        self.assertEqual(self.payer(montant=5000, mode='ESPECES').status_code, 201)

    def test_numeros_de_recu_uniques_et_consecutifs(self):
        numeros = [self.payer(montant=1000).json()['paiement']['numero_recu'] for _ in range(3)]
        self.assertEqual(len(set(numeros)), 3)
        fins = [int(n.split('-')[-1]) for n in numeros]
        self.assertEqual(fins, list(range(fins[0], fins[0] + 3)))

    def test_le_montant_decimal_ou_texte_est_refuse(self):
        self.assertEqual(self.payer(montant='abc').status_code, 400)
        self.assertEqual(self.payer(montant=-5).status_code, 400)

    def test_journal_du_jour(self):
        self.payer(montant=20000, mode='ESPECES')
        self.payer(montant=10000, mode='MOBILE', commentaire='TX-1')
        from datetime import date
        _client(self.compta).post('/api/depenses/', {
            'libelle': 'Craies', 'categorie': 'FOURNITURES', 'montant': 4000, 'date_depense': str(date.today())}, format='json')
        j = _client(self.compta).get('/api/depenses/journal/').json()
        self.assertEqual((j['total_entrees'], j['total_sorties'], j['solde']), (30000, 4000, 26000))
        self.assertEqual(len(j['entrees']), 2)
        self.assertEqual({m['mode']: m['total'] for m in j['entrees_par_mode']}, {'ESPECES': 20000, 'MOBILE': 10000})
        self.assertEqual(_client(self.a['admin']).get('/api/depenses/journal/').status_code, 403)
        self.assertEqual(_client(self.compta).get('/api/depenses/journal/?date=pas-une-date').status_code, 400)


class SignatureComptableTests(TestCase):
    """Nom, prénom et signature du comptable : réglés une fois, imprimés sur ses reçus."""

    @classmethod
    def setUpTestData(cls):
        from caisse.services import ouvrir_dossier
        cls.a = _ecole('École A')
        cls.compta = User.objects.create_user(username='compta-sig', password='x', role='COMPTABLE', ecole=cls.a['ecole'])
        cls.dossier = ouvrir_dossier(Inscription.objects.get(eleve=cls.a['eleve']))
        cls.dossier.montant_du = 100000
        cls.dossier.save()

    def png(self, nom='sig.png'):
        import io
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        buf = io.BytesIO()
        Image.new('RGBA', (20, 10), (0, 0, 0, 0)).save(buf, 'PNG')
        return SimpleUploadedFile(nom, buf.getvalue(), content_type='image/png')

    def test_reglage_puis_signature_sur_le_recu(self):
        c = _client(self.compta)
        r = c.post('/api/caisse/ma-signature/', {'first_name': 'Salif', 'last_name': 'Ouédraogo', 'signature': self.png()}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['nom_complet'], 'Salif Ouédraogo')
        self.assertTrue(r.json()['signature_url'])
        p = c.post(f'/api/dossiers-scolarite/{self.dossier.id}/paiement/', {'montant': 5000}, format='json').json()['paiement']
        self.assertEqual(p['recu_par_nom'], 'Salif Ouédraogo')
        self.assertTrue(p['recu_par_signature'])
        self.assertEqual(c.delete('/api/caisse/ma-signature/').json()['signature_url'], None)

    def test_nom_et_prenom_obligatoires_et_fichier_valide(self):
        c = _client(self.compta)
        self.assertEqual(c.post('/api/caisse/ma-signature/', {'first_name': 'Salif'}, format='multipart').status_code, 400)
        from django.core.files.uploadedfile import SimpleUploadedFile
        faux = SimpleUploadedFile('x.png', b'pas une image', content_type='image/png')
        r = c.post('/api/caisse/ma-signature/', {'first_name': 'Salif', 'last_name': 'O', 'signature': faux}, format='multipart')
        self.assertEqual(r.status_code, 400)

    def test_reserve_au_comptable(self):
        for u in (self.a['admin'], self.a['enseignant'], _secretaire(self.a)):
            self.assertEqual(_client(u).get('/api/caisse/ma-signature/').status_code, 403)


class RecuDepenseTests(TestCase):
    """Chaque dépense a un n° de pièce unique (DEP-AAAA-0001…) et porte la signature du comptable."""

    @classmethod
    def setUpTestData(cls):
        cls.a = _ecole('École A')
        cls.b = _ecole('École B')
        cls.compta = User.objects.create_user(username='compta-dep', password='x', role='COMPTABLE',
                                              first_name='Salif', last_name='Ouédraogo', ecole=cls.a['ecole'])
        cls.compta_b = User.objects.create_user(username='compta-dep-b', password='x', role='COMPTABLE', ecole=cls.b['ecole'])

    def depense(self, user, libelle='Craies'):
        from datetime import date
        return _client(user).post('/api/depenses/', {
            'libelle': libelle, 'categorie': 'FOURNITURES', 'montant': 4000, 'beneficiaire': 'Librairie Moderne',
            'date_depense': str(date.today())}, format='json')

    def test_numeros_continus_par_ecole(self):
        from datetime import date
        an = date.today().year
        n1 = self.depense(self.compta).json()['numero']
        n2 = self.depense(self.compta, 'Cahiers').json()['numero']
        nb = self.depense(self.compta_b).json()['numero']
        self.assertEqual((n1, n2, nb), (f'DEP-{an}-0001', f'DEP-{an}-0002', f'DEP-{an}-0001'))

    def test_le_recu_porte_le_nom_du_comptable(self):
        d = self.depense(self.compta).json()
        self.assertEqual(d['saisi_par_nom'], 'Salif Ouédraogo')
        self.assertIn('saisi_par_signature', d)

    def test_le_numero_ne_se_modifie_pas(self):
        d = self.depense(self.compta).json()
        _client(self.compta).patch(f"/api/depenses/{d['id']}/", {'numero': 'DEP-9999-0001'}, format='json')
        lu = _client(self.compta).get(f"/api/depenses/{d['id']}/").json()
        self.assertEqual(lu['numero'], d['numero'])


class DateDepenseFigeeTests(TestCase):
    def test_la_date_est_celle_du_jour_et_ne_se_modifie_pas(self):
        from datetime import date
        a = _ecole('École A')
        compta = User.objects.create_user(username='compta-dd', password='x', role='COMPTABLE', ecole=a['ecole'])
        c = _client(compta)
        d = c.post('/api/depenses/', {'libelle': 'Craies', 'categorie': 'AUTRE', 'montant': 1000,
                                     'date_depense': '2020-01-01'}, format='json').json()
        self.assertEqual(d['date_depense'], str(date.today()))
        c.patch(f"/api/depenses/{d['id']}/", {'date_depense': '2019-05-05'}, format='json')
        self.assertEqual(c.get(f"/api/depenses/{d['id']}/").json()['date_depense'], str(date.today()))


class DossierAutomatiqueTests(TestCase):
    """Un élève inscrit a immédiatement son dossier ; la grille des frais met les montants à jour toute seule."""

    def test_dossier_cree_a_l_inscription_et_montant_suit_la_grille(self):
        from caisse.models import DossierScolarite, TarifNiveau
        a = _ecole('École A')
        ins = Inscription.objects.get(eleve=a['eleve'])
        dossier = DossierScolarite.objects.get(inscription=ins)  # créé sans appeler ouvrir_dossier
        self.assertEqual(int(dossier.montant_du), 0)
        TarifNiveau.objects.create(niveau=ins.classe.niveau, annee_scolaire=ins.annee_scolaire,
                                   tranche1=40000, tranche2=30000, tranche3=20000, ecole=a['ecole'])
        dossier.refresh_from_db()
        self.assertEqual(int(dossier.montant_du), 90000)
        t = TarifNiveau.objects.get(niveau=ins.classe.niveau)
        t.tranche3 = 30000
        t.save()
        dossier.refresh_from_db()
        self.assertEqual(int(dossier.montant_du), 100000)

    def test_un_dossier_deja_paye_garde_son_montant(self):
        from caisse.models import DossierScolarite, TarifNiveau
        from caisse.services import enregistrer_paiement
        from datetime import date
        a = _ecole('École A')
        ins = Inscription.objects.get(eleve=a['eleve'])
        t = TarifNiveau.objects.create(niveau=ins.classe.niveau, annee_scolaire=ins.annee_scolaire,
                                       tranche1=50000, tranche2=0, tranche3=0, ecole=a['ecole'])
        dossier = DossierScolarite.objects.get(inscription=ins)
        enregistrer_paiement(dossier, montant=10000, date_paiement=date.today())
        t.tranche1 = 80000
        t.save()
        dossier.refresh_from_db()
        self.assertEqual(int(dossier.montant_du), 50000)


class MontantSelonLaClasseTests(TestCase):
    """Le montant dû dépend du NIVEAU de la classe de l'élève (et de l'année)."""

    def test_chaque_niveau_son_tarif_et_le_changement_de_classe(self):
        from caisse.models import DossierScolarite, TarifNiveau
        from caisse.services import enregistrer_paiement
        from datetime import date
        a = _ecole('École A')
        ecole, annee = a['ecole'], a['annee']
        ins6 = Inscription.objects.get(eleve=a['eleve'])           # élève en 6ème A
        niveau3 = Niveau.objects.create(nom='3ème', ecole=ecole)
        classe3 = Classe.objects.create(nom='3ème A', niveau=niveau3, ecole=ecole)
        eleve3 = Eleve.objects.create(nom='Grand', prenom='Elève', matricule='M-3', ecole=ecole)
        ins3 = Inscription.objects.create(eleve=eleve3, classe=classe3, annee_scolaire=annee, ecole=ecole)
        TarifNiveau.objects.create(niveau=ins6.classe.niveau, annee_scolaire=annee, tranche1=30000, tranche2=20000, tranche3=10000, ecole=ecole)
        TarifNiveau.objects.create(niveau=niveau3, annee_scolaire=annee, tranche1=60000, tranche2=30000, tranche3=15000, ecole=ecole)
        d6 = DossierScolarite.objects.get(inscription=ins6)
        d3 = DossierScolarite.objects.get(inscription=ins3)
        self.assertEqual((int(d6.montant_du), int(d3.montant_du)), (60000, 105000))

        # changement de classe sans paiement : le montant suit le nouveau niveau
        ins6.classe = classe3
        ins6.save()
        d6.refresh_from_db()
        self.assertEqual(int(d6.montant_du), 105000)

        # une grille suspendue n'est plus appliquée aux nouveaux dossiers
        TarifNiveau.objects.filter(niveau=niveau3).update(is_active=False)
        eleve_n = Eleve.objects.create(nom='Nouveau', prenom='X', matricule='M-4', ecole=ecole)
        ins_n = Inscription.objects.create(eleve=eleve_n, classe=classe3, annee_scolaire=annee, ecole=ecole)
        self.assertEqual(int(DossierScolarite.objects.get(inscription=ins_n).montant_du), 0)


class EmploiDuTempsPourTousTests(TestCase):
    """Tout le monde consulte l'emploi du temps ; seul le directeur le modifie."""

    @classmethod
    def setUpTestData(cls):
        from cours.models import EmploiDuTemps
        from datetime import time
        cls.a = _ecole('École A')
        cls.b = _ecole('École B')
        EmploiDuTemps.objects.create(classe_matiere=cls.a['cm'], jour='LUNDI', heure_debut=time(8), heure_fin=time(9), ecole=cls.a['ecole'])
        cls.autre_classe = Classe.objects.create(nom='6ème B', niveau=cls.a['classe'].niveau, ecole=cls.a['ecole'])
        autre_matiere = Matiere.objects.create(nom='Histoire', ecole=cls.a['ecole'])
        autre_prof = Enseignant.objects.create(nom='Autre prof', ecole=cls.a['ecole'])
        cm2 = ClasseMatiere.objects.create(classe=cls.autre_classe, matiere=autre_matiere, enseignant=autre_prof, coef=1, ecole=cls.a['ecole'])
        EmploiDuTemps.objects.create(classe_matiere=cm2, jour='MARDI', heure_debut=time(10), heure_fin=time(11), ecole=cls.a['ecole'])
        cls.cm2 = cm2

    def liste(self, user, **params):
        r = _client(user).get('/api/emploi-du-temps/', params)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        return data['results'] if isinstance(data, dict) else data

    def test_tout_le_monde_lit(self):
        secretaire = _secretaire(self.a)
        comptable = User.objects.create_user(username='compta-edt', password='x', role='COMPTABLE', ecole=self.a['ecole'])
        surveillant = User.objects.create_user(username='surv-edt', password='x', role='SURVEILLANT', ecole=self.a['ecole'])
        for u in (self.a['admin'], secretaire, comptable, surveillant, self.a['eleve_user'], self.a['parent']):
            self.assertEqual(len(self.liste(u, classe_id=self.a['classe'].id)), 1)

    def test_l_enseignant_voit_ses_cours_ou_n_importe_quelle_classe(self):
        prof = self.a['enseignant']
        self.assertEqual(len(self.liste(prof)), 1)                                   # ses propres cours
        self.assertEqual(len(self.liste(prof, classe_id=self.autre_classe.id)), 1)  # une classe qu'il n'enseigne pas

    def test_eleve_et_parent_ne_voient_que_leur_classe(self):
        for u in (self.a['eleve_user'], self.a['parent']):
            self.assertEqual(len(self.liste(u)), 1)                                  # sans filtre : seulement leur classe
            self.assertEqual(len(self.liste(u, classe_id=self.autre_classe.id)), 0)  # pas la classe d'un autre

    def test_les_ecoles_restent_separees(self):
        secretaire_b = _secretaire(self.b)
        self.assertEqual(len(self.liste(secretaire_b, classe_id=self.a['classe'].id)), 0)

    def test_seul_le_directeur_modifie(self):
        secretaire = _secretaire(self.a)
        corps = {'classe_matiere': self.a['cm'].id, 'jour': 'JEUDI', 'heure_debut': '08:00', 'heure_fin': '09:00'}
        self.assertEqual(_client(secretaire).post('/api/emploi-du-temps/', corps, format='json').status_code, 403)
        self.assertEqual(_client(self.a['enseignant']).post('/api/emploi-du-temps/', corps, format='json').status_code, 403)
        self.assertEqual(_client(self.a['admin']).post('/api/emploi-du-temps/', corps, format='json').status_code, 201)


class BilanTableauDeBordTests(TestCase):
    def test_derniers_mouvements_et_plus_gros_restes(self):
        from caisse.services import ouvrir_dossier, enregistrer_paiement
        from datetime import date
        a = _ecole('École A')
        compta = User.objects.create_user(username='compta-tb', password='x', role='COMPTABLE', ecole=a['ecole'])
        dossier = ouvrir_dossier(Inscription.objects.get(eleve=a['eleve']))
        dossier.montant_du = 100000
        dossier.save()
        enregistrer_paiement(dossier, montant=30000, date_paiement=date.today(), recu_par=compta)
        c = _client(compta)
        c.post('/api/depenses/', {'libelle': 'Craies', 'categorie': 'FOURNITURES', 'montant': 2000}, format='json')
        b = c.get('/api/depenses/bilan/').json()
        self.assertEqual(b['aujourdhui']['nb_recus'], 1)
        self.assertEqual({m['type'] for m in b['derniers_mouvements']}, {'entree', 'sortie'})
        self.assertEqual(b['plus_gros_restes'][0]['reste'], 70000)


class AjoutEleveTests(TestCase):
    """« Nouvel élève » : directeur et secrétaire ajoutent un élève ; fiche + compte élève en une fois."""

    def setUp(self):
        self.a = _ecole('École ajout élève')

    def _ajouter(self, user, matricule, **extra):
        return _client(user).post('/api/eleves/', {'matricule': matricule, 'nom': 'Kaboré', 'prenom': 'Awa', **extra}, format='json')

    def test_secretaire_ajoute_eleve_avec_son_compte(self):
        r = self._ajouter(_secretaire(self.a), 'S-001')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data['compte']['username'], 'S-001')
        self.assertTrue(r.data['compte']['mot_de_passe_temporaire'])
        self.assertTrue(User.objects.filter(role='ELEVE', eleve_id=r.data['id']).exists())

    def test_directeur_ajoute_eleve_et_le_met_en_classe(self):
        r = self._ajouter(self.a['admin'], 'D-001')
        self.assertEqual(r.status_code, 201, r.content)
        ins = _client(self.a['admin']).post('/api/inscriptions/', {'eleve': r.data['id'], 'classe': self.a['classe'].id}, format='json')
        self.assertEqual(ins.status_code, 201, ins.content)

    def test_mot_de_passe_hors_ligne_conserve(self):
        r = self._ajouter(_secretaire(self.a), 'H-001', mot_de_passe='Hors2026!')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(User.objects.get(eleve_id=r.data['id']).check_password('Hors2026!'))

    def test_enseignant_ne_peut_pas_ajouter(self):
        self.assertEqual(self._ajouter(self.a['enseignant'], 'E-001').status_code, 403)
        self.assertFalse(Eleve.objects.filter(matricule='E-001').exists())


class CumulSecretaireComptableTests(TestCase):
    """Petites écoles : une même personne secrétaire + comptable (un compte, droits additionnés)."""

    def setUp(self):
        self.a = _ecole('École cumul')
        self.sec = _secretaire(self.a)

    def _cumuler(self):
        r = _client(self.a['admin']).patch(f'/api/users/{self.sec.id}/', {'roles_supplementaires': ['COMPTABLE']}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.sec.refresh_from_db()

    def test_secretaire_seule_n_a_pas_la_caisse(self):
        self.assertEqual(_client(self.sec).get('/api/dossiers-scolarite/').status_code, 403)

    def test_cumul_donne_caisse_et_secretariat(self):
        self._cumuler()
        c = _client(self.sec)
        self.assertEqual(c.get('/api/dossiers-scolarite/').status_code, 200)
        self.assertEqual(c.get('/api/depenses/bilan/').status_code, 200)
        r = c.post('/api/eleves/', {'matricule': 'CUM-1', 'nom': 'Sawadogo', 'prenom': 'Ali'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)

    def test_connexion_renvoie_les_roles(self):
        self._cumuler()
        self.sec.set_password('Secret2026!')
        self.sec.save()
        r = APIClient().post('/api/auth/login/', {'username': self.sec.username, 'password': 'Secret2026!'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['role'], 'SECRETAIRE')
        self.assertEqual(r.data['roles'], ['SECRETAIRE', 'COMPTABLE'])

    def test_comptable_prevenu_meme_en_cumul(self):
        from notifications.equipe import notifier_roles
        from notifications.models import Notification
        self._cumuler()
        self.assertEqual(notifier_roles(self.a['ecole'], ['COMPTABLE'], 'T', 'M'), 1)
        self.assertTrue(Notification.objects.filter(destinataire=self.sec).exists())

    def test_cumul_secretaire_et_site_public(self):
        r = _client(self.a['admin']).patch(f'/api/users/{self.sec.id}/', {'roles_supplementaires': ['COMMUNICATION']}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.sec.refresh_from_db()
        c = _client(self.sec)
        self.assertEqual(c.post('/api/actualites/', {'titre': 'Rentrée', 'contenu': 'Bienvenue', 'publie': True}, format='json').status_code, 201)
        self.assertEqual(c.put('/api/parametres/', {'presentation_vitrine': 'Réussir ensemble'}, format='json').status_code, 200)
        self.assertEqual(c.get('/api/dossiers-scolarite/').status_code, 403)  # pas la caisse

    def test_cumuls_interdits(self):
        admin = _client(self.a['admin'])
        surv = User.objects.create_user(username='surv-cumul', password='x', role='SURVEILLANT', ecole=self.a['ecole'])
        for user, extras in ((self.sec, ['ADMIN']), (self.sec, ['SURVEILLANT']), (surv, ['COMPTABLE'])):
            r = admin.patch(f'/api/users/{user.id}/', {'roles_supplementaires': extras}, format='json')
            self.assertEqual(r.status_code, 400, (user.role, extras, r.content))

    def test_cumul_force_en_base_ignore_hors_regle(self):
        """Même écrit directement en base, un cumul non autorisé ne donne aucun droit."""
        ens = self.a['enseignant']
        ens.roles_supplementaires = ['COMPTABLE']
        ens.save()
        self.assertEqual(_client(ens).get('/api/dossiers-scolarite/').status_code, 403)

    def test_seul_le_directeur_attribue_les_roles(self):
        r = _client(self.sec).patch(f'/api/users/{self.sec.id}/', {'roles_supplementaires': ['COMPTABLE']}, format='json')
        self.assertEqual(r.status_code, 403)


class JournalActiviteTests(TestCase):
    """Journal « qui a fait quoi » : rempli par les vraies requêtes (jeton JWT), lu par le directeur seul."""

    def setUp(self):
        self.a = _ecole('École journal')
        self.sec = _secretaire(self.a)

    def _jwt(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def test_ajout_et_modification_traces_avec_auteur(self):
        from accounts.models import JournalAction
        c = self._jwt(self.sec)
        r = c.post('/api/eleves/', {'matricule': 'J-1', 'nom': 'Ouédraogo', 'prenom': 'Paul'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        ajout = JournalAction.objects.get(action='CREATION', objet_type='Élève')
        self.assertEqual(ajout.utilisateur, self.sec)
        self.assertEqual(ajout.ecole, self.a['ecole'])
        self.assertEqual(c.patch(f"/api/eleves/{r.data['id']}/", {'nom': 'Ouedraogo'}, format='json').status_code, 200)
        modif = JournalAction.objects.get(action='MODIFICATION', objet_type='Élève')
        self.assertIn({'champ': 'Nom', 'avant': 'Ouédraogo', 'apres': 'Ouedraogo'}, modif.details)

    def test_suspension_tracee(self):
        from accounts.models import JournalAction
        eleve = self.a['eleve']
        self.assertIn(self._jwt(self.sec).delete(f'/api/eleves/{eleve.id}/').status_code, (200, 204))
        self.assertTrue(JournalAction.objects.filter(action='SUSPENSION', objet_id=str(eleve.id)).exists())

    def test_sans_auteur_rien_n_est_ecrit(self):
        from accounts.models import JournalAction
        Eleve.objects.create(nom='Seed', prenom='X', matricule='SEED-1', ecole=self.a['ecole'])
        self.assertFalse(JournalAction.objects.exists())

    def test_connexion_tracee_sans_mot_de_passe(self):
        from accounts.models import JournalAction
        self.sec.set_password('Journal2026!')
        self.sec.save()
        r = APIClient().post('/api/auth/login/', {'username': self.sec.username, 'password': 'Journal2026!'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(JournalAction.objects.filter(action='CONNEXION', utilisateur=self.sec).exists())
        self.assertFalse(JournalAction.objects.filter(details__icontains='Journal2026').exists())

    def test_seul_le_directeur_lit_le_journal_de_son_ecole(self):
        autre = _ecole('Autre école journal')
        self._jwt(self.sec).patch(f"/api/eleves/{self.a['eleve'].id}/", {'prenom': 'Deux'}, format='json')
        self._jwt(_secretaire(autre)).patch(f"/api/eleves/{autre['eleve'].id}/", {'prenom': 'Trois'}, format='json')
        r = self._jwt(self.a['admin']).get('/api/journal/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual({l['objet_id'] for l in r.data['results']}, {str(self.a['eleve'].id)})
        self.assertEqual(self._jwt(self.sec).get('/api/journal/').status_code, 403)
        self.assertEqual(self._jwt(self.a['admin']).delete('/api/journal/1/').status_code in (403, 404, 405), True)


class JournalSuperAdminTests(TestCase):
    """Le super admin lit le journal de toutes les écoles (filtrable par école)."""

    def _jwt(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def test_toutes_les_ecoles_et_filtre(self):
        a, b = _ecole('École SA un'), _ecole('École SA deux')
        self._jwt(_secretaire(a)).patch(f"/api/eleves/{a['eleve'].id}/", {'prenom': 'Premier'}, format='json')
        self._jwt(_secretaire(b)).patch(f"/api/eleves/{b['eleve'].id}/", {'prenom': 'Deux'}, format='json')
        sa = User.objects.create_user(username='superadmin-journal', password='x', role='SUPER_ADMIN', is_plateforme=True)
        c = self._jwt(sa)
        r = c.get('/api/journal/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual({l['ecole_nom'] for l in r.data['results']}, {'École SA un', 'École SA deux'})
        r = c.get(f"/api/journal/?ecole={b['ecole'].id}")
        self.assertEqual({l['ecole_nom'] for l in r.data['results']}, {'École SA deux'})
        self.assertIn('ecoles', c.get('/api/journal/filtres/').data)
        # le directeur d'une école ne voit toujours que la sienne
        r = self._jwt(a['admin']).get('/api/journal/')
        self.assertEqual({l['ecole_nom'] for l in r.data['results']}, {'École SA un'})


class SiteVitrineConfigurableTests(TestCase):
    """Le directeur règle le contenu du site public depuis Paramètres ; le site le reflète."""

    def setUp(self):
        self.a = _ecole('École vitrine')
        e = self.a['ecole']
        e.slug, e.vitrine_active = 'ecole-vitrine-test', True
        e.save()

    def test_atouts_contact_et_affichage(self):
        admin = _client(self.a['admin'])
        r = admin.put('/api/parametres/', {
            'vitrine_atouts': [{'titre': 'Enseignants qualifiés', 'texte': 'Tous diplômés.'}, {'titre': '', 'texte': 'ignoré'}],
            'vitrine_horaires': 'Lundi – vendredi, 7 h – 17 h', 'vitrine_whatsapp': '70 12 34 56',
            'vitrine_afficher_tarifs': False, 'vitrine_afficher_classes': False,
        }, format='json')
        self.assertIn(r.status_code, (200, 202), r.content)
        site = APIClient().get('/api/vitrine/ecole-vitrine-test/')
        self.assertEqual(site.status_code, 200, site.content)
        self.assertEqual(site.data['atouts'], [{'titre': 'Enseignants qualifiés', 'texte': 'Tous diplômés.'}])
        self.assertEqual(site.data['horaires'], 'Lundi – vendredi, 7 h – 17 h')
        self.assertEqual(site.data['tarifs'], [])
        self.assertTrue(all(n['classes'] == [] for n in site.data['niveaux']))

    def test_atouts_envoyes_avec_une_photo(self):
        """Formulaire multipart (photo jointe) : la liste des atouts arrive en texte JSON."""
        import io, json
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        buf = io.BytesIO()
        Image.new('RGB', (40, 30), (20, 120, 200)).save(buf, 'PNG')
        photo = SimpleUploadedFile('ecole.png', buf.getvalue(), content_type='image/png')
        r = _client(self.a['admin']).put('/api/parametres/', {
            'vitrine_atouts': json.dumps([{'titre': 'Cantine', 'texte': 'Repas chaud le midi.'}]), 'vitrine_photo': photo,
        }, format='multipart')
        self.assertIn(r.status_code, (200, 202), r.content)
        site = APIClient().get('/api/vitrine/ecole-vitrine-test/')
        self.assertEqual(site.data['atouts'][0]['titre'], 'Cantine')
        self.assertTrue(site.data['photo_url'])


class GalerieActualiteTests(TestCase):
    """Plusieurs photos (facultatives) par actualité : ajout, retrait, affichage public."""

    def setUp(self):
        self.a = _ecole('École galerie')
        e = self.a['ecole']
        e.slug, e.vitrine_active = 'ecole-galerie-test', True
        e.save()

    @staticmethod
    def _png(nom):
        import io
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        buf = io.BytesIO()
        Image.new('RGB', (30, 20), (200, 40, 40)).save(buf, 'PNG')
        return SimpleUploadedFile(nom, buf.getvalue(), content_type='image/png')

    def test_ajout_retrait_et_site_public(self):
        admin = _client(self.a['admin'])
        r = admin.post('/api/actualites/', {
            'titre': 'Kermesse', 'contenu': 'Belle journée.', 'publie': 'true',
            'photos': [self._png('a.png'), self._png('b.png'), self._png('c.png')],
        }, format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.data['photos']), 3)
        premiere = r.data['photos'][0]['id']
        r = admin.patch(f"/api/actualites/{r.data['id']}/", {'retirer_photos': [premiere]}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(r.data['photos']), 2)
        site = APIClient().get('/api/vitrine/ecole-galerie-test/')
        self.assertEqual(len(site.data['actualites'][0]['photos']), 2)

    def test_fichier_qui_n_est_pas_une_image_refuse(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        faux = SimpleUploadedFile('virus.png', b'pas une image', content_type='image/png')
        r = _client(self.a['admin']).post('/api/actualites/', {'titre': 'X', 'contenu': 'Y', 'photos': [faux]}, format='multipart')
        self.assertEqual(r.status_code, 400)
        from scolarite.models import Actualite
        self.assertFalse(Actualite.objects.filter(titre='X').exists())  # tout ou rien


class DuplicataBulletinTests(TestCase):
    """Duplicata de bulletin : le directeur seul, toutes années, tracé dans le journal."""

    def setUp(self):
        self.a = _ecole('École duplicata')
        # une année passée, où l'élève était inscrit
        passee = AnneeScolaire.objects.create(libelle='2024-2025', is_active=False, ecole=self.a['ecole'])
        self.t_passe = Trimestre.objects.create(nom='Trimestre 1', annee_scolaire=passee, ecole=self.a['ecole'])
        Inscription.objects.create(eleve=self.a['eleve'], classe=self.a['classe'], annee_scolaire=passee, ecole=self.a['ecole'])

    def _jwt(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def test_historique_liste_les_annees_passees(self):
        r = self._jwt(self.a['admin']).get(f"/api/notes/historique-bulletins/?eleve_id={self.a['eleve'].id}")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual({x['annee'] for x in r.data['annees']}, {'2024-2025', '2026-2027'})

    def test_duplicata_pdf_d_une_annee_passee_meme_non_ouverte_et_trace(self):
        from accounts.models import JournalAction
        r = self._jwt(self.a['admin']).get(
            f"/api/notes/duplicata-bulletin/?eleve_id={self.a['eleve'].id}&trimestre_id={self.t_passe.id}")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r['Content-Type'], 'application/pdf')
        self.assertTrue(r.content.startswith(b'%PDF'))
        self.assertTrue(JournalAction.objects.filter(objet_type='Duplicata de bulletin', utilisateur=self.a['admin']).exists())

    def test_les_autres_ne_peuvent_pas(self):
        url = f"/api/notes/duplicata-bulletin/?eleve_id={self.a['eleve'].id}&trimestre_id={self.t_passe.id}"
        for user in (self.a['eleve_user'], self.a['parent'], self.a['enseignant'], _secretaire(self.a)):
            self.assertEqual(self._jwt(user).get(url).status_code, 403, user.role)


class MotDePasseAppartientAuTitulaireTests(TestCase):
    """Personne ne change le mot de passe d'un autre, sauf le super admin ; chacun change le sien en sécurité."""

    def setUp(self):
        self.a = _ecole('École mdp')
        self.sa = User.objects.create_user(username='sa-mdp', password='x', role='SUPER_ADMIN', is_plateforme=True)

    def _jwt(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def test_le_directeur_ne_peut_plus_reinitialiser_personne(self):
        c = self._jwt(self.a['admin'])
        e = self.a['eleve']
        self.assertEqual(c.post(f'/api/eleves/{e.id}/reinitialiser-mot-de-passe/').status_code, 404)
        self.assertTrue(c.post('/api/eleves/appliquer-mot-de-passe-defaut/').status_code in (404, 405))
        prof = self.a['enseignant'].enseignant
        self.assertEqual(c.post(f'/api/enseignants/{prof.id}/reinitialiser-mot-de-passe/').status_code, 404)
        self.assertTrue(c.post('/api/enseignants/appliquer-mot-de-passe-defaut/').status_code in (404, 405))

    def test_modifier_un_compte_ne_change_pas_son_mot_de_passe(self):
        cible = self.a['eleve_user']
        avant = cible.password
        r = self._jwt(self.a['admin']).patch(f'/api/users/{cible.id}/', {'password': 'PirateDu#Directeur9'}, format='json')
        self.assertIn(r.status_code, (200, 400))
        cible.refresh_from_db()
        self.assertEqual(cible.password, avant)

    def test_le_directeur_redonne_un_mot_de_passe_a_son_equipe_seulement(self):
        c = self._jwt(self.a['admin'])
        prof = self.a['enseignant']
        r = c.patch(f'/api/users/{prof.id}/', {'password': 'Equipe#Nouveau7'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        prof.refresh_from_db()
        self.assertTrue(prof.check_password('Equipe#Nouveau7'))
        self.assertTrue(prof.must_change_password)
        for qui in ('eleve_user', 'parent'):
            cible = self.a[qui]
            avant = cible.password
            c.patch(f'/api/users/{cible.id}/', {'password': 'Equipe#Nouveau7'}, format='json')
            cible.refresh_from_db()
            self.assertEqual(cible.password, avant, qui)

    def test_un_enseignant_ne_fait_l_appel_que_pour_aujourd_hui(self):
        from datetime import timedelta
        from django.utils import timezone
        c = self._jwt(self.a['enseignant'])
        aujourdhui = timezone.localdate()

        def appel(d):
            return c.post('/api/presences/saisie-masse/', {
                'classe_matiere_id': self.a['cm'].id, 'date': d.isoformat(),
                'presences': [{'eleve_id': self.a['eleve'].id, 'statut': 'PRESENT'}]}, format='json')
        self.assertEqual(appel(aujourdhui - timedelta(days=1)).status_code, 400)
        self.assertEqual(appel(aujourdhui + timedelta(days=1)).status_code, 400)
        self.assertEqual(appel(aujourdhui).status_code, 201)
        # la création directe d'une présence datée d'un autre jour est refusée aussi
        r = c.post('/api/presences/', {'eleve': self.a['eleve'].id, 'classe_matiere': self.a['cm'].id,
                                       'date': (aujourdhui - timedelta(days=3)).isoformat(), 'statut': 'ABSENT'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)

    def test_super_admin_retrouve_et_reinitialise_un_compte(self):
        cible = self.a['eleve_user']
        c = self._jwt(self.sa)
        r = c.get(f"/api/ecoles/{self.a['ecole'].id}/comptes/?q={cible.username}")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn(cible.username, [u['username'] for u in r.json()])
        r = c.post(f"/api/ecoles/{self.a['ecole'].id}/comptes/{cible.id}/reinitialiser/")
        self.assertEqual(r.status_code, 200, r.content)
        cible.refresh_from_db()
        self.assertTrue(cible.must_change_password)
        self.assertTrue(cible.check_password(r.json()['mot_de_passe_temporaire']))

    def test_seul_le_super_admin_reinitialise(self):
        cible = self.a['eleve_user']
        url = f"/api/ecoles/{self.a['ecole'].id}/comptes/{cible.id}/reinitialiser/"
        for qui in ('admin', 'enseignant', 'eleve_user', 'parent'):
            self.assertEqual(self._jwt(self.a[qui]).post(url).status_code, 403, qui)
            self.assertEqual(self._jwt(self.a[qui]).get(f"/api/ecoles/{self.a['ecole'].id}/comptes/").status_code, 403, qui)

    def test_le_super_admin_ne_touche_pas_a_une_autre_ecole(self):
        autre = _ecole('École mdp deux')
        r = self._jwt(self.sa).post(f"/api/ecoles/{self.a['ecole'].id}/comptes/{autre['eleve_user'].id}/reinitialiser/")
        self.assertEqual(r.status_code, 404)

    def test_changement_de_son_mot_de_passe(self):
        u = self.a['eleve_user']
        u.set_password('Ancien#Secret5')
        u.must_change_password = False
        u.save()
        c = self._jwt(u)
        # mot de passe actuel faux, trop court, trop courant : refusés
        self.assertEqual(c.post('/api/auth/change-password/', {'old_password': 'faux', 'new_password': 'Nouveau#2026x'}, format='json').status_code, 400)
        self.assertEqual(c.post('/api/auth/change-password/', {'old_password': 'Ancien#Secret5', 'new_password': 'abc12'}, format='json').status_code, 400)
        self.assertEqual(c.post('/api/auth/change-password/', {'old_password': 'Ancien#Secret5', 'new_password': 'password123'}, format='json').status_code, 400)
        r = c.post('/api/auth/change-password/', {'old_password': 'Ancien#Secret5', 'new_password': 'Nouveau#2026x'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        u.refresh_from_db()
        self.assertTrue(u.check_password('Nouveau#2026x'))

    def test_changer_son_mot_de_passe_deconnecte_les_autres_appareils(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        u = self.a['eleve_user']
        u.set_password('Ancien#Secret5')
        u.must_change_password = False
        u.save()
        autre_appareil = RefreshToken.for_user(u)
        ici = RefreshToken.for_user(u)
        r = self._jwt(u).post('/api/auth/change-password/', {
            'old_password': 'Ancien#Secret5', 'new_password': 'Nouveau#2026x', 'refresh': str(ici)}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        anonyme = APIClient()
        self.assertEqual(anonyme.post('/api/auth/refresh/', {'refresh': str(autre_appareil)}, format='json').status_code, 401)
        self.assertEqual(anonyme.post('/api/auth/refresh/', {'refresh': str(ici)}, format='json').status_code, 200)


class JustificationAbsencesTests(TestCase):
    """L'enseignant marque présent ou absent ; le directeur seul justifie les absences, avec un motif."""

    def setUp(self):
        from django.utils import timezone
        self.a = _ecole('École absences')
        self.jour = timezone.localdate()

    def _jwt(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def _appel(self, statut):
        return self._jwt(self.a['enseignant']).post('/api/presences/saisie-masse/', {
            'classe_matiere_id': self.a['cm'].id, 'date': self.jour.isoformat(),
            'presences': [{'eleve_id': self.a['eleve'].id, 'statut': statut}]}, format='json')

    def test_l_enseignant_marque_seulement_present_ou_absent(self):
        for statut in ('RETARD', 'EXCUSE'):
            self.assertEqual(self._appel(statut).status_code, 400, statut)
        self.assertEqual(self._appel('ABSENT').status_code, 201)

    def test_le_directeur_justifie_et_ca_se_voit(self):
        from eleves.models import Presence
        self._appel('ABSENT')
        corps = {'eleve_id': self.a['eleve'].id, 'date': self.jour.isoformat(), 'motif': 'Maladie'}
        # personne d'autre ne justifie
        for qui in ('enseignant', 'eleve_user', 'parent'):
            self.assertEqual(self._jwt(self.a[qui]).post('/api/presences/justifier/', corps, format='json').status_code, 403, qui)
        directeur = self._jwt(self.a['admin'])
        self.assertEqual(directeur.post('/api/presences/justifier/', {**corps, 'motif': ''}, format='json').status_code, 400)
        r = directeur.post('/api/presences/justifier/', corps, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        p = Presence.objects.get(eleve=self.a['eleve'], date=self.jour)
        self.assertTrue(p.justifiee)
        self.assertEqual(p.motif_justification, 'Maladie')
        self.assertEqual(p.justifiee_par, self.a['admin'])
        liste = directeur.get('/api/presences/absents-du-jour/').json()
        eleve = liste['classes'][0]['eleves'][0]
        self.assertTrue(eleve['justifiee'])
        self.assertEqual(eleve['motif'], 'Maladie')
        # retirer la justification
        r = directeur.post('/api/presences/justifier/', {**corps, 'annuler': True}, format='json')
        self.assertEqual(r.status_code, 200)
        p.refresh_from_db()
        self.assertFalse(p.justifiee)

    def test_pas_d_absence_rien_a_justifier(self):
        r = self._jwt(self.a['admin']).post('/api/presences/justifier/', {
            'eleve_id': self.a['eleve'].id, 'date': self.jour.isoformat(), 'motif': 'Maladie'}, format='json')
        self.assertEqual(r.status_code, 404)

    def test_un_directeur_ne_justifie_pas_dans_une_autre_ecole(self):
        self._appel('ABSENT')
        autre = _ecole('École absences deux')
        r = self._jwt(autre['admin']).post('/api/presences/justifier/', {
            'eleve_id': self.a['eleve'].id, 'date': self.jour.isoformat(), 'motif': 'Maladie'}, format='json')
        self.assertEqual(r.status_code, 404)


class CalendrierCompositionsVisibleTests(TestCase):
    """Enseignants, élèves et parents consultent le calendrier des compositions de leurs niveaux seulement."""

    def test_chacun_voit_ses_niveaux(self):
        from datetime import date
        from evaluations.models import CalendrierComposition, ProgrammeComposition
        a = _ecole('École compos')
        from datetime import timedelta
        from django.utils import timezone
        debut = timezone.localdate() + timedelta(days=30)
        fin = debut + timedelta(days=4)
        mien = CalendrierComposition.objects.create(niveau=a['classe'].niveau, trimestre=a['trimestre'],
                                                    date_debut=debut, date_fin=fin, publie=True, ecole=a['ecole'])
        ProgrammeComposition.objects.create(calendrier=mien, matiere=a['cm'].matiere, date_composition=debut, ecole=a['ecole'])
        autre_niveau = Niveau.objects.create(nom='Terminale', ecole=a['ecole'])
        CalendrierComposition.objects.create(niveau=autre_niveau, trimestre=a['trimestre'],
                                             date_debut=debut, date_fin=fin, publie=True, ecole=a['ecole'])
        for qui in ('enseignant', 'eleve_user', 'parent'):
            r = _client(a[qui]).get('/api/calendriers-composition/')
            self.assertEqual(r.status_code, 200, qui)
            items = r.json()['results'] if isinstance(r.json(), dict) else r.json()
            self.assertEqual([c['id'] for c in items], [mien.id], qui)
            self.assertEqual(len(items[0]['programmes']), 1, qui)
        r = _client(a['admin']).get('/api/calendriers-composition/')
        items = r.json()['results'] if isinstance(r.json(), dict) else r.json()
        self.assertEqual(len(items), 2)
        # parent de deux enfants : seulement la classe de l'enfant choisi
        frere = Eleve.objects.create(nom='Élève', prenom='Deux', matricule=f"M2-{a['ecole'].pk}", ecole=a['ecole'])
        classe_t = Classe.objects.create(nom='Tle A', niveau=autre_niveau, ecole=a['ecole'])
        Inscription.objects.create(eleve=frere, classe=classe_t, annee_scolaire=a['annee'], ecole=a['ecole'])
        a['parent'].enfants.add(frere)
        c = _client(a['parent'])
        lire = lambda url: (lambda j: j['results'] if isinstance(j, dict) else j)(c.get(url).json())
        self.assertEqual(len(lire('/api/calendriers-composition/')), 2)
        self.assertEqual([x['niveau_nom'] for x in lire(f'/api/calendriers-composition/?eleve_id={frere.id}')], ['Terminale'])
        self.assertEqual([x['niveau_nom'] for x in lire(f"/api/calendriers-composition/?eleve_id={a['eleve'].id}")], ['6ème'])
        autre = _ecole('École compos deux')
        self.assertEqual(lire(f"/api/calendriers-composition/?eleve_id={autre['eleve'].id}"), [])
        # lecture seule pour eux
        self.assertEqual(_client(a['enseignant']).patch(f'/api/calendriers-composition/{mien.id}/', {'date_fin': '2026-12-12'}, format='json').status_code, 403)


class PublicationCalendrierTests(TestCase):
    """Le calendrier n'apparaît qu'après publication par le directeur, qui prévient les parents ; il disparaît une fois passé."""

    def setUp(self):
        from datetime import timedelta
        from django.utils import timezone
        from evaluations.models import CalendrierComposition
        self.a = _ecole('École publication')
        auj = timezone.localdate()
        self.cal = CalendrierComposition.objects.create(niveau=self.a['classe'].niveau, trimestre=self.a['trimestre'],
                                                        date_debut=auj + timedelta(days=10), date_fin=auj + timedelta(days=14),
                                                        ecole=self.a['ecole'])

    def _ids(self, qui):
        j = _client(self.a[qui]).get('/api/calendriers-composition/').json()
        return [c['id'] for c in (j['results'] if isinstance(j, dict) else j)]

    def test_invisible_tant_que_non_publie_puis_notifie(self):
        from notifications.models import Notification
        for qui in ('enseignant', 'eleve_user', 'parent'):
            self.assertEqual(self._ids(qui), [], qui)
        self.assertEqual(self._ids('admin'), [self.cal.id])
        # seul le directeur publie
        for qui in ('enseignant', 'eleve_user', 'parent'):
            self.assertEqual(_client(self.a[qui]).post(f'/api/calendriers-composition/{self.cal.id}/publier/').status_code, 403, qui)
        r = _client(self.a['admin']).post(f'/api/calendriers-composition/{self.cal.id}/publier/')
        self.assertEqual(r.status_code, 200, r.content)
        for qui in ('enseignant', 'eleve_user', 'parent'):
            self.assertEqual(self._ids(qui), [self.cal.id], qui)
        notif = Notification.objects.filter(destinataire=self.a['parent'], lien='/calendrier-compositions')
        self.assertEqual(notif.count(), 1)
        self.assertIn('disponible', notif.first().titre)
        # retirer la publication
        _client(self.a['admin']).post(f'/api/calendriers-composition/{self.cal.id}/retirer/')
        self.assertEqual(self._ids('parent'), [])

    def test_disparait_pour_les_familles_une_fois_passe(self):
        from datetime import timedelta
        from django.utils import timezone
        auj = timezone.localdate()
        self.cal.publie = True
        self.cal.date_debut, self.cal.date_fin = auj - timedelta(days=10), auj - timedelta(days=6)
        self.cal.save()
        self.assertEqual(self._ids('parent'), [])
        self.assertEqual(self._ids('eleve_user'), [])
        self.assertEqual(self._ids('enseignant'), [self.cal.id])  # l'enseignant le garde (saisie des notes)


class HistoriqueMessagesRegroupeTests(TestCase):
    """La relance des impayés écrit un message par élève : l'historique la montre comme un seul envoi."""

    def test_relance_sur_une_ligne(self):
        from notifications.models import SmsOutbox
        a = _ecole('École messages')
        for i, montant in enumerate((65000, 36667, 55000)):
            SmsOutbox.objects.create(telephone=f'7000000{i}', type='FRAIS', statut='SIMULATED', ecole=a['ecole'],
                                     message=f'Rappel : il reste {montant} F CFA à régler pour Élève {i} (situation : Partiel).')
        SmsOutbox.objects.create(telephone='70000009', type='INFO', statut='SIMULATED', ecole=a['ecole'], message='Réunion des parents')
        r = _client(a['admin']).get('/api/sms/envois/')
        self.assertEqual(r.status_code, 200, r.content)
        groupes = r.json()['results']
        self.assertEqual(len(groupes), 2)
        relance = next(g for g in groupes if g['type'] == 'FRAIS')
        self.assertEqual(relance['total'], 3)
        self.assertNotIn('65000', relance['message'])


class ComptesParentsTests(TestCase):
    """Le directeur relie un parent à ses enfants et suspend son accès ; jamais avec un élève d'une autre école."""

    def test_relier_suspendre_et_rester_dans_son_ecole(self):
        a, b = _ecole('École parents'), _ecole('École parents deux')
        d = _client(a['admin'])
        parent = a['parent']
        frere = Eleve.objects.create(nom='Élève', prenom='Frère', matricule=f"F-{a['ecole'].pk}", ecole=a['ecole'])
        r = d.patch(f'/api/users/{parent.id}/', {'first_name': 'Awa', 'enfants': [a['eleve'].id, frere.id]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(set(parent.enfants.values_list('id', flat=True)), {a['eleve'].id, frere.id})
        # un élève d'une autre école ne peut pas être relié
        r = d.patch(f'/api/users/{parent.id}/', {'enfants': [b['eleve'].id]}, format='json')
        self.assertEqual(r.status_code, 400)
        # recherche par nom d'enfant
        r = d.get('/api/users/?role=PARENT&search=Frère')
        self.assertEqual([u['id'] for u in r.json()['results']], [parent.id])
        # le directeur ne suspend pas un parent : c'est la plateforme
        self.assertEqual(d.delete(f'/api/users/{parent.id}/').status_code, 403)
        self.assertEqual(d.patch(f'/api/users/{parent.id}/', {'is_active': False}, format='json').status_code, 403)
        parent.refresh_from_db()
        self.assertTrue(parent.is_active)
        sa = User.objects.create_user(username='sa-parents', password='x', role='SUPER_ADMIN', is_plateforme=True)
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(sa).access_token}')
        base = f"/api/ecoles/{a['ecole'].id}/comptes/{parent.id}"
        self.assertEqual(c.post(f'{base}/suspendre/', {}, format='json').status_code, 400)  # motif obligatoire
        self.assertEqual(c.post(f'{base}/suspendre/', {'motif': 'Numéro réattribué'}, format='json').status_code, 200)
        parent.refresh_from_db()
        self.assertFalse(parent.is_active)
        self.assertEqual(d.post(f'/api/users/{parent.id}/reactiver/').status_code, 403)
        self.assertEqual(c.post(f'{base}/reactiver/').status_code, 200)
        parent.refresh_from_db()
        self.assertTrue(parent.is_active)
        # la plateforme ne suspend ici que des parents
        self.assertEqual(c.post(f"/api/ecoles/{a['ecole'].id}/comptes/{a['enseignant'].id}/suspendre/", {'motif': 'x'}, format='json').status_code, 400)
        # le directeur n'a pas accès à cette action
        self.assertEqual(d.post(f'{base}/suspendre/', {'motif': 'x'}, format='json').status_code, 403)
        # le directeur d'une autre école ne voit pas ce parent
        self.assertEqual(_client(b['admin']).patch(f'/api/users/{parent.id}/', {'first_name': 'X'}, format='json').status_code, 404)


class AnneeScolaireUniqueTests(TestCase):
    """Une seule année en cours par école ; une nouvelle année n'écrase pas l'année en cours ; libellés et trimestres propres."""

    def test_une_seule_annee_en_cours(self):
        a = _ecole('École années')
        d = _client(a['admin'])
        r = d.post('/api/annees/', {'libelle': '2027-2028'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        nouvelle = AnneeScolaire.objects.get(pk=r.json()['id'])
        self.assertFalse(nouvelle.is_active)  # l'année en cours reste 2026-2027
        self.assertEqual(nouvelle.trimestres.count(), 3)
        etats = {x['libelle']: x['etat'] for x in d.get('/api/annees/').json()}
        self.assertEqual(etats, {'2026-2027': 'EN_COURS', '2027-2028': 'A_VENIR'})
        # on ne bascule pas l'année en cours par une simple modification
        d.patch(f'/api/annees/{nouvelle.id}/', {'is_active': True}, format='json')
        self.assertEqual(AnneeScolaire.objects.filter(ecole=a['ecole'], is_active=True).count(), 1)
        # basculer : une seule année en cours, toujours
        self.assertEqual(_client(a['enseignant']).post(f'/api/annees/{nouvelle.id}/en-cours/', {'confirmation': '2027-2028'}, format='json').status_code, 403)
        # confirmation écrite obligatoire
        self.assertEqual(d.post(f'/api/annees/{nouvelle.id}/en-cours/').status_code, 400)
        self.assertEqual(d.post(f'/api/annees/{nouvelle.id}/en-cours/', {'confirmation': '2026-2027'}, format='json').status_code, 400)
        self.assertEqual(AnneeScolaire.objects.get(pk=nouvelle.pk).is_active, False)
        self.assertEqual(d.post(f'/api/annees/{nouvelle.id}/en-cours/', {'confirmation': '2027-2028'}, format='json').status_code, 200)
        actives = list(AnneeScolaire.objects.filter(ecole=a['ecole'], is_active=True).values_list('libelle', flat=True))
        self.assertEqual(actives, ['2027-2028'])
        etats = {x['libelle']: x['etat'] for x in d.get('/api/annees/').json()}
        self.assertEqual(etats['2026-2027'], 'TERMINEE')

    def test_libelle_et_trimestre_valides(self):
        a = _ecole('École libellés')
        d = _client(a['admin'])
        for faux in ('2027', '2027-2029', 'deux mille'):
            self.assertEqual(d.post('/api/annees/', {'libelle': faux}, format='json').status_code, 400, faux)
        self.assertEqual(d.post('/api/annees/', {'libelle': '2026-2027'}, format='json').status_code, 400)  # existe déjà
        r = d.post('/api/trimestres/', {'annee_scolaire': a['annee'].id, 'nom': 'trimestre 1'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)  # « Trimestre 1 » existe déjà dans cette année
        self.assertEqual(d.post('/api/trimestres/', {'annee_scolaire': a['annee'].id, 'nom': 'Semestre'}, format='json').status_code, 400)
        self.assertEqual(d.post('/api/trimestres/', {'annee_scolaire': a['annee'].id, 'nom': 'Trimestre 2'}, format='json').status_code, 201)
        # un trimestre qui a des évaluations : ni renommé, ni suspendu
        t1 = a['trimestre']
        self.assertEqual(d.patch(f'/api/trimestres/{t1.id}/', {'nom': 'Trimestre 3'}, format='json').status_code, 400)
        self.assertEqual(d.patch(f'/api/trimestres/{t1.id}/', {'is_active': False}, format='json').status_code, 400)
        # une année qui a des inscriptions ne change pas de libellé
        self.assertEqual(d.patch(f"/api/annees/{a['annee'].id}/", {'libelle': '2030-2031'}, format='json').status_code, 400)
        contenu = d.get(f"/api/annees/{a['annee'].id}/contenu/").json()
        self.assertEqual(contenu['inscriptions'], 1)
        self.assertEqual(_client(a['enseignant']).get(f"/api/annees/{a['annee'].id}/contenu/").status_code, 403)
        # un trimestre qui a des évaluations ne change pas d'année
        autre = AnneeScolaire.objects.create(libelle='2027-2028', is_active=False, ecole=a['ecole'])
        r = d.patch(f"/api/trimestres/{a['trimestre'].id}/", {'annee_scolaire': autre.id}, format='json')
        self.assertEqual(r.status_code, 400, r.content)


class ResultatsExamenSurTests(TestCase):
    """Liste des admis BEPC : seulement les élèves de 3ème, série valide, liste valable même sans admis, verrouillée après le passage."""

    def setUp(self):
        self.a = _ecole('École BEPC')
        niveau = Niveau.objects.create(nom='3ème', ecole=self.a['ecole'])
        classe = Classe.objects.create(nom='3ème A', niveau=niveau, ecole=self.a['ecole'])
        self.e1 = Eleve.objects.create(nom='Un', prenom='Candidat', matricule=f"B1-{self.a['ecole'].pk}", ecole=self.a['ecole'])
        self.e2 = Eleve.objects.create(nom='Deux', prenom='Candidat', matricule=f"B2-{self.a['ecole'].pk}", ecole=self.a['ecole'])
        for e in (self.e1, self.e2):
            Inscription.objects.create(eleve=e, classe=classe, annee_scolaire=self.a['annee'], ecole=self.a['ecole'])
        self.d = _client(self.a['admin'])

    def saisir(self, ids, series=None):
        return self.d.post('/api/resultats-examen/saisir/', {'examen': 'BEPC', 'eleve_ids': ids, 'series': series or {}}, format='json')

    def test_regles(self):
        from scolarite.models import ResultatExamenNational, PassageAnnee
        # un élève de 6ème n'est pas candidat au BEPC
        self.assertEqual(self.saisir([self.a['eleve'].id]).status_code, 400)
        # série illisible refusée
        self.assertEqual(self.saisir([self.e1.id], {str(self.e1.id): 'Z'}).status_code, 400)
        r = self.saisir([self.e1.id], {str(self.e1.id): '2nde c'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(ResultatExamenNational.objects.get(eleve=self.e1).serie_2nde, 'C')
        self.assertFalse(ResultatExamenNational.objects.get(eleve=self.e2).admis)
        # zéro admis : la liste compte quand même comme enregistrée (tous redoublent, rien n'est « en attente »)
        self.assertEqual(self.saisir([]).status_code, 200)
        c = self.d.get('/api/resultats-examen/candidats/?examen=BEPC').json()
        self.assertTrue(c['liste_enregistree'])
        self.assertEqual(c['nb_admis'], 0)
        from scolarite.passage import listes_examen_importees
        self.assertIn('BEPC', listes_examen_importees(self.a['annee']))
        # un passage lancé pour les autres classes ne fige pas la liste : la 3ème est encore en attente
        suivante = AnneeScolaire.objects.create(libelle='2027-2028', is_active=False, ecole=self.a['ecole'])
        PassageAnnee.objects.create(annee_source=self.a['annee'], annee_cible=suivante, ecole=self.a['ecole'])
        self.assertEqual(self.saisir([self.e1.id], {str(self.e1.id): 'C'}).status_code, 200)
        # une fois les élèves de 3ème placés par le passage : verrouillé
        from scolarite.passage import lancer_passage
        lancer_passage(self.a['annee'], auteur=self.a['admin'])
        self.assertTrue(Inscription.objects.filter(eleve=self.e1, annee_scolaire__libelle='2027-2028').exists())
        self.assertEqual(self.saisir([self.e1.id]).status_code, 409)
        self.assertEqual(self.d.post('/api/resultats-examen/importer-texte/', {'examen': 'BEPC', 'texte': self.e1.matricule}, format='json').status_code, 409)
        self.assertTrue(self.d.get('/api/resultats-examen/candidats/?examen=BEPC').json()['verrouille'])


class OrientationApresBepcTests(TestCase):
    """Après le BEPC, le passage suit le choix de l'élève ; après le BAC, les admis quittent l'école, les autres restent."""

    def test_choix_respectes(self):
        from scolarite.passage import lancer_passage
        a = _ecole('École orientation')
        n3 = Niveau.objects.create(nom='3ème', ecole=a['ecole'])
        nt = Niveau.objects.create(nom='Terminale', ecole=a['ecole'])
        c3 = Classe.objects.create(nom='3ème A', niveau=n3, ecole=a['ecole'])
        ct = Classe.objects.create(nom='Tle D', niveau=nt, ecole=a['ecole'])
        eleves = {}
        for code, classe in (('C', c3), ('T', c3), ('SORT', c3), ('ECHEC', c3), ('BAC', ct), ('BACKO', ct)):
            e = Eleve.objects.create(nom=code, prenom='X', matricule=f"O-{code}-{a['ecole'].pk}", ecole=a['ecole'])
            Inscription.objects.create(eleve=e, classe=classe, annee_scolaire=a['annee'], ecole=a['ecole'])
            eleves[code] = e
        d = _client(a['admin'])
        r = d.post('/api/resultats-examen/saisir/', {'examen': 'BEPC', 'eleve_ids': [eleves[k].id for k in ('C', 'T', 'SORT')],
                                                   'series': {str(eleves['C'].id): 'C', str(eleves['T'].id): 'Technique', str(eleves['SORT'].id): 'quitte'}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(d.post('/api/resultats-examen/saisir/', {'examen': 'BAC', 'eleve_ids': [eleves['BAC'].id]}, format='json').status_code, 200)
        lancer_passage(a['annee'], auteur=a['admin'])

        def classe_suivante(code):
            ins = Inscription.objects.filter(eleve=eleves[code], annee_scolaire__libelle='2027-2028').select_related('classe').first()
            return ins.classe.nom if ins else None
        self.assertEqual(classe_suivante('C'), '2nde C')
        self.assertEqual(classe_suivante('T'), '2nde T')
        self.assertIsNone(classe_suivante('SORT'))            # admis au BEPC, part ailleurs
        self.assertEqual(Inscription.objects.get(eleve=eleves['SORT'], annee_scolaire=a['annee']).statut, 'SORTI')
        self.assertEqual(classe_suivante('ECHEC'), '3ème A')   # non admis : redouble
        self.assertIsNone(classe_suivante('BAC'))             # BAC obtenu : université
        self.assertEqual(Inscription.objects.get(eleve=eleves['BAC'], annee_scolaire=a['annee']).statut, 'DIPLOME')
        self.assertEqual(classe_suivante('BACKO'), 'Tle D')    # BAC raté : reste à l'école


class DirecteurRetireEleveTests(TestCase):
    """Le directeur retire un élève de sa classe (inscription suspendue) puis le réintègre ; jamais dans une autre école."""

    def test_retirer_et_reintegrer(self):
        a, b = _ecole('École retrait'), _ecole('École retrait deux')
        ins = Inscription.objects.get(eleve=a['eleve'], annee_scolaire=a['annee'])
        d = _client(a['admin'])
        self.assertEqual(d.delete(f'/api/inscriptions/{ins.id}/').status_code, 200)
        ins.refresh_from_db()
        self.assertFalse(ins.is_active)
        self.assertEqual(d.post(f'/api/inscriptions/{ins.id}/reactiver/').status_code, 200)
        ins.refresh_from_db()
        self.assertTrue(ins.is_active)
        self.assertEqual(_client(b['admin']).delete(f'/api/inscriptions/{ins.id}/').status_code, 404)
        for qui in ('enseignant', 'eleve_user', 'parent'):
            self.assertEqual(_client(a[qui]).delete(f'/api/inscriptions/{ins.id}/').status_code, 403, qui)


class TransfertEnCoursDeTrimestreTests(TestCase):
    """Un élève changé de classe en cours de trimestre : une seule ligne par matière, et ses anciennes notes comptent."""

    def test_notes_regroupees_par_matiere(self):
        from evaluations.bulletin import construire_bulletin
        from evaluations.models import Note
        from evaluations.moyennes import moyennes_annuelles_eleve
        a = _ecole('École transfert')
        maths = a['cm'].matiere
        francais = Matiere.objects.create(nom='Français', ecole=a['ecole'])
        classe_b = Classe.objects.create(nom='6ème B', niveau=a['classe'].niveau, ecole=a['ecole'])
        maths_b = ClasseMatiere.objects.create(classe=classe_b, matiere=maths, enseignant=a['prof'], coef=2, ecole=a['ecole'])
        fr_b = ClasseMatiere.objects.create(classe=classe_b, matiere=francais, enseignant=a['prof'], coef=1, ecole=a['ecole'])
        eleve = a['eleve']
        Note.objects.create(eleve=eleve, evaluation=a['eval'], valeur=12)  # devoir de maths en 6ème A
        ins = Inscription.objects.get(eleve=eleve, annee_scolaire=a['annee'])
        ins.classe = classe_b  # transfert en 6ème B
        ins.save()
        ev_maths_b = Evaluation.objects.create(type='DEVOIR2', trimestre=a['trimestre'], classe_matiere=maths_b, ecole=a['ecole'])
        ev_fr_b = Evaluation.objects.create(type='DEVOIR1', trimestre=a['trimestre'], classe_matiere=fr_b, ecole=a['ecole'])
        Note.objects.create(eleve=eleve, evaluation=ev_maths_b, valeur=16)
        Note.objects.create(eleve=eleve, evaluation=ev_fr_b, valeur=11)

        data = construire_bulletin(None, eleve, a['trimestre'])
        matieres = [d['matiere'] for d in data['disciplines']]
        self.assertEqual(sorted(matieres), ['Français', 'Maths'])  # Maths une seule fois
        ligne_maths = next(d for d in data['disciplines'] if d['matiere'] == 'Maths')
        self.assertEqual(ligne_maths['moy_20'], 14.0)               # 12 (ancienne classe) et 16 (nouvelle)
        self.assertEqual(data['moyenne_generale'], 13.0)            # (14×2 + 11×1) / 3
        self.assertEqual(moyennes_annuelles_eleve(eleve, a['annee'])['t1'], 13.0)


class SupervisionPlateformeTests(TestCase):
    """Le super admin voit toutes les écoles, l'état du système et les erreurs du serveur ; personne d'autre."""

    def _jwt(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def test_tableau_et_incidents(self):
        from django.http import HttpResponse
        from django.test import RequestFactory
        from accounts.models import IncidentServeur
        from config.supervision import SupervisionMiddleware
        a = _ecole('École supervisée')
        sa = User.objects.create_user(username='sa-supervision', password='x', role='SUPER_ADMIN', is_plateforme=True)
        c = self._jwt(sa)
        r = c.get('/api/plateforme/tableau/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn('École supervisée', [e['nom'] for e in r.json()['ecoles']])
        self.assertTrue(any(x['code'] == 'base' and x['etat'] == 'OK' for x in r.json()['sante']))
        for qui in ('admin', 'enseignant', 'parent'):
            self.assertEqual(self._jwt(a[qui]).get('/api/plateforme/tableau/').status_code, 403, qui)
            self.assertEqual(self._jwt(a[qui]).get('/api/plateforme/incidents/').status_code, 403, qui)
        # une panne est enregistrée avec la page concernée, puis traitée
        mw = SupervisionMiddleware(lambda req: HttpResponse(status=503))
        mw(RequestFactory().get('/api/eleves/42/carte/'))
        mw.process_exception(RequestFactory().post('/api/notes/saisie-masse/'), ValueError('valeur illisible'))
        self.assertEqual(IncidentServeur.objects.count(), 2)
        groupes = c.get('/api/plateforme/incidents/').json()['results']
        self.assertEqual({g['chemin'] for g in groupes}, {'/api/eleves/42/carte/', '/api/notes/saisie-masse/'})
        self.assertTrue(any('valeur illisible' in g['message'] and 'Traceback' in g['detail'] or 'ValueError' in g['message'] for g in groupes))
        ids = [i for g in groupes for i in g['ids']]
        self.assertEqual(c.post('/api/plateforme/incidents/resoudre/', {'ids': ids}, format='json').json()['resolus'], 2)
        self.assertEqual(c.get('/api/plateforme/incidents/').json()['results'], [])


class PilotagePlateformeTests(TestCase):
    """Fiche d'une école, trafic, annonces, erreurs du navigateur, alerte au super admin, adresse de santé."""

    def setUp(self):
        self.a = _ecole('École pilotée')
        self.sa = User.objects.create_user(username='sa-pilotage', password='x', role='SUPER_ADMIN', is_plateforme=True)

    def _jwt(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def test_fiche_et_trafic(self):
        c = self._jwt(self.sa)
        r = c.get(f"/api/plateforme/ecoles/{self.a['ecole'].id}/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['eleves'], 1)
        self.assertEqual(len(r.json()['connexions_30j']), 30)
        self.assertEqual(self._jwt(self.a['admin']).get(f"/api/plateforme/ecoles/{self.a['ecole'].id}/").status_code, 403)
        # le trafic d'une école est compté (une requête du directeur)
        self._jwt(self.a['admin']).get('/api/eleves/')
        jours = c.get('/api/plateforme/trafic/', {'jours': 1, 'ecole': self.a['ecole'].id}).json()['jours']
        self.assertGreaterEqual(jours[-1]['requetes'], 1)

    def test_annonces(self):
        from datetime import timedelta
        from django.utils import timezone
        c = self._jwt(self.sa)
        self.assertEqual(c.post('/api/plateforme/annonces/', {'titre': '', 'message': 'x'}, format='json').status_code, 400)
        r = c.post('/api/plateforme/annonces/', {'titre': 'Maintenance', 'message': 'Ce soir 22 h', 'niveau': 'warning', 'cible': 'DIRECTION'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        titres = lambda u: [x['titre'] for x in self._jwt(u).get('/api/annonces-actives/').json()['results']]
        self.assertEqual(titres(self.a['admin']), ['Maintenance'])
        self.assertEqual(titres(self.a['parent']), [])  # réservée à la direction
        c.post('/api/plateforme/annonces/', {'titre': 'Pour tous', 'message': 'Bonne rentrée'}, format='json')
        self.assertEqual(titres(self.a['parent']), ['Pour tous'])
        passee = c.post('/api/plateforme/annonces/', {'titre': 'Finie', 'message': 'x',
                                                      'debut': (timezone.now() - timedelta(days=2)).isoformat(),
                                                      'fin': (timezone.now() - timedelta(days=1)).isoformat()}, format='json').json()
        self.assertNotIn('Finie', titres(self.a['parent']))
        self.assertFalse(passee['en_cours'])
        # arrêter une annonce
        ident = r.json()['id']
        c.patch(f'/api/plateforme/annonces/{ident}/', {'active': False}, format='json')
        self.assertEqual(titres(self.a['admin']), ['Pour tous'])
        self.assertEqual(self._jwt(self.a['admin']).post('/api/plateforme/annonces/', {'titre': 'x', 'message': 'y'}, format='json').status_code, 403)

    def test_erreur_navigateur_et_alerte(self):
        from accounts.models import IncidentServeur
        from notifications.models import Notification
        self.assertEqual(APIClient().post('/api/erreur-client/', {'message': 'x'}, format='json').status_code, 401)
        corps = {'page': '/eleves', 'message': "TypeError: Cannot read properties of undefined (reading 'nom')", 'pile': 'at ListeEleves'}
        self.assertEqual(self._jwt(self.a['admin']).post('/api/erreur-client/', corps, format='json').status_code, 204)
        inc = IncidentServeur.objects.get(niveau='CLIENT')
        self.assertEqual((inc.chemin, inc.ecole_id, inc.role), ('/eleves', self.a['ecole'].id, 'ADMIN'))
        # le super admin est prévenu une seule fois pour la même erreur
        self._jwt(self.a['admin']).post('/api/erreur-client/', corps, format='json')
        self.assertEqual(Notification.objects.filter(destinataire=self.sa, lien='/plateforme/incidents').count(), 1)
        self.assertEqual(self._jwt(self.sa).get('/api/plateforme/incidents/', {'niveau': 'CLIENT'}).json()['results'][0]['nombre'], 2)

    def test_adresse_de_sante_publique(self):
        r = APIClient().get('/api/sante/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['ok'])


class ComptesPlateformeTests(TestCase):
    """Le super admin voit, corrige et dépanne tous les comptes de toutes les écoles ; personne d'autre."""

    def setUp(self):
        self.a, self.b = _ecole('École comptes A'), _ecole('École comptes B')
        self.sa = User.objects.create_user(username='sa-comptes', password='x', role='SUPER_ADMIN', is_plateforme=True)

    def _jwt(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def test_liste_modification_mot_de_passe_statut(self):
        c = self._jwt(self.sa)
        tous = c.get('/api/plateforme/comptes/').json()
        self.assertGreaterEqual(tous['count'], 8)  # les comptes des deux écoles
        self.assertNotIn('sa-comptes', [u['username'] for u in tous['results']])  # pas les comptes de la plateforme
        ens_b = c.get('/api/plateforme/comptes/', {'ecole': self.b['ecole'].id, 'role': 'ENSEIGNANT'}).json()
        self.assertEqual([u['id'] for u in ens_b['results']], [self.b['enseignant'].id])
        cible = self.a['parent']
        # corriger le nom ; l'identifiant reste unique
        r = c.patch(f'/api/plateforme/comptes/{cible.id}/', {'prenom': 'Awa', 'nom_famille': 'Ouédraogo'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['nom'], 'Awa Ouédraogo')
        self.assertEqual(c.patch(f'/api/plateforme/comptes/{cible.id}/', {'username': self.b['admin'].username}, format='json').status_code, 400)
        # mot de passe : trop simple refusé ; provisoire généré ; changement imposé
        self.assertEqual(c.post(f'/api/plateforme/comptes/{cible.id}/mot-de-passe/', {'nouveau': '12345678'}, format='json').status_code, 400)
        r = c.post(f'/api/plateforme/comptes/{cible.id}/mot-de-passe/', {}, format='json')
        cible.refresh_from_db()
        self.assertTrue(cible.check_password(r.json()['mot_de_passe_temporaire']))
        self.assertTrue(cible.must_change_password)
        # suspendre : motif obligatoire
        self.assertEqual(c.patch(f'/api/plateforme/comptes/{cible.id}/', {'actif': False}, format='json').status_code, 400)
        self.assertEqual(c.patch(f'/api/plateforme/comptes/{cible.id}/', {'actif': False, 'motif': 'Numéro réattribué'}, format='json').status_code, 200)
        cible.refresh_from_db()
        self.assertFalse(cible.is_active)
        c.patch(f'/api/plateforme/comptes/{cible.id}/', {'actif': True}, format='json')
        cible.refresh_from_db()
        self.assertTrue(cible.is_active)
        # personne d'autre n'y a accès, pas même un directeur
        for qui in ('admin', 'enseignant', 'parent'):
            u = self._jwt(self.a[qui])
            self.assertEqual(u.get('/api/plateforme/comptes/').status_code, 403, qui)
            self.assertEqual(u.post(f"/api/plateforme/comptes/{self.b['admin'].id}/mot-de-passe/", {}, format='json').status_code, 403, qui)


class PageAccueilPlateformeTests(TestCase):
    """La page de connexion : publique en lecture ; seul le super admin change textes, couleur et photos."""

    def _jwt(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def _image(self):
        import io
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        b = io.BytesIO()
        Image.new('RGB', (2400, 1200), (30, 90, 160)).save(b, 'JPEG')
        return SimpleUploadedFile('classe.jpg', b.getvalue(), content_type='image/jpeg')

    def test_accueil(self):
        import shutil
        import tempfile
        from django.test import override_settings
        a = _ecole('École accueil')
        sa = User.objects.create_user(username='sa-accueil', password='x', role='SUPER_ADMIN', is_plateforme=True)
        public = APIClient().get('/api/accueil/')
        self.assertEqual(public.status_code, 200)
        self.assertEqual(len(public.json()['photos']), 4)  # photos livrées tant qu'aucune n'est ajoutée
        self.assertGreaterEqual(public.json()['chiffres']['ecoles'], 1)
        c = self._jwt(sa)
        self.assertEqual(c.put('/api/plateforme/accueil/', {'couleur': 'bleu'}, format='json').status_code, 400)
        r = c.put('/api/plateforme/accueil/', {'titre': 'Votre école, en ligne', 'couleur': '#1b5e20'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(APIClient().get('/api/accueil/').json()['titre'], 'Votre école, en ligne')
        dossier = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=dossier):
                r = c.post('/api/plateforme/accueil/photos/', {'image': self._image(), 'credit': 'Photo de l\'école'}, format='multipart')
                self.assertEqual(r.status_code, 201, r.content)
                self.assertTrue(r.json()['url'].endswith('.webp'))  # optimisée
                photos = APIClient().get('/api/accueil/').json()['photos']
                self.assertEqual([p['credit'] for p in photos], ["Photo de l'école"])
                ident = r.json()['id']
                c.patch(f'/api/plateforme/accueil/photos/{ident}/', {'active': False}, format='json')
                self.assertEqual(len(APIClient().get('/api/accueil/').json()['photos']), 4)  # retour aux photos livrées
                self.assertEqual(c.delete(f'/api/plateforme/accueil/photos/{ident}/').status_code, 204)
                fichier_texte = __import__('django.core.files.uploadedfile', fromlist=['x']).SimpleUploadedFile('x.jpg', b'pas une image')
                self.assertEqual(c.post('/api/plateforme/accueil/photos/', {'image': fichier_texte}, format='multipart').status_code, 400)
        finally:
            shutil.rmtree(dossier, ignore_errors=True)
        # personne d'autre ne modifie l'accueil
        for qui in ('admin', 'enseignant', 'parent'):
            self.assertEqual(self._jwt(a[qui]).put('/api/plateforme/accueil/', {'titre': 'x'}, format='json').status_code, 403, qui)


class ParcoursCreationEcoleTests(TestCase):
    """Demande d'école sans mot de passe → validation par la plateforme → mot de passe provisoire → connexion par e-mail ;
    puis changement d'e-mail par le directeur, signalé à la plateforme."""

    DEMANDE = {
        'nom_ecole': 'Lycée Privé Espoir', 'statut_juridique': 'PRIVE_CONFESSIONNEL', 'ordre_enseignement': 'SECONDAIRE',
        'annee_creation': '2011', 'numero_autorisation': 'Arrêté 2011-120/MENA', 'ville': 'Koudougou',
        'direction_regionale': 'DREPS du Centre-Ouest', 'telephone': '25 44 00 00',
        'directeur': 'Awa Ouédraogo', 'email': 'Directrice@Espoir.bf', 'telephone_directeur': '70 11 22 33',
    }

    def _jwt(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def test_parcours_complet(self):
        from notifications.models import Notification
        sa = User.objects.create_user(username='sa-parcours', password='x', role='SUPER_ADMIN', is_plateforme=True)
        anonyme = APIClient()
        # champs obligatoires : statut, ordre, téléphone du directeur valide
        self.assertEqual(anonyme.post('/api/ecoles/inscription/', {**self.DEMANDE, 'telephone_directeur': '12'}, format='json').status_code, 400)
        r = anonyme.post('/api/ecoles/inscription/', self.DEMANDE, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['email'], 'directrice@espoir.bf')
        self.assertTrue(Notification.objects.filter(destinataire=sa, titre__contains='Lycée Privé Espoir').exists())
        # même e-mail : refusé ; pas de connexion possible avant la validation
        self.assertEqual(anonyme.post('/api/ecoles/inscription/', {**self.DEMANDE, 'nom_ecole': 'Autre'}, format='json').status_code, 400)
        directeur = User.objects.get(email='directrice@espoir.bf')
        self.assertFalse(directeur.has_usable_password())
        ecole = directeur.ecole
        self.assertEqual((ecole.statut_juridique, ecole.ordre_enseignement, ecole.numero_autorisation),
                         ('PRIVE_CONFESSIONNEL', 'SECONDAIRE', 'Arrêté 2011-120/MENA'))
        # validation : mot de passe provisoire
        r = self._jwt(sa).post(f'/api/ecoles/{ecole.id}/valider/')
        self.assertEqual(r.status_code, 200, r.content)
        acces = r.json()['identifiants']
        self.assertEqual(acces['email'], 'directrice@espoir.bf')
        login = anonyme.post('/api/auth/login/', {'username': 'directrice@espoir.bf', 'password': acces['mot_de_passe_temporaire']}, format='json')
        self.assertEqual(login.status_code, 200, login.content)
        self.assertTrue(login.json()['must_change_password'])
        # une deuxième validation (réactivation) ne change pas un mot de passe déjà donné
        self.assertIsNone(self._jwt(sa).post(f'/api/ecoles/{ecole.id}/reactiver/').json()['identifiants'])

        # le directeur change d'e-mail : même mot de passe, nouvel e-mail ; la plateforme est prévenue
        c = self._jwt(directeur)
        self.assertEqual(c.patch('/api/auth/mon-compte/', {'email': 'awa@espoir.bf', 'mot_de_passe': 'faux'}, format='json').status_code, 400)
        self.assertEqual(c.patch('/api/auth/mon-compte/', {'email': 'sa-parcours@x.bf', 'mot_de_passe': acces['mot_de_passe_temporaire']}, format='json').status_code, 200)
        r = c.patch('/api/auth/mon-compte/', {'email': 'awa@espoir.bf', 'mot_de_passe': acces['mot_de_passe_temporaire']}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['email'], 'awa@espoir.bf')
        self.assertEqual(anonyme.post('/api/auth/login/', {'username': 'awa@espoir.bf', 'password': acces['mot_de_passe_temporaire']}, format='json').status_code, 200)
        self.assertNotEqual(anonyme.post('/api/auth/login/', {'username': 'directrice@espoir.bf', 'password': acces['mot_de_passe_temporaire']}, format='json').status_code, 200)
        alerte = Notification.objects.filter(destinataire=sa, titre__contains="Changement d'e-mail").first()
        self.assertIsNotNone(alerte)
        self.assertIn('awa@espoir.bf', alerte.message)
        # un e-mail déjà pris par un autre compte est refusé
        autre = _ecole('École e-mail')
        autre['admin'].email = 'pris@ecole.bf'
        autre['admin'].save()
        self.assertEqual(c.patch('/api/auth/mon-compte/', {'email': 'pris@ecole.bf', 'mot_de_passe': acces['mot_de_passe_temporaire']}, format='json').status_code, 400)


class MatriculeUniqueTests(TestCase):
    """Un matricule déjà pris dans l'école est refusé avec un message clair ; une autre école peut le réutiliser."""

    def test_doublon_refuse(self):
        a, b = _ecole('École matricule A'), _ecole('École matricule B')
        d = _client(a['admin'])
        pris = a['eleve'].matricule
        for valeur in (pris, pris.lower()):
            r = d.post('/api/eleves/', {'matricule': valeur, 'nom': 'Doublon', 'prenom': 'Test'}, format='json')
            self.assertEqual(r.status_code, 400, r.content)
            self.assertIn('déjà attribué', str(r.json()['matricule']))
        # modifier un élève en prenant le matricule d'un autre : refusé ; garder le sien : accepté
        autre = Eleve.objects.create(nom='Autre', prenom='Elève', matricule='ZZ-1', ecole=a['ecole'])
        sec = _client(_secretaire(a))  # la modification d'une fiche est faite par la secrétaire
        self.assertEqual(sec.patch(f'/api/eleves/{autre.id}/', {'matricule': pris}, format='json').status_code, 400)
        self.assertEqual(sec.patch(f'/api/eleves/{autre.id}/', {'matricule': 'ZZ-1', 'prenom': 'Modifié'}, format='json').status_code, 200)
        # une autre école peut utiliser le même matricule
        r = _client(b['admin']).post('/api/eleves/', {'matricule': pris, 'nom': 'Ailleurs', 'prenom': 'Test'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)


class MatriculeAutomatiqueTests(TestCase):
    """Sans matricule saisi, l'école en attribue un : initiales du nom + numéro, jamais deux fois le même."""

    def test_prefixe_depuis_le_nom(self):
        from eleves.matricules import prefixe_depuis_nom
        self.assertEqual(prefixe_depuis_nom('Complexe Scolaire Charles de Gaulle'), 'CSCG')
        self.assertEqual(prefixe_depuis_nom("Collège de l'Étoile du Sud"), 'CES')
        self.assertEqual(prefixe_depuis_nom('Bangr-Weoogo'), 'BANG')
        self.assertEqual(prefixe_depuis_nom('Excellence'), 'EXCE')

    def test_numerotation_par_ecole(self):
        a, b = _ecole('Complexe Scolaire Charles de Gaulle'), _ecole('Complexe Scolaire Charles de Gaulle')
        d = _client(a['admin'])
        propose = d.get('/api/eleves/prochain-matricule/').json()['matricule']
        pref = a['ecole'].__class__.objects.get(pk=a['ecole'].pk).prefixe_matricule
        self.assertEqual(propose, f'{pref}1')
        for n in (1, 2):
            r = d.post('/api/eleves/', {'nom': 'Auto', 'prenom': str(n)}, format='json')
            self.assertEqual(r.status_code, 201, r.content)
            self.assertEqual(r.json()['matricule'], f'{pref}{n}')
            self.assertEqual(r.json()['compte']['username'], f'{pref}{n}')
        # saisi à la main, un matricule reste possible ; le numéro suivant ne retombe jamais sur un doublon
        d.post('/api/eleves/', {'matricule': f'{pref}7', 'nom': 'Manuel', 'prenom': 'X'}, format='json')
        self.assertEqual(d.get('/api/eleves/prochain-matricule/').json()['matricule'], f'{pref}8')
        # deux écoles au même préfixe ne partagent jamais d'identifiant de connexion
        r = _client(b['admin']).post('/api/eleves/', {'nom': 'Autre', 'prenom': 'Ecole'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertNotEqual(r.json()['matricule'], f'{pref}1')
        self.assertEqual(r.json()['matricule'], 'CSCGA1')


class ImportExcelMatriculeTests(TestCase):
    """L'import Excel ne remplace jamais un élève existant : un matricule déjà pris est refusé, ligne par ligne."""

    def test_import_refuse_les_doublons(self):
        import io
        from openpyxl import Workbook
        from django.core.files.uploadedfile import SimpleUploadedFile
        a = _ecole('École import')
        pris = a['eleve'].matricule
        wb = Workbook()
        ws = wb.active
        ws.append(['matricule', 'nom', 'prenom'])
        ws.append(['(modèle)'])
        ws.append([pris, 'Usurpateur', 'Test'])          # existe déjà
        ws.append(['NEW-1', 'Nouveau', 'Un'])
        ws.append(['new-1', 'Même', 'Matricule'])         # doublon dans le fichier (casse différente)
        b = io.BytesIO()
        wb.save(b)
        fichier = SimpleUploadedFile('eleves.xlsx', b.getvalue())
        r = _client(a['admin']).post('/api/eleves/import-excel/', {'file': fichier}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        j = r.json()
        self.assertEqual(j['created'], 1)
        self.assertEqual(len(j['errors']), 2)
        self.assertTrue(all('déjà attribué' in e['erreur'] for e in j['errors']))
        a['eleve'].refresh_from_db()
        self.assertEqual(a['eleve'].nom, 'Élève')  # la fiche existante n'a pas été modifiée


class MaintenanceEtAnnoncesCibleesTests(TestCase):
    """Maintenance : tout le monde est bloqué sauf le super admin ; annonces ciblées par école avec notification dans la cloche."""

    def setUp(self):
        from config.supervision import oublier_cache_maintenance
        self.oublier = oublier_cache_maintenance
        self.a, self.b = _ecole('École cible'), _ecole('École autre')
        self.sa = User.objects.create_user(username='sa-maint', password='x', role='SUPER_ADMIN', is_plateforme=True)

    def tearDown(self):
        from accounts.models import Maintenance
        Maintenance.objects.all().delete()
        self.oublier()

    def _jwt(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def test_maintenance(self):
        from datetime import timedelta
        from django.utils import timezone
        sa = self._jwt(self.sa)
        self.assertFalse(APIClient().get('/api/maintenance/').json()['en_cours'])
        self.assertEqual(self._jwt(self.a['admin']).get('/api/eleves/').status_code, 200)
        # personne d'autre ne la lance
        self.assertEqual(self._jwt(self.a['admin']).put('/api/plateforme/maintenance/', {'actif': True}, format='json').status_code, 403)
        # fin avant début : refusé
        debut = timezone.now() - timedelta(minutes=1)
        self.assertEqual(sa.put('/api/plateforme/maintenance/', {'actif': True, 'debut': debut.isoformat(),
                                                                   'fin': (debut - timedelta(hours=1)).isoformat()}, format='json').status_code, 400)
        r = sa.put('/api/plateforme/maintenance/', {'actif': True, 'debut': debut.isoformat(), 'fin': (timezone.now() + timedelta(hours=1)).isoformat(),
                                                    'message': 'Mise à jour de la base.'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['en_cours'])
        # la page publique le sait ; les utilisateurs sont bloqués ; le super admin et la connexion passent
        pub = APIClient().get('/api/maintenance/').json()
        self.assertTrue(pub['en_cours'])
        self.assertEqual(pub['message'], 'Mise à jour de la base.')
        bloque = self._jwt(self.a['admin']).get('/api/eleves/')
        self.assertEqual(bloque.status_code, 503)
        self.assertTrue(bloque.json()['maintenance'])
        self.assertEqual(APIClient().get('/api/vitrine/zzz/').status_code, 503)
        self.assertEqual(sa.get('/api/plateforme/tableau/').status_code, 200)
        self.assertEqual(APIClient().post('/api/auth/login/', {'username': 'sa-maint', 'password': 'x'}, format='json').status_code, 200)
        self.assertEqual(APIClient().get('/api/sante/').status_code, 200)
        # l'arrêter rend tout de suite l'accès
        sa.put('/api/plateforme/maintenance/', {'actif': False}, format='json')
        self.assertEqual(self._jwt(self.a['admin']).get('/api/eleves/').status_code, 200)

    def test_maintenance_programmee_ne_bloque_pas_avant_l_heure(self):
        from datetime import timedelta
        from django.utils import timezone
        sa = self._jwt(self.sa)
        sa.put('/api/plateforme/maintenance/', {'actif': True, 'debut': (timezone.now() + timedelta(hours=3)).isoformat()}, format='json')
        pub = APIClient().get('/api/maintenance/').json()
        self.assertTrue(pub['programmee'])
        self.assertFalse(pub['en_cours'])
        self.assertEqual(self._jwt(self.a['admin']).get('/api/eleves/').status_code, 200)

    def test_annonce_ciblee_et_notification(self):
        from notifications.models import Notification
        sa = self._jwt(self.sa)
        r = sa.post('/api/plateforme/annonces/', {'titre': 'Pour une école', 'message': 'Réunion', 'ecoles': [self.a['ecole'].id]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertGreater(r.json()['notifies'], 0)
        titres = lambda u: [x['titre'] for x in self._jwt(u).get('/api/annonces-actives/').json()['results']]
        self.assertEqual(titres(self.a['admin']), ['Pour une école'])
        self.assertEqual(titres(self.b['admin']), [])
        self.assertTrue(Notification.objects.filter(destinataire=self.a['parent'], titre='Pour une école').exists())
        self.assertFalse(Notification.objects.filter(destinataire=self.b['parent'], titre='Pour une école').exists())
        # annonce « direction » : pas de notification pour les parents
        sa.post('/api/plateforme/annonces/', {'titre': 'Direction seule', 'message': 'x', 'cible': 'DIRECTION', 'ecoles': [self.a['ecole'].id]}, format='json')
        self.assertTrue(Notification.objects.filter(destinataire=self.a['admin'], titre='Direction seule').exists())
        self.assertFalse(Notification.objects.filter(destinataire=self.a['parent'], titre='Direction seule').exists())

    def test_la_cloche_du_super_admin_fonctionne(self):
        from notifications.models import Notification
        Notification.objects.create(destinataire=self.sa, type='INFO', titre='Nouvelle école à valider', message='x')
        c = self._jwt(self.sa)
        r = c.get('/api/notifications/non_lues/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['count'], 1)
        # chacun ne voit que ses propres notifications
        self.assertEqual(self._jwt(self.a['admin']).get('/api/notifications/non_lues/').json()['count'], 0)


class ConnexionParEcoleTests(TestCase):
    """/ecole/<slug>/connexion marche pour toute école validée, avec ou sans site public ; pas pour les autres."""

    def test_connexion_toutes_ecoles(self):
        a = _ecole('École connexion A')
        e = a['ecole']
        self.assertTrue(e.slug)
        c = APIClient()
        r = c.get(f'/api/ecole-connexion/{e.slug}/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['nom_ecole'], e.nom_ecole)
        # sans site public : la page de connexion existe quand même
        type(e).objects.filter(pk=e.pk).update(vitrine_active=False)
        r = c.get(f'/api/ecole-connexion/{e.slug}/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()['site_public'])
        # école non validée ou inconnue : introuvable
        type(e).objects.filter(pk=e.pk).update(statut='EN_ATTENTE')
        self.assertEqual(c.get(f'/api/ecole-connexion/{e.slug}/').status_code, 404)
        self.assertEqual(c.get('/api/ecole-connexion/nexiste-pas/').status_code, 404)


class ErreursEnFrancaisTests(TestCase):
    """Toute erreur de l'API est expliquée en français, jamais une page technique ni un message anglais."""

    def test_messages_clairs(self):
        from unittest import mock
        a = _ecole('École erreurs')
        d = _client(a['admin'])
        r = d.get('/api/eleves/99999999/')
        self.assertEqual(r.status_code, 404)
        self.assertIn('introuvable', r.json()['detail'])
        r = d.get('/api/adresse-qui-nexiste-pas/')
        self.assertEqual(r.status_code, 404)
        self.assertIn("n'existe pas", r.json()['detail'])
        r = APIClient().get('/api/eleves/')
        self.assertEqual(r.status_code, 401)
        self.assertIn('session', r.json()['detail'])
        r = _client(a['enseignant']).post('/api/eleves/', {'nom': 'X', 'prenom': 'Y'}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertIn('droit', r.json()['detail'])
        # erreur imprévue : phrase claire pour l'utilisateur, détail technique réservé au suivi des incidents
        with mock.patch('eleves.views.EleveViewSet.list', side_effect=RuntimeError('boum secret')):
            r = d.get('/api/eleves/')
        self.assertEqual(r.status_code, 500)
        self.assertIn('erreur est survenue', r.json()['detail'])
        self.assertNotIn('boum', r.content.decode())
        from accounts.models import IncidentServeur
        self.assertTrue(IncidentServeur.objects.filter(message__contains='boum secret').exists())


class TelephoneAutrePaysTests(TestCase):
    """Une école d'un autre pays que le Burkina Faso peut se créer avec son indicatif."""

    def test_indicatif_autre_pays(self):
        base = dict(ParcoursCreationEcoleTests.DEMANDE)
        c = APIClient()
        r = c.post('/api/ecoles/inscription/', {**base, 'telephone': '+225 27 22 44 55 66', 'telephone_directeur': '+225 07 12 34 56 78'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        from parametres.models import Parametres
        e = Parametres.objects.get(email__iexact=base['email'])
        self.assertEqual(e.telephone_directeur, '+2250712345678')
        # le Burkina Faso garde son format habituel
        r = c.post('/api/ecoles/inscription/', {**base, 'nom_ecole': 'Autre école BF', 'email': 'autre@ecole.bf', 'telephone': '20 97 00 00', 'telephone_directeur': '70 12 34 56'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Parametres.objects.get(nom_ecole='Autre école BF').telephone_directeur, '22670123456')
        # un numéro sans indicatif et trop court reste refusé, avec une explication claire
        r = c.post('/api/ecoles/inscription/', {**base, 'nom_ecole': 'Troisième', 'email': 'troisieme@ecole.bf', 'telephone_directeur': '12'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('indicatif', str(r.json()['telephone_directeur']))


class NomDeClasseLettreTests(TestCase):
    """À la création d'une classe on saisit seulement la lettre : A dans le niveau 6ème donne « 6ème A »."""

    def test_lettre_seule(self):
        a = _ecole('École classes lettres')
        d = _client(a['admin'])
        niveau = a['classe'].niveau
        r = d.post('/api/classes/', {'nom': 'q', 'niveau': niveau.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['nom'], f'{niveau.nom} Q')
        # le nom complet saisi par habitude est ramené à la lettre
        r = d.post('/api/classes/', {'nom': f'{niveau.nom} R', 'niveau': niveau.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['nom'], f'{niveau.nom} R')
        # chiffres, espaces, symboles : refusés avec une explication
        for mauvais in ('A1', '3', 'A B', 'A-', 'ABCD'):
            r = d.post('/api/classes/', {'nom': mauvais, 'niveau': niveau.id}, format='json')
            self.assertEqual(r.status_code, 400, mauvais)
            self.assertIn('lettre', str(r.json()['nom']).lower(), mauvais)
        # doublon dans le même niveau
        r = d.post('/api/classes/', {'nom': 'Q', 'niveau': niveau.id}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('existe déjà', str(r.json()['nom']))
        # modifier : la lettre change le nom, une classe inchangée reste acceptée
        cid = d.post('/api/classes/', {'nom': 'S', 'niveau': niveau.id}, format='json').json()['id']
        r = d.patch(f'/api/classes/{cid}/', {'nom': 'T'}, format='json')
        self.assertEqual(r.json()['nom'], f'{niveau.nom} T')
        self.assertEqual(d.patch(f'/api/classes/{cid}/', {'nom': f'{niveau.nom} T'}, format='json').status_code, 200)


class ProgrammeCompositionParClasseTests(TestCase):
    """Collège (6ème à 3ème) : même programme pour toutes les classes. Lycée (2nde, 1ère, Terminale) : un programme par classe."""

    def _cadre(self, nom_ecole):
        from datetime import timedelta
        from django.utils import timezone
        from cours.models import ClasseMatiere, Matiere
        from evaluations.models import CalendrierComposition
        a = _ecole(nom_ecole)
        debut = timezone.localdate() + timedelta(days=30)
        niveau = Niveau.objects.create(nom='Terminale', ecole=a['ecole'])
        tle_a = Classe.objects.create(nom='Terminale A', niveau=niveau, ecole=a['ecole'])
        tle_d = Classe.objects.create(nom='Terminale D', niveau=niveau, ecole=a['ecole'])
        maths, physique = a['cm'].matiere, Matiere.objects.create(nom='Physique', ecole=a['ecole'])
        ClasseMatiere.objects.create(classe=tle_a, matiere=maths, ecole=a['ecole'])
        ClasseMatiere.objects.create(classe=tle_d, matiere=maths, ecole=a['ecole'])
        ClasseMatiere.objects.create(classe=tle_d, matiere=physique, ecole=a['ecole'])  # enseignée en D seulement
        cal = CalendrierComposition.objects.create(niveau=niveau, trimestre=a['trimestre'], date_debut=debut,
                                                   date_fin=debut + timedelta(days=6), publie=True, ecole=a['ecole'])
        return a, debut, cal, tle_a, tle_d, maths, physique

    def _prog(self, d, cal, classe, matiere, jour):
        return d.post('/api/programmes-composition/', {
            'calendrier': cal.id, 'classe': classe.id if classe else None, 'matiere': matiere.id, 'date_composition': str(jour)}, format='json')

    def test_lycee_programme_par_classe(self):
        from datetime import timedelta
        a, debut, cal, tle_a, tle_d, maths, physique = self._cadre('École programme lycée')
        d = _client(a['admin'])
        self.assertEqual(self._prog(d, cal, tle_a, maths, debut).status_code, 201)
        self.assertEqual(self._prog(d, cal, tle_d, maths, debut + timedelta(days=2)).status_code, 201)  # même matière, autre jour
        self.assertEqual(self._prog(d, cal, tle_d, physique, debut + timedelta(days=3)).status_code, 201)
        # matière non enseignée dans la classe, doublon, absence de classe, classe d'un autre niveau : refusés
        r = self._prog(d, cal, tle_a, physique, debut)
        self.assertEqual(r.status_code, 400)
        self.assertIn("n'est pas enseignée", str(r.json()))
        self.assertEqual(self._prog(d, cal, tle_d, maths, debut).status_code, 400)
        self.assertEqual(self._prog(d, cal, None, maths, debut).status_code, 400)
        self.assertEqual(self._prog(d, cal, a['classe'], maths, debut).status_code, 400)
        # le parent d'un élève de Tle A ne voit que le programme de Tle A ; la direction voit tout
        eleve = Eleve.objects.create(nom='Élève', prenom='Tle A', matricule=f"TA-{a['ecole'].pk}", ecole=a['ecole'])
        Inscription.objects.create(eleve=eleve, classe=tle_a, annee_scolaire=a['annee'], ecole=a['ecole'])
        a['parent'].enfants.add(eleve)
        lire = lambda qui, suite='': [p for c in (lambda j: j['results'] if isinstance(j, dict) else j)(
            _client(a[qui]).get('/api/calendriers-composition/' + suite).json()) for p in c['programmes']]
        self.assertEqual([(p['classe'], p['matiere']) for p in lire('parent', f'?eleve_id={eleve.id}')], [(tle_a.id, maths.id)])
        self.assertEqual(len(lire('admin')), 3)
        liste = _client(a['parent']).get(f'/api/programmes-composition/?eleve_id={eleve.id}').json()
        liste = liste['results'] if isinstance(liste, dict) else liste
        self.assertEqual({p['classe'] for p in liste}, {tle_a.id})

    def test_college_meme_programme_pour_toutes_les_classes(self):
        from datetime import timedelta
        from django.utils import timezone
        from evaluations.models import CalendrierComposition
        a = _ecole('École programme collège')
        debut = timezone.localdate() + timedelta(days=30)
        cal = CalendrierComposition.objects.create(niveau=a['classe'].niveau, trimestre=a['trimestre'], date_debut=debut,
                                                   date_fin=debut + timedelta(days=4), publie=True, ecole=a['ecole'])
        d = _client(a['admin'])
        # une classe indiquée au collège est ignorée : le programme vaut pour tout le niveau
        r = self._prog(d, cal, a['classe'], a['cm'].matiere, debut)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIsNone(r.json()['classe'])
        self.assertEqual(self._prog(d, cal, None, a['cm'].matiere, debut).status_code, 400)  # doublon
        for qui in ('enseignant', 'eleve_user', 'parent'):
            vus = [p for c in (lambda j: j['results'] if isinstance(j, dict) else j)(_client(a[qui]).get('/api/calendriers-composition/').json())
                   for p in c['programmes']]
            self.assertEqual(len(vus), 1, qui)
        self.assertTrue(_client(a['admin']).get('/api/niveaux/').json())
        niveaux = _client(a['admin']).get('/api/niveaux/').json()
        niveaux = niveaux['results'] if isinstance(niveaux, dict) else niveaux
        self.assertFalse(niveaux[0]['programme_par_classe'])


class JournalSansActionsPlateformeTests(TestCase):
    """Le directeur ne voit jamais les actions du super admin dans son journal ; le super admin voit tout."""

    def test_journal_du_directeur_sans_super_admin(self):
        from accounts.journal import noter
        a = _ecole('École journal plateforme')
        sa = User.objects.create_user(username='sa-journal', password='x', role='SUPER_ADMIN', is_plateforme=True)
        noter('MODIFICATION', 'Compte', 'Mot de passe réinitialisé', user=sa, ecole=a['ecole'])
        noter('CREATION', 'Élève', 'Awa Test', user=a['admin'], ecole=a['ecole'])

        def lignes(user):
            j = _client(user).get('/api/journal/?page_size=200').json()
            return j['results'] if isinstance(j, dict) else j

        vus_directeur = {x['nom_utilisateur'] for x in lignes(a['admin'])}
        self.assertNotIn('sa-journal', vus_directeur)
        self.assertTrue(any(x['objet_type'] == 'Élève' for x in lignes(a['admin'])))
        filtres = _client(a['admin']).get('/api/journal/filtres/').json()
        self.assertNotIn('sa-journal', [p['nom'] for p in filtres['personnes']])
        # le super admin voit les actions de tout le monde
        vus_sa = {x['nom_utilisateur'] for x in lignes(sa)}
        self.assertIn('sa-journal', vus_sa)
        self.assertTrue(any(x['objet_type'] == 'Élève' for x in lignes(sa)))


class ResponsableSitePublicTests(TestCase):
    """Le directeur donne à un membre de son équipe la gestion du site public — et rien d'autre."""

    def test_responsable_du_site_public(self):
        a = _ecole('École responsable site')
        # le directeur crée le compte avec le rôle « responsable du site public »
        r = _client(a['admin']).post('/api/users/', {'username': '22670999888', 'first_name': 'Issa', 'last_name': 'Compaoré',
                                                       'role': 'COMMUNICATION', 'password': 'MotDePasse#2026'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        resp = User.objects.get(username='22670999888')
        self.assertEqual((resp.role, resp.ecole_id), ('COMMUNICATION', a['ecole'].id))
        c = _client(resp)
        # actualités : lire, publier, modifier
        r = c.post('/api/actualites/', {'titre': 'Rentrée', 'contenu': 'Bienvenue', 'publie': True}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(c.get('/api/actualites/').status_code, 200)
        self.assertEqual(c.patch(f"/api/actualites/{r.json()['id']}/", {'titre': 'Rentrée 2026'}, format='json').status_code, 200)
        # vitrine : présentation, contacts, affichage
        r = c.put('/api/parametres/', {'presentation_vitrine': 'Une école ouverte sur le monde', 'vitrine_whatsapp': '70123456',
                                       'vitrine_afficher_tarifs': False}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        a['ecole'].refresh_from_db()
        self.assertEqual(a['ecole'].presentation_vitrine, 'Une école ouverte sur le monde')
        # mais ni identité, ni mots de passe par défaut, ni couleur : refusé
        for interdit in ({'nom_ecole': 'Piraté'}, {'mot_de_passe_defaut_eleves': 'abcdef'}, {'couleur_primaire': '#ff0000'},
                         {'presentation_vitrine': 'ok', 'directeur': 'Autre'}):
            r = c.put('/api/parametres/', interdit, format='json')
            self.assertEqual(r.status_code, 403, interdit)
            self.assertIn('site public', r.json()['detail'])
        a['ecole'].refresh_from_db()
        self.assertNotEqual(a['ecole'].nom_ecole, 'Piraté')
        # il ne voit ni les élèves, ni la caisse, ni les notes ; il ne gère pas les comptes
        for url in ('/api/eleves/', '/api/paiements/', '/api/evaluations/', '/api/users/'):
            self.assertEqual(c.get(url).status_code, 403, url)
        # les autres rôles ne gèrent pas le site
        for qui in ('enseignant', 'parent', 'eleve_user'):
            self.assertEqual(_client(a[qui]).post('/api/actualites/', {'titre': 'x', 'contenu': 'y'}, format='json').status_code, 403, qui)
            self.assertEqual(_client(a[qui]).put('/api/parametres/', {'presentation_vitrine': 'x'}, format='json').status_code, 403, qui)
        self.assertEqual(_client(_secretaire(a)).put('/api/parametres/', {'presentation_vitrine': 'x'}, format='json').status_code, 403)
        # un directeur d'une autre école n'a aucune prise sur le compte
        b = _ecole('Autre école responsable')
        self.assertEqual(_client(b['admin']).patch(f'/api/users/{resp.id}/', {'first_name': 'X'}, format='json').status_code, 404)


class EmploiDuTempsParProfesseurTests(TestCase):
    """L'emploi du temps d'un professeur vient des cours qui lui sont affectés : réaffecter le cours déplace le créneau."""

    def test_par_professeur_depuis_l_affectation(self):
        from cours.models import EmploiDuTemps
        a = _ecole('École emploi par professeur')
        autre_prof = Enseignant.objects.create(nom='Deuxième prof', ecole=a['ecole'])
        autre_classe = Classe.objects.create(nom='6ème B', niveau=a['classe'].niveau, ecole=a['ecole'])
        cm_b = ClasseMatiere.objects.create(classe=autre_classe, matiere=a['cm'].matiere, enseignant=a['prof'], coef=2, ecole=a['ecole'])
        EmploiDuTemps.objects.create(classe_matiere=a['cm'], jour='LUNDI', heure_debut='08:00', heure_fin='10:00', salle='S1', ecole=a['ecole'])
        EmploiDuTemps.objects.create(classe_matiere=cm_b, jour='MARDI', heure_debut='09:00', heure_fin='10:00', ecole=a['ecole'])
        d = _client(a['admin'])

        def creneaux(prof, user=d):
            j = user.get(f'/api/emploi-du-temps/?enseignant_id={prof.id}').json()
            return sorted((x['jour'], x['classe_nom']) for x in (j['results'] if isinstance(j, dict) else j))

        # le professeur apparaît dans toutes les classes où le cours lui est affecté
        self.assertEqual(creneaux(a['prof']), [('LUNDI', '6ème A'), ('MARDI', '6ème B')])
        self.assertEqual(creneaux(autre_prof), [])
        # le secrétaire (consultation) voit la même chose ; la liste des professeurs vient des affectations
        sec = _client(_secretaire(a))
        self.assertEqual(creneaux(a['prof'], sec), [('LUNDI', '6ème A'), ('MARDI', '6ème B')])
        cms = sec.get('/api/classe-matieres/').json()
        cms = cms['results'] if isinstance(cms, dict) else cms
        self.assertTrue(all('enseignant' in x and 'enseignant_nom' in x for x in cms))
        # réaffecter le cours de la 6ème B au second professeur déplace le créneau
        cm_b.enseignant = autre_prof
        cm_b.save()
        self.assertEqual(creneaux(a['prof']), [('LUNDI', '6ème A')])
        self.assertEqual(creneaux(autre_prof), [('MARDI', '6ème B')])
        # un enseignant ne consulte pas l'emploi du temps de ses collègues
        self.assertEqual(creneaux(autre_prof, _client(a['enseignant'])), [])
        # une autre école n'en voit rien
        b = _ecole('Autre école emploi')
        self.assertEqual(creneaux(a['prof'], _client(b['admin'])), [])


class BilanPedagogiqueTests(TestCase):
    """Bilan du directeur : moyennes et taux de réussite par trimestre, par classe, par matière, et résultats BEPC / BAC."""

    def test_bilan(self):
        from evaluations.models import Note
        from scolarite.models import ResultatExamenNational
        a = _ecole('École bilan')
        for valeur, nom in ((14, 'Bon'), (8, 'Faible')):
            e = Eleve.objects.create(nom=nom, prenom='Test', matricule=f"B-{nom}-{a['ecole'].pk}", ecole=a['ecole'], sexe='M' if nom == 'Bon' else 'F')
            Inscription.objects.create(eleve=e, classe=a['classe'], annee_scolaire=a['annee'], ecole=a['ecole'])
            Note.objects.create(evaluation=a['eval'], eleve=e, valeur=valeur, ecole=a['ecole'])
        d = _client(a['admin'])
        r = d.get(f"/api/bilan-pedagogique/?trimestre_id={a['trimestre'].id}")
        self.assertEqual(r.status_code, 200, r.content)
        j = r.json()
        self.assertEqual(j['periode']['type'], 'trimestre')
        self.assertEqual(j['ecole']['effectif'], 2)
        self.assertEqual(j['ecole']['moyenne'], 11.0)
        self.assertEqual(j['ecole']['taux_reussite'], 50.0)  # 14 ≥ 10, 8 < 10
        self.assertEqual(j['classes'][0]['meilleur_eleve'], 'Bon Test')
        self.assertEqual(j['matieres'][0]['matiere'], 'Maths')
        self.assertEqual(j['genre']['Garçons']['moyenne'], 14.0)
        self.assertEqual(j['meilleurs'][0]['nom'], 'Bon Test')
        self.assertEqual([x['nom'] for x in j['a_encourager']], ['Faible Test'])
        self.assertEqual(sum(t['nombre'] for t in j['repartition']), 2)
        # année entière
        self.assertEqual(d.get('/api/bilan-pedagogique/').json()['periode']['type'], 'annee')
        # moyenne de l'année : les trimestres sans note ne comptent pas pour 0 (seul le trimestre 1 est noté ici)
        annee = d.get('/api/bilan-pedagogique/').json()
        self.assertEqual(annee['ecole']['moyenne'], 11.0)
        # PDF officiel : mêmes chiffres, avec l'en-tête de l'école
        pdf = d.get('/api/bilan-pedagogique/?pdf=1')
        self.assertEqual(pdf.status_code, 200, pdf.content)
        self.assertEqual(pdf['Content-Type'], 'application/pdf')
        self.assertTrue(pdf.content.startswith(b'%PDF'))
        self.assertEqual(_client(a['enseignant']).get('/api/bilan-pedagogique/?pdf=1').status_code, 403)
        # BAC : taux de réussite, vide tant que la liste des admis n'est pas saisie
        terminale = Niveau.objects.create(nom='Terminale', ecole=a['ecole'])
        tle = Classe.objects.create(nom='Terminale A', niveau=terminale, ecole=a['ecole'])
        candidats = []
        for i in range(4):
            e = Eleve.objects.create(nom=f'Cand{i}', prenom='Bac', matricule=f"C{i}-{a['ecole'].pk}", ecole=a['ecole'])
            Inscription.objects.create(eleve=e, classe=tle, annee_scolaire=a['annee'], ecole=a['ecole'])
            candidats.append(e)
        bac = [x for x in d.get('/api/bilan-pedagogique/').json()['examens'] if x['examen'] == 'BAC'][0]
        self.assertEqual((bac['candidats'], bac['liste_saisie'], bac['taux_reussite']), (4, False, None))
        for e in candidats[:3]:
            ResultatExamenNational.objects.create(eleve=e, annee_scolaire=a['annee'], examen='BAC', admis=True, ecole=a['ecole'])
        bac = [x for x in d.get('/api/bilan-pedagogique/').json()['examens'] if x['examen'] == 'BAC'][0]
        self.assertEqual((bac['candidats'], bac['admis'], bac['taux_reussite']), (4, 3, 75.0))
        self.assertEqual(bac['par_classe'][0]['taux_reussite'], 75.0)
        # une seule classe : ses chiffres seulement ; le choix de classes reste complet
        un = d.get(f"/api/bilan-pedagogique/?trimestre_id={a['trimestre'].id}&classe_id={a['classe'].id}").json()
        self.assertEqual((un['ecole']['effectif'], un['ecole']['moyenne']), (2, 11.0))
        self.assertEqual(un['classe_choisie']['id'], a['classe'].id)
        self.assertEqual({c['id'] for c in un['classes_choix']}, {a['classe'].id, tle.id})
        self.assertEqual([x['examen'] for x in un['examens']], [])
        tl = d.get(f"/api/bilan-pedagogique/?classe_id={tle.id}").json()
        self.assertEqual(tl['ecole']['inscrits'], 4)
        self.assertEqual([(x['examen'], x['taux_reussite']) for x in tl['examens']], [('BAC', 75.0)])
        # classe inconnue ou d'une autre école : on retombe sur tout l'établissement
        self.assertIsNone(d.get('/api/bilan-pedagogique/?classe_id=999999').json()['classe_choisie'])
        # réservé au directeur, et à son école seulement
        for qui in ('enseignant', 'parent', 'eleve_user'):
            self.assertEqual(_client(a[qui]).get('/api/bilan-pedagogique/').status_code, 403, qui)
        self.assertEqual(_client(_secretaire(a)).get('/api/bilan-pedagogique/').status_code, 403)
        b = _ecole('Autre école bilan')
        self.assertEqual(_client(b['admin']).get('/api/bilan-pedagogique/').json()['ecole']['effectif'], 0)
        self.assertEqual(_client(b['admin']).get(f"/api/bilan-pedagogique/?trimestre_id={a['trimestre'].id}").status_code, 404)


class CertificatNonRedevanceTests(TestCase):
    """Certificat de non redevance : délivré par le comptable seulement, et seulement si l'élève ne doit plus rien."""

    def test_certificat(self):
        from caisse.services import ouvrir_dossier
        a = _ecole('École certificat')
        compta = User.objects.create_user(username='compta-cert', password='x', role='COMPTABLE', ecole=a['ecole'],
                                          first_name='Salif', last_name='Ouédraogo')
        dossier = ouvrir_dossier(Inscription.objects.get(eleve=a['eleve']))
        url = f'/api/dossiers-scolarite/{dossier.id}/certificat-non-redevance/'
        c = _client(compta)
        # aucun frais défini : refus expliqué
        r = c.get(url)
        self.assertEqual(r.status_code, 400)
        self.assertIn('Aucun montant', r.json()['detail'])
        # reste à payer : refus avec le montant dû
        dossier.montant_du = 100000
        dossier.save()
        c.post(f'/api/dossiers-scolarite/{dossier.id}/paiement/', {'montant': 60000}, format='json')
        r = c.get(url)
        self.assertEqual(r.status_code, 400)
        self.assertIn('40 000 FCFA', r.json()['detail'])
        # soldé : PDF délivré et tracé au journal
        c.post(f'/api/dossiers-scolarite/{dossier.id}/paiement/', {'montant': 40000}, format='json')
        r = c.get(url)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r['Content-Type'], 'application/pdf')
        self.assertTrue(r.content.startswith(b'%PDF'))
        from accounts.models import JournalAction
        self.assertTrue(JournalAction.objects.filter(objet_type='Certificat de non redevance').exists())
        # numéro de série : CNR-AAAA-0001, le même à chaque réimpression
        from datetime import date
        from caisse.models import CertificatNonRedevance
        numero = CertificatNonRedevance.objects.get(eleve=a['eleve']).numero
        self.assertEqual(numero, f'CNR-{date.today().year}-0001')
        self.assertEqual(c.get(url).status_code, 200)
        self.assertEqual(CertificatNonRedevance.objects.filter(eleve=a['eleve']).count(), 1)
        # une dette d'une année passée bloque aussi le certificat
        ancienne = AnneeScolaire.objects.create(libelle='2025-2026', ecole=a['ecole'])
        ins = Inscription.objects.create(eleve=a['eleve'], classe=a['classe'], annee_scolaire=ancienne, ecole=a['ecole'])
        vieux = ouvrir_dossier(ins)
        vieux.montant_du = 50000
        vieux.save()
        r = c.get(url)
        self.assertEqual(r.status_code, 400)
        self.assertIn('2025-2026', r.json()['detail'])
        # réservé au comptable de l'école
        for qui in ('admin', 'enseignant', 'parent', 'eleve_user'):
            self.assertEqual(_client(a[qui]).get(url).status_code, 403, qui)
        self.assertEqual(_client(_secretaire(a)).get(url).status_code, 403)
        b = _ecole('Autre école certificat')
        autre = User.objects.create_user(username='compta-cert-b', password='x', role='COMPTABLE', ecole=b['ecole'])
        self.assertEqual(_client(autre).get(url).status_code, 404)


class ExamenBlancParClasseTests(TestCase):
    """Examen blanc : programme commun en 3ème, propre à chaque classe en Terminale (Tle A ≠ Tle D)."""

    def test_terminale_par_classe_et_troisieme_commun(self):
        from datetime import date
        from evaluations.models import CalendrierExamenBlanc
        a = _ecole('École examen blanc')
        prof = ClasseMatiere.objects.get(classe=a['classe']).enseignant
        sec = _client(_secretaire(a))
        tle = Niveau.objects.create(nom='Terminale', ecole=a['ecole'], is_classe_examen=True)
        tle_a = Classe.objects.create(nom='Terminale A', niveau=tle, ecole=a['ecole'])
        tle_d = Classe.objects.create(nom='Terminale D', niveau=tle, ecole=a['ecole'])
        philo = Matiere.objects.create(nom='Philosophie', ecole=a['ecole'])
        svt = Matiere.objects.create(nom='SVT', ecole=a['ecole'])
        ClasseMatiere.objects.create(classe=tle_a, matiere=philo, enseignant=prof, coef=4, ecole=a['ecole'])
        ClasseMatiere.objects.create(classe=tle_d, matiere=svt, enseignant=prof, coef=4, ecole=a['ecole'])
        cal = CalendrierExamenBlanc.objects.create(niveau=tle, trimestre=a['trimestre'], date_debut=date(2026, 12, 1), date_fin=date(2026, 12, 10), ecole=a['ecole'])
        base = {'calendrier': cal.id, 'date_examen': '2026-12-02'}
        # une classe est obligatoire en Terminale
        r = sec.post('/api/programmes-examen-blanc/', {**base, 'matiere': philo.id}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        # la matière doit être enseignée dans la classe choisie
        r = sec.post('/api/programmes-examen-blanc/', {**base, 'matiere': philo.id, 'classe': tle_d.id}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        r = sec.post('/api/programmes-examen-blanc/', {**base, 'matiere': philo.id, 'classe': tle_a.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        # pas de doublon pour la même classe
        self.assertEqual(sec.post('/api/programmes-examen-blanc/', {**base, 'matiere': philo.id, 'classe': tle_a.id}, format='json').status_code, 400)
        # 3ème : la classe est ignorée, programme commun
        tr = Niveau.objects.create(nom='3ème', ecole=a['ecole'], is_classe_examen=True)
        cal3 = CalendrierExamenBlanc.objects.create(niveau=tr, trimestre=a['trimestre'], date_debut=date(2026, 12, 1), date_fin=date(2026, 12, 10), ecole=a['ecole'])
        c3 = Classe.objects.create(nom='3ème A', niveau=tr, ecole=a['ecole'])
        ClasseMatiere.objects.create(classe=c3, matiere=philo, enseignant=prof, coef=2, ecole=a['ecole'])
        r = sec.post('/api/programmes-examen-blanc/', {'calendrier': cal3.id, 'date_examen': '2026-12-03', 'matiere': philo.id, 'classe': c3.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIsNone(r.json()['classe'])


class CopieMatieresEntreClassesTests(TestCase):
    """Copier les matières et coefficients d'une classe vers d'autres : seul le directeur, sans copier les professeurs."""

    def test_copie(self):
        a = _ecole('École copie')
        source = a['classe']
        cible = Classe.objects.create(nom='6ème B', niveau=source.niveau, ecole=a['ecole'])
        d = _client(a['admin'])
        r = d.post('/api/classe-matieres/copier/', {'source': source.id, 'classes': [cible.id]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['ajoutees'], 1)
        copie = ClasseMatiere.objects.get(classe=cible)
        self.assertEqual((copie.coef, copie.enseignant), (2.0, None))
        # recopier ne crée pas de doublon
        self.assertEqual(d.post('/api/classe-matieres/copier/', {'source': source.id, 'classes': [cible.id]}, format='json').json()['ajoutees'], 0)
        self.assertEqual(ClasseMatiere.objects.filter(classe=cible).count(), 1)
        # classe vide à copier, classe d'une autre école, rôles non autorisés
        vide = Classe.objects.create(nom='6ème C', niveau=source.niveau, ecole=a['ecole'])
        self.assertEqual(d.post('/api/classe-matieres/copier/', {'source': vide.id, 'classes': [cible.id]}, format='json').status_code, 400)
        b = _ecole('Autre école copie')
        self.assertEqual(d.post('/api/classe-matieres/copier/', {'source': b['classe'].id, 'classes': [cible.id]}, format='json').status_code, 404)
        for qui in ('enseignant', 'parent', 'eleve_user'):
            self.assertEqual(_client(a[qui]).post('/api/classe-matieres/copier/', {'source': source.id, 'classes': [cible.id]}, format='json').status_code, 403, qui)
        self.assertEqual(_client(_secretaire(a)).post('/api/classe-matieres/copier/', {'source': source.id, 'classes': [cible.id]}, format='json').status_code, 403)
