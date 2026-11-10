"""
Remplit la base avec un petit jeu de démonstration réaliste (Burkina Faso).

Volume volontairement modeste pour que l'admin reste rapide :
~3 classes peuplées × ~8 élèves, notes/présences en centaines (pas des dizaines de milliers).

Usage :
    python manage.py seed_demo
    python manage.py seed_demo --reset   # vide les données scolaires puis re-seed
"""
from __future__ import annotations

import random
from datetime import date, time

from django.contrib.auth.hashers import make_password
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from scolarite.utils import annee_scolaire_courante, jours_scolaires_recents


MOT_DE_PASSE_TEST = "Ecole2025!"
ADMINS_PROTEGES = {"hamidtoe450", "superadmin"}

NOMS = [
    "Traoré", "Ouédraogo", "Sawadogo", "Koné", "Diallo", "Zongo", "Compaoré",
    "Sanou", "Ouattara", "Kaboré", "Somé", "Ilboudo", "Coulibaly", "Tapsoba",
    "Barry", "Nikiema", "Sorgho", "Tiendrébéogo", "Banhoro", "Guigma",
    "Zerbo", "Dabiré", "Hien", "Bationo", "Ouédraogo", "Kinda", "Bazié",
    "Millogo", "Savadogo", "Yago", "Kientega", "Nacanabo", "Palenfo",
    "Dao", "Sidibé", "Konaté", "Diabaté", "Cissé", "Touré", "Keita",
]
PRENOMS_M = [
    "Moussa", "Ibrahim", "Seydou", "Amadou", "Boukary", "Issa", "Adama",
    "Souleymane", "Abdoulaye", "Oumar", "Issouf", "Hassane", "Yacouba",
    "Rasmané", "Dramane", "Lassané", "Boureima", "Mahamoudou", "Salif",
    "Karim", "Aboubacar", "Idrissa", "Modibo", "Daouda", "Bakary",
]
PRENOMS_F = [
    "Fatou", "Aïcha", "Aminata", "Mariam", "Rasmata", "Awa", "Salimata",
    "Kadidia", "Djénéba", "Habibou", "Alima", "Bintou", "Fanta", "Safiatou",
    "Assetou", "Ramata", "Hawa", "Nafissatou", "Oumou", "Adjaratou",
    "Rahamata", "Clarisse", "Pascaline", "Georgette", "Justine",
]
LIEUX = [
    "Bobo-Dioulasso", "Ouagadougou", "Banfora", "Dédougou", "Koudougou",
    "Gaoua", "Houndé", "Orodara", "Nouna", "Réo", "Dano", "Sindou",
]

# Structure complète des classes (navigation), mais seuls 3 niveaux sont peuplés.
PLAN_CLASSES = [
    ("6ème", "6ème A"),
    ("6ème", "6ème B"),
    ("5ème", "5ème A"),
    ("5ème", "5ème B"),
    ("4ème", "4ème A"),
    ("4ème", "4ème B"),
    ("3ème", "3ème A"),
    ("3ème", "3ème B"),
    ("2nde", "2nde A"),
    ("2nde", "2nde C"),
    ("1ère", "1ère A"),
    ("1ère", "1ère C"),
    ("1ère", "1ère D"),
    ("Terminale", "Terminale A"),
    ("Terminale", "Terminale C"),
    ("Terminale", "Terminale D"),
]

# ~24 élèves au total — assez pour tester, pas assez pour faire timeout l'admin.
EFFECTIFS = {
    "6ème A": 8, "6ème B": 0,
    "5ème A": 0, "5ème B": 8,
    "4ème A": 0, "4ème B": 0,
    "3ème A": 8, "3ème B": 0,
    "2nde A": 0, "2nde C": 0,
    "1ère A": 0, "1ère C": 0, "1ère D": 0,
    "Terminale A": 0, "Terminale C": 0, "Terminale D": 0,
}

# JPEG 1×1 minimal pour photos démo
_TINY_JPEG = bytes([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
    0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
    0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
    0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
    0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
    0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
    0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
    0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
    0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
    0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
    0x00, 0x00, 0x3F, 0x00, 0x7F, 0x46, 0x80, 0xFF, 0xD9,
])


def _slug_ident(prenom, nom):
    raw = (prenom[:1] + nom).lower()
    return (
        raw.replace("é", "e").replace("è", "e").replace("ë", "e")
        .replace("ï", "i").replace("ç", "c").replace("ô", "o")
        .replace("à", "a").replace("ù", "u").replace(" ", "")
        .replace("'", "")
    )


class Command(BaseCommand):
    help = "Remplit la base avec des données de test réalistes (tous les modules)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Supprime les données scolaires (sauf admins existants) avant de recharger",
        )

    def handle(self, *args, **options):
        from accounts.models import User
        from cours.models import Enseignant, Matiere, ClasseMatiere, EmploiDuTemps
        from eleves.models import Eleve, Presence
        from evaluations.models import (
            Evaluation, Note, CalendrierComposition, ProgrammeComposition,
            CalendrierExamenBlanc, ProgrammeExamenBlanc, Deliberation,
        )
        from parametres.models import Parametres
        from scolarite.models import (
            Niveau, Classe, AnneeScolaire, Trimestre, Inscription,
            ResultatExamenNational, PassageAnnee,
        )

        rng = random.Random(42)
        pwd_hash = make_password(MOT_DE_PASSE_TEST)

        if options["reset"]:
            self._reset(User)

        def step(msg):
            self.stdout.write(msg)
            self.stdout.flush()

        step("Paramètres de l'école…")
        params = self._seed_parametres(Parametres)
        step("Niveaux / année / trimestres…")
        niveaux = self._seed_niveaux(Niveau, params)
        annee, trimestres, annee_debut = self._seed_annee_trimestres(AnneeScolaire, Trimestre, params)
        step("Enseignants et matières…")
        enseignants = self._seed_enseignants(Enseignant, params)
        matieres = self._seed_matieres(Matiere, params)
        step("Classes et affectations…")
        classes = self._seed_classes(Classe, niveaux, enseignants, params)
        cms = self._seed_classe_matieres(ClasseMatiere, classes, matieres, enseignants, params)
        step("Emplois du temps…")
        self._seed_emploi(EmploiDuTemps, cms, classes)
        step("Élèves et inscriptions…")
        eleves = self._seed_eleves(Eleve, Inscription, classes, rng, annee, annee_debut, params)
        step("Évaluations…")
        evals = self._seed_evaluations(Evaluation, cms, trimestres, annee_debut, params)
        step("Notes…")
        notes_stats = self._seed_notes(Note, evals, eleves, Inscription, rng, annee, params)
        step("Présences…")
        pres_stats = self._seed_presences(Presence, cms, eleves, Inscription, classes, rng, annee, params)
        step("Appels journaliers…")
        from eleves.models import AppelJournalier
        appel_stats = self._seed_appels(AppelJournalier, eleves, Inscription, classes, rng, annee, params)
        step("Calendriers / programmes…")
        self._seed_calendriers(
            CalendrierComposition, ProgrammeComposition,
            CalendrierExamenBlanc, ProgrammeExamenBlanc,
            Deliberation, niveaux, trimestres, matieres, User, annee_debut, params,
        )
        step("Comptes utilisateurs…")
        comptes = self._seed_users(User, enseignants, eleves, pwd_hash, params)
        step("Caisse (frais / paiements)…")
        caisse_stats = self._seed_caisse(annee, niveaux, Inscription, rng, params)
        step("Notifications / SMS…")
        notif_stats = self._seed_notifications(User, eleves, Presence, annee, params)
        step("Résultats examen (démo BEPC / BAC)…")
        exam_stats = self._seed_examens(annee, Inscription, ResultatExamenNational, rng, params)
        step("Dossiers préinscription (vitrine)…")
        self._seed_demandes_inscription(params, niveaux)
        self._rattacher_ecole(params)
        step("Deuxième école (isolation)…")
        self._seed_ecole_isolee(pwd_hash)
        step("Compte super admin plateforme…")
        self._seed_superadmin()

        self._print_resume(
            params, annee, classes, comptes, notes_stats, pres_stats,
            User, Niveau, Classe, AnneeScolaire, Trimestre,
            Enseignant, Matiere, ClasseMatiere, EmploiDuTemps,
            Eleve, Inscription, Evaluation, Note, Presence,
            CalendrierComposition, ProgrammeComposition,
            CalendrierExamenBlanc, ProgrammeExamenBlanc, Deliberation,
            caisse_stats, notif_stats, exam_stats, appel_stats=appel_stats,
        )

    # ── reset ──────────────────────────────────────────
    def _reset(self, User):
        from evaluations.models import (
            Note, Evaluation, ProgrammeComposition, CalendrierComposition,
            ProgrammeExamenBlanc, CalendrierExamenBlanc, Deliberation,
        )
        from eleves.models import Presence, Eleve, AppelJournalier
        from cours.models import EmploiDuTemps, ClasseMatiere, Enseignant, Matiere
        from scolarite.models import (
            Inscription, Classe, Trimestre, AnneeScolaire, Niveau,
            ResultatExamenNational, PassageAnnee, DemandeInscription,
        )
        from caisse.models import Paiement, DossierScolarite, TarifNiveau
        from notifications.models import SmsOutbox, Notification

        self.stdout.write(self.style.WARNING("Réinitialisation des données scolaires…"))
        self.stdout.flush()
        for model in (
            Paiement, DossierScolarite, TarifNiveau, SmsOutbox, Notification,
            ResultatExamenNational, PassageAnnee, DemandeInscription,
            Note, Evaluation, ProgrammeComposition, ProgrammeExamenBlanc,
            Deliberation, CalendrierComposition, CalendrierExamenBlanc,
            AppelJournalier, Presence, EmploiDuTemps, Inscription, ClasseMatiere, Classe,
            Eleve, Enseignant, Matiere, Trimestre, AnneeScolaire, Niveau,
        ):
            n = model.objects.count()
            model.objects.all().delete()
            self.stdout.write(f"  {model._meta.db_table}: {n} supprimé(s)")

        extra = User.objects.exclude(role__in=("ADMIN", "SUPER_ADMIN")).exclude(username__in=ADMINS_PROTEGES)
        n_u = extra.count()
        extra.delete()
        self.stdout.write(f"  comptes non-admin: {n_u} supprimé(s)")
        self.stdout.write(self.style.SUCCESS("Reset terminé (admins / hamidtoe450 conservés)."))

    # ── parametres ─────────────────────────────────────
    def _seed_parametres(self, Parametres):
        obj = Parametres.get()
        obj.nom_ecole = "Complexe Scolaire Wend-Panga"
        obj.slogan = "Savoir, Discipline, Excellence"
        obj.adresse = "Secteur 22, Avenue de la Révolution"
        obj.ville = "Bobo-Dioulasso"
        obj.telephone = "+226 20 98 12 34"
        obj.email = "contact@wendpanga.bf"
        obj.directeur = "Adama Ouédraogo"
        obj.devise = "Travail — Patrie — Mérite"
        obj.couleur_primaire = "#1B5E20"
        obj.direction_regionale = "DRENA des Hauts-Bassins"
        obj.direction_provinciale = "DPEPP du Houet"
        obj.boite_postale = "BP 1452"
        obj.annee_creation = "2008"
        obj.seuil_passage = 10.0
        obj.statut = Parametres.STATUT_VALIDEE
        obj.motif = ""
        obj.slug = "wend-panga"
        obj.vitrine_active = True
        obj.presentation_vitrine = (
            "Le Complexe Scolaire Wend-Panga accueille les élèves du collège au lycée "
            "à Bobo-Dioulasso. Excellence pédagogique, discipline et accompagnement "
            "des familles au quotidien."
        )
        obj.save()
        return obj

    # ── niveaux / année / trimestres ───────────────────
    def _seed_niveaux(self, Niveau, ecole):
        specs = [
            ("6ème", False),
            ("5ème", False),
            ("4ème", False),
            ("3ème", True),
            ("2nde", False),
            ("1ère", False),
            ("Terminale", True),
        ]
        out = {}
        for nom, examen in specs:
            obj, _ = Niveau.objects.get_or_create(
                nom=nom, ecole=ecole, defaults={"is_classe_examen": examen}
            )
            obj.is_active = True
            obj.is_classe_examen = examen
            obj.ecole = ecole
            obj.save()
            out[nom] = obj
        return out

    def _seed_annee_trimestres(self, AnneeScolaire, Trimestre, ecole):
        libelle, annee_debut = annee_scolaire_courante()
        annee = AnneeScolaire.objects.filter(libelle=libelle, ecole=ecole).first()
        if annee is None:
            annee = AnneeScolaire.objects.filter(is_active=True, ecole=ecole).order_by("-libelle").first()
            if annee is None:
                annee = AnneeScolaire.objects.filter(ecole=ecole).order_by("-libelle").first()
            if annee is None:
                annee = AnneeScolaire.objects.create(libelle=libelle, is_active=True, ecole=ecole)
            elif annee.libelle != libelle:
                clash = AnneeScolaire.objects.filter(libelle=libelle, ecole=ecole).exclude(pk=annee.pk).first()
                if clash:
                    clash.libelle = f"{clash.libelle}-old"
                    clash.is_active = False
                    clash.save(update_fields=["libelle", "is_active"])
                annee.libelle = libelle
        annee.is_active = True
        annee.ecole = ecole
        annee.save()
        AnneeScolaire.objects.filter(ecole=ecole).exclude(pk=annee.pk).update(is_active=False)

        noms = ["Trimestre 1", "Trimestre 2", "Trimestre 3"]
        trimestres = []
        for nom in noms:
            t, _ = Trimestre.objects.get_or_create(
                nom=nom, annee_scolaire=annee, defaults={"is_active": True, "ecole": ecole}
            )
            t.is_active = True
            t.ecole = ecole
            t.save()
            trimestres.append(t)
        return annee, trimestres, annee_debut

    # ── enseignants / matières / classes ───────────────
    def _seed_enseignants(self, Enseignant, ecole):
        people = [
            ("Koné", "Amadou"),          # Maths
            ("Sawadogo", "Fatima"),      # Anglais
            ("Ouédraogo", "Issouf"),     # Histoire-Géo
            ("Traoré", "Aminata"),       # Français
            ("Diallo", "Mamadou"),       # Physique-Chimie
            ("Zongo", "Mariam"),         # SVT
            ("Compaoré", "Boukary"),     # Maths (2)
            ("Sanou", "Aïcha"),          # Informatique
            ("Ouattara", "Seydou"),      # EPS
            ("Kaboré", "Rasmata"),       # Arts
            ("Somé", "Ibrahim"),         # EMC / Philo
            ("Ilboudo", "Célestine"),    # Français (2)
            ("Barry", "Oumar"),          # Espagnol
            ("Hien", "Pascaline"),       # SVT (2)
            ("Millogo", "Lassané"),      # Physique-Chimie (2)
            ("Kinda", "Clarisse"),       # Histoire-Géo (2)
        ]
        out = []
        for nom, prenom in people:
            obj, _ = Enseignant.objects.get_or_create(
                nom=nom, prenom=prenom, ecole=ecole, defaults={"is_active": True}
            )
            obj.is_active = True
            obj.ecole = ecole
            obj.save()
            out.append(obj)
        return out

    def _seed_matieres(self, Matiere, ecole):
        specs = [
            ("Mathématiques", "SCIENTIFIQUE"),
            ("Physique-Chimie", "SCIENTIFIQUE"),
            ("SVT", "SCIENTIFIQUE"),
            ("Français", "LITTERATURE"),
            ("Anglais", "LITTERATURE"),
            ("Histoire-Géographie", "LITTERATURE"),
            ("Philosophie", "LITTERATURE"),
            ("Espagnol", "LITTERATURE"),
            ("EPS", "AUTRES"),
            ("Informatique", "AUTRES"),
            ("EMC", "AUTRES"),
            ("Arts plastiques", "AUTRES"),
        ]
        out = {}
        for nom, typ in specs:
            obj, _ = Matiere.objects.get_or_create(nom=nom, ecole=ecole, defaults={"type": typ})
            obj.type = typ
            obj.ecole = ecole
            obj.save()
            out[nom] = obj
        return out

    def _seed_classes(self, Classe, niveaux, enseignants, ecole):
        out = []
        for idx, (niv_nom, classe_nom) in enumerate(PLAN_CLASSES):
            obj, _ = Classe.objects.get_or_create(
                nom=classe_nom,
                niveau=niveaux[niv_nom],
                defaults={
                    "professeur_principal": enseignants[idx % len(enseignants)],
                    "is_active": True,
                    "ecole": ecole,
                },
            )
            obj.professeur_principal = enseignants[idx % len(enseignants)]
            obj.is_active = True
            obj.ecole = ecole
            obj.save()
            out.append(obj)
        return out

    def _matieres_pour_classe(self, classe_nom, niveau_nom):
        base = [
            "Mathématiques", "Français", "Anglais", "Histoire-Géographie",
            "Physique-Chimie", "SVT", "EPS", "Informatique", "EMC",
        ]
        lycee = {"2nde", "1ère", "Terminale"}
        if niveau_nom in lycee:
            base.append("Espagnol")
        if niveau_nom in {"1ère", "Terminale"}:
            base.append("Philosophie")
        if niveau_nom not in lycee:
            base.append("Arts plastiques")
        return base

    def _coefs_pour_classe(self, classe_nom):
        """Coefficients selon la série (A lettres, C maths-physique, D SVT)."""
        coefs = {
            "Mathématiques": 4.0,
            "Français": 4.0,
            "Anglais": 3.0,
            "Histoire-Géographie": 3.0,
            "Physique-Chimie": 3.0,
            "SVT": 2.0,
            "EPS": 1.0,
            "Informatique": 1.0,
            "EMC": 1.0,
            "Arts plastiques": 1.0,
            "Philosophie": 3.0,
            "Espagnol": 2.0,
        }
        if classe_nom.endswith(" A") and any(classe_nom.startswith(p) for p in ("2nde", "1ère", "Terminale")):
            coefs["Français"] = 5.0
            coefs["Philosophie"] = 4.0
            coefs["Histoire-Géographie"] = 4.0
            coefs["Espagnol"] = 3.0
            coefs["Mathématiques"] = 2.0
            coefs["Physique-Chimie"] = 2.0
            coefs["SVT"] = 1.0
        elif classe_nom.endswith(" C"):
            coefs["Mathématiques"] = 5.0
            coefs["Physique-Chimie"] = 4.0
            coefs["SVT"] = 2.0
            coefs["Français"] = 3.0
        elif classe_nom.endswith(" D"):
            coefs["SVT"] = 5.0
            coefs["Physique-Chimie"] = 4.0
            coefs["Mathématiques"] = 4.0
            coefs["Français"] = 3.0
        return coefs

    def _seed_classe_matieres(self, ClasseMatiere, classes, matieres, enseignants, params):
        prof_par_matiere = {
            "Mathématiques": [enseignants[0], enseignants[6]],
            "Français": [enseignants[3], enseignants[11]],
            "Anglais": [enseignants[1]],
            "Histoire-Géographie": [enseignants[2], enseignants[15]],
            "Physique-Chimie": [enseignants[4], enseignants[14]],
            "SVT": [enseignants[5], enseignants[13]],
            "EPS": [enseignants[8]],
            "Informatique": [enseignants[7]],
            "EMC": [enseignants[10]],
            "Arts plastiques": [enseignants[9]],
            "Philosophie": [enseignants[10]],
            "Espagnol": [enseignants[12]],
        }
        cms = []
        for i, classe in enumerate(classes):
            noms = self._matieres_pour_classe(classe.nom, classe.niveau.nom)
            coefs = self._coefs_pour_classe(classe.nom)
            for nom in noms:
                profs = prof_par_matiere[nom]
                enseignant = profs[i % len(profs)]
                obj, _ = ClasseMatiere.objects.get_or_create(
                    classe=classe,
                    matiere=matieres[nom],
                    defaults={
                        "enseignant": enseignant,
                        "coef": coefs[nom],
                        "is_active": True,
                        "ecole": params,
                    },
                )
                obj.enseignant = enseignant
                obj.coef = coefs[nom]
                obj.is_active = True
                obj.ecole = params
                obj.save()
                cms.append(obj)
        return cms

    def _seed_emploi(self, EmploiDuTemps, cms, classes):
        """Quelques créneaux seulement (classes peuplées) — pas une grille complète lourde."""
        creneaux = [
            (time(7, 30), time(8, 30)),
            (time(8, 30), time(9, 30)),
            (time(10, 45), time(11, 45)),
        ]
        jours = ["LUNDI", "MARDI", "MERCREDI"]
        salles = {
            "EPS": "Cour EPS",
            "SVT": "Labo SVT",
            "Physique-Chimie": "Labo PC",
            "Informatique": "Salle info",
        }
        created = 0
        classes_peuplees = [c for c in classes if EFFECTIFS.get(c.nom, 0) > 0]
        for classe in classes_peuplees:
            cms_classe = [cm for cm in cms if cm.classe_id == classe.id][:5]
            if not cms_classe:
                continue
            idx = 0
            for jour in jours:
                for hdeb, hfin in creneaux:
                    cm = cms_classe[idx % len(cms_classe)]
                    idx += 1
                    salle = salles.get(cm.matiere.nom, f"Salle {((classe.id or 1) % 8) + 1}")
                    _, was = EmploiDuTemps.objects.get_or_create(
                        classe_matiere=cm,
                        jour=jour,
                        heure_debut=hdeb,
                        defaults={"heure_fin": hfin, "salle": salle},
                    )
                    if was:
                        created += 1
        return created

    # ── élèves / inscriptions ──────────────────────────
    def _seed_eleves(self, Eleve, Inscription, classes, rng, annee, annee_debut, ecole):
        ages = {
            "6ème": 2013,
            "5ème": 2012,
            "4ème": 2011,
            "3ème": 2010,
            "2nde": 2009,
            "1ère": 2008,
            "Terminale": 2007,
        }
        eleves = []
        compteur = 1
        used_names = set(Eleve.objects.values_list("nom", "prenom"))
        sample = Eleve.objects.filter(matricule__contains="-").order_by("id").first()
        if sample and sample.matricule.split("-")[0].isdigit():
            mat_prefix = sample.matricule.split("-")[0]
        else:
            mat_prefix = str(annee_debut)
        for classe in classes:
            n = EFFECTIFS.get(classe.nom, 0)
            if n <= 0:
                continue
            annee_ref = ages.get(classe.niveau.nom, 2010)
            for i_el in range(n):
                sexe = "M" if compteur % 2 else "F"
                prenoms = PRENOMS_M if sexe == "M" else PRENOMS_F
                nom = prenom = None
                for _try in range(80):
                    nom = rng.choice(NOMS)
                    prenom = rng.choice(prenoms)
                    if (nom, prenom) not in used_names:
                        used_names.add((nom, prenom))
                        break
                matricule = f"{mat_prefix}-{compteur:04d}"
                mois = rng.randint(1, 12)
                jour = rng.randint(1, 28)
                parent_nom = rng.choice(NOMS)
                parent_prenom = rng.choice(PRENOMS_M if rng.random() < 0.6 else PRENOMS_F)
                tel_prefix = rng.choice(["70", "76", "77", "66", "65"])
                tel = f"+226 {tel_prefix} {rng.randint(10, 99):02d} {rng.randint(10, 99):02d} {rng.randint(10, 99):02d}"

                eleve, _ = Eleve.objects.get_or_create(
                    matricule=matricule,
                    ecole=ecole,
                    defaults={
                        "nom": nom,
                        "prenom": prenom,
                        "date_naissance": date(annee_ref, mois, jour),
                        "lieu_naissance": rng.choice(LIEUX),
                        "sexe": sexe,
                        "nom_parent": parent_nom,
                        "prenom_parent": parent_prenom,
                        "telephone_parent": tel,
                        "is_active": True,
                    },
                )
                Inscription.objects.get_or_create(
                    eleve=eleve,
                    annee_scolaire=annee,
                    defaults={"classe": classe, "ecole": ecole},
                )
                eleves.append(eleve)
                compteur += 1

        # Quelques photos démo (pas tous les élèves)
        for eleve in eleves[:4]:
            if not eleve.photo:
                eleve.photo.save(
                    f"{eleve.matricule}.jpg",
                    ContentFile(_TINY_JPEG),
                    save=True,
                )

        # Quelques inscriptions de l'année précédente (passage sans mélange)
        from scolarite.models import AnneeScolaire
        prev_libelle = f"{annee_debut - 1}-{annee_debut}"
        prev, _ = AnneeScolaire.objects.get_or_create(
            libelle=prev_libelle, ecole=ecole, defaults={"is_active": False}
        )
        if prev.is_active:
            prev.is_active = False
            prev.save(update_fields=["is_active"])
        for eleve in eleves[:3]:
            ins = Inscription.objects.filter(eleve=eleve, annee_scolaire=annee).first()
            if ins and ins.classe_id:
                Inscription.objects.get_or_create(
                    eleve=eleve,
                    annee_scolaire=prev,
                    defaults={"classe": ins.classe, "ecole": ecole},
                )
        return eleves

    # ── évaluations / notes ────────────────────────────
    def _seed_evaluations(self, Evaluation, cms, trimestres, annee_debut, ecole):
        """Trimestre 1 seulement : DEVOIR1 + COMPOSITION, classes peuplées, 5 matières max."""
        t1 = trimestres[0]
        y0 = annee_debut
        dates = {
            "DEVOIR1": date(y0, 11, 6),
            "COMPOSITION": date(y0, 12, 12),
        }
        coefs_eval = {"DEVOIR1": 1.0, "COMPOSITION": 2.0}
        cms_peuples = [
            cm for cm in cms
            if EFFECTIFS.get(cm.classe.nom if cm.classe_id else "", 0) > 0
        ]
        # Limiter à 5 affectations par classe
        per_classe = {}
        cms_keep = []
        for cm in cms_peuples:
            n = per_classe.get(cm.classe_id, 0)
            if n < 5:
                cms_keep.append(cm)
                per_classe[cm.classe_id] = n + 1

        existing = {
            (e.type, e.trimestre_id, e.classe_matiere_id): e
            for e in Evaluation.objects.filter(classe_matiere__in=cms_keep)
        }
        to_create = []
        created = []
        to_touch = []
        for cm in cms_keep:
            for typ in ("DEVOIR1", "COMPOSITION"):
                key = (typ, t1.id, cm.id)
                if key in existing:
                    obj = existing[key]
                    wanted = dates[typ]
                    if obj.date != wanted:
                        obj.date = wanted
                        to_touch.append(obj)
                    created.append(obj)
                    continue
                to_create.append(Evaluation(
                    type=typ,
                    trimestre=t1,
                    classe_matiere=cm,
                    coefficient=coefs_eval[typ],
                    date=dates[typ],
                    is_active=True,
                    ecole=ecole,
                ))
        Evaluation.objects.bulk_create(to_create, batch_size=400)
        if to_touch:
            Evaluation.objects.bulk_update(to_touch, ["date"], batch_size=400)
        return list(Evaluation.objects.filter(classe_matiere__in=cms_keep, trimestre=t1))

    def _profils_eleves(self, eleves, rng):
        """Profil de réussite par élève — mélange échec / faible / moyen / bon / excellent."""
        profils = {}
        for e in eleves:
            roll = rng.random()
            if roll < 0.12:
                profils[e.id] = ("fail", rng.uniform(3.0, 7.5))
            elif roll < 0.32:
                profils[e.id] = ("low", rng.uniform(7.0, 10.0))
            elif roll < 0.68:
                profils[e.id] = ("average", rng.uniform(10.0, 13.2))
            elif roll < 0.88:
                profils[e.id] = ("good", rng.uniform(13.0, 16.5))
            else:
                profils[e.id] = ("excellent", rng.uniform(16.0, 18.8))
        # Garantir au moins un de chaque extrême (listes / bulletins)
        if eleves:
            profils[eleves[0].id] = ("average", 11.5)
            if len(eleves) > 1:
                profils[eleves[1].id] = ("fail", 4.2)
            if len(eleves) > 2:
                profils[eleves[2].id] = ("excellent", 18.4)
        return profils

    def _seed_notes(self, Note, evals, eleves, Inscription, rng, annee, ecole):
        profils = self._profils_eleves(eleves, rng)
        classe_par_eleve = {
            ins.eleve_id: ins.classe_id
            for ins in Inscription.objects.filter(annee_scolaire=annee)
        }
        eleves_par_classe = {}
        for e in eleves:
            cid = classe_par_eleve.get(e.id)
            eleves_par_classe.setdefault(cid, []).append(e)

        existants = {
            (eid, evid): pk
            for eid, evid, pk in Note.objects.values_list("eleve_id", "evaluation_id", "id")
        }
        to_create = []
        to_update = []
        n_zero = 0
        n_absent = 0
        valeurs = []

        for ev in evals:
            cid = ev.classe_matiere.classe_id
            matiere = ev.classe_matiere.matiere.nom
            is_exam = ev.type in ("COMPOSITION", "EXAMEN_BLANC")
            for eleve in eleves_par_classe.get(cid, []):
                label, base = profils[eleve.id]
                # Absents à l'épreuve : pas de note (surtout compositions / examens blancs)
                absent_p = 0.08 if is_exam else 0.02
                if label == "fail":
                    absent_p += 0.06
                if rng.random() < absent_p:
                    n_absent += 1
                    continue

                if matiere == "EPS":
                    base = min(19.0, base + 2.0)
                elif matiere == "Arts plastiques" and label in ("fail", "low"):
                    base = min(14.0, base + 1.5)

                noise = rng.gauss(0, 1.8)
                val = base + noise

                # Quelques copies à 0 (non rendue / triche / copie blanche)
                if rng.random() < 0.025 or (label == "fail" and rng.random() < 0.08):
                    val = 0.0
                    n_zero += 1
                else:
                    val = max(0.5, min(20.0, round(val * 2) / 2))

                # Forcer quelques notes extrêmes visibles
                if ev.type == "DEVOIR1" and label == "excellent" and rng.random() < 0.15:
                    val = rng.choice([18.5, 19.0, 19.5])
                if ev.type == "COMPOSITION" and label == "fail" and rng.random() < 0.2:
                    val = rng.choice([2.0, 3.0, 3.5, 4.0])

                valeurs.append(val)
                key = (eleve.id, ev.id)
                if key in existants:
                    to_update.append(Note(id=existants[key], valeur=val, evaluation=ev, eleve=eleve))
                else:
                    to_create.append(Note(valeur=val, evaluation=ev, eleve=eleve))

        Note.objects.bulk_create(to_create, batch_size=800)
        if to_update:
            Note.objects.bulk_update(to_update, ["valeur"], batch_size=800)

        return {
            "created": len(to_create),
            "updated": len(to_update),
            "absents_epreuve": n_absent,
            "zeros": n_zero,
            "min": min(valeurs) if valeurs else None,
            "max": max(valeurs) if valeurs else None,
        }

    def _seed_presences(self, Presence, cms, eleves, Inscription, classes, rng, annee, ecole):
        classe_par_eleve = {
            ins.eleve_id: ins.classe_id
            for ins in Inscription.objects.filter(annee_scolaire=annee)
        }
        eleves_par_classe = {}
        for e in eleves:
            cid = classe_par_eleve.get(e.id)
            eleves_par_classe.setdefault(cid, []).append(e)

        # 3 derniers jours de cours (volume modeste)
        jours = jours_scolaires_recents(3)

        anciennes = list(
            Presence.objects.order_by("date").values_list("date", flat=True).distinct()
        )
        if anciennes and set(anciennes) != set(jours):
            mapping = {
                old: jours[min(i, len(jours) - 1)]
                for i, old in enumerate(sorted(anciennes))
            }
            to_shift = []
            for p in Presence.objects.only("id", "date"):
                new_d = mapping.get(p.date)
                if new_d and new_d != p.date:
                    p.date = new_d
                    to_shift.append(p)
            if to_shift:
                try:
                    Presence.objects.bulk_update(to_shift, ["date"], batch_size=800)
                except Exception:
                    # Dates déjà occupées (unicité élève/cours/jour) : on conserve l'existant
                    pass

        # ~18 % d'élèves souvent absents
        chronic = {e.id for e in eleves if rng.random() < 0.18}
        assidus = {e.id for e in eleves if e.id not in chronic and rng.random() < 0.25}

        existants = set(
            Presence.objects.values_list("eleve_id", "classe_matiere_id", "date")
        )
        to_create = []
        counts = {"PRESENT": 0, "ABSENT": 0, "RETARD": 0, "EXCUSE": 0}

        classes_peuplees = [c for c in classes if EFFECTIFS.get(c.nom, 0) > 0]
        for classe in classes_peuplees:
            cms_classe = [cm for cm in cms if cm.classe_id == classe.id][:2]
            for cm in cms_classe:
                for jour in jours:
                    for eleve in eleves_par_classe.get(classe.id, []):
                        key = (eleve.id, cm.id, jour)
                        if key in existants:
                            continue
                        roll = rng.random()
                        if eleve.id in chronic:
                            if roll < 0.38:
                                statut = "PRESENT"
                            elif roll < 0.78:
                                statut = "ABSENT"
                            elif roll < 0.90:
                                statut = "RETARD"
                            else:
                                statut = "EXCUSE"
                        elif eleve.id in assidus:
                            if roll < 0.90:
                                statut = "PRESENT"
                            elif roll < 0.94:
                                statut = "RETARD"
                            elif roll < 0.97:
                                statut = "EXCUSE"
                            else:
                                statut = "ABSENT"
                        else:
                            if roll < 0.72:
                                statut = "PRESENT"
                            elif roll < 0.86:
                                statut = "ABSENT"
                            elif roll < 0.94:
                                statut = "RETARD"
                            else:
                                statut = "EXCUSE"
                        counts[statut] += 1
                        to_create.append(
                            Presence(
                                eleve=eleve, classe_matiere=cm, date=jour,
                                statut=statut, ecole=ecole,
                            )
                        )
        Presence.objects.bulk_create(to_create, batch_size=800)
        counts["created"] = len(to_create)
        return counts

    def _seed_appels(self, AppelJournalier, eleves, Inscription, classes, rng, annee, ecole):
        """Appel du jour : 2 jours × classes peuplées."""
        classe_par_eleve = {
            ins.eleve_id: ins.classe_id
            for ins in Inscription.objects.filter(annee_scolaire=annee)
        }
        eleves_par_classe = {}
        for e in eleves:
            cid = classe_par_eleve.get(e.id)
            eleves_par_classe.setdefault(cid, []).append(e)

        jours = jours_scolaires_recents(2)
        existants = set(AppelJournalier.objects.values_list("eleve_id", "classe_id", "date"))
        to_create = []
        classes_peuplees = [c for c in classes if EFFECTIFS.get(c.nom, 0) > 0]
        for classe in classes_peuplees:
            for jour in jours:
                for i, eleve in enumerate(eleves_par_classe.get(classe.id, [])):
                    key = (eleve.id, classe.id, jour)
                    if key in existants:
                        continue
                    if i == 0:
                        statut = "ABSENT"
                    elif i == 1:
                        statut = "RETARD"
                    else:
                        statut = "PRESENT"
                    to_create.append(
                        AppelJournalier(
                            eleve=eleve, classe=classe, date=jour,
                            statut=statut, ecole=ecole,
                        )
                    )
        AppelJournalier.objects.bulk_create(to_create, batch_size=400)
        return {"created": len(to_create)}

    # ── calendriers / programmes / délibérations ───────
    def _seed_calendriers(
        self, CalendrierComposition, ProgrammeComposition,
        CalendrierExamenBlanc, ProgrammeExamenBlanc,
        Deliberation, niveaux, trimestres, matieres, User, annee_debut, ecole=None,
    ):
        t1, t2, t3 = trimestres
        y0, y1 = annee_debut, annee_debut + 1
        periodes = {
            t1: (date(y0, 12, 9), date(y0, 12, 20)),
            t2: (date(y1, 3, 16), date(y1, 3, 27)),
            t3: (date(y1, 6, 8), date(y1, 6, 19)),
        }
        contenus = {
            "Mathématiques": "Nombres relatifs, équations, géométrie plane.",
            "Français": "Étude de texte, dictée, expression écrite.",
            "Anglais": "Compréhension écrite, grammaire, expression orale.",
            "Histoire-Géographie": "Histoire de l'Afrique de l'Ouest, cartes et climat.",
            "Physique-Chimie": "Électricité, transformations chimiques.",
            "SVT": "Nutrition, reproduction, environnement.",
            "EPS": "Athlétisme et sports collectifs.",
            "Informatique": "Bureautique et initiation à l'algorithmique.",
            "EMC": "Citoyenneté, droits et devoirs de l'élève.",
            "Arts plastiques": "Dessin d'observation et couleurs.",
            "Philosophie": "La conscience, la liberté, le devoir.",
            "Espagnol": "Vocabulaire quotidien et conjugaison au présent.",
        }
        admin = (
            User.objects.filter(username="admin").first()
            or User.objects.filter(role="ADMIN").exclude(username__in=ADMINS_PROTEGES).first()
            or User.objects.filter(role="ADMIN").first()
        )

        for niveau in niveaux.values():
            for trimestre, (deb, fin) in periodes.items():
                cal, created_cal = CalendrierComposition.objects.get_or_create(
                    niveau=niveau,
                    trimestre=trimestre,
                    defaults={"date_debut": deb, "date_fin": fin},
                )
                if not created_cal and (cal.date_debut != deb or cal.date_fin != fin):
                    cal.date_debut = deb
                    cal.date_fin = fin
                    cal.save(update_fields=["date_debut", "date_fin"])
                for matiere in matieres.values():
                    if matiere.nom == "Philosophie" and niveau.nom not in {"1ère", "Terminale"}:
                        continue
                    if matiere.nom == "Espagnol" and niveau.nom not in {"2nde", "1ère", "Terminale"}:
                        continue
                    if matiere.nom == "Arts plastiques" and niveau.nom in {"2nde", "1ère", "Terminale"}:
                        continue
                    ProgrammeComposition.objects.get_or_create(
                        calendrier=cal,
                        matiere=matiere,
                        defaults={"contenu": contenus.get(matiere.nom, "")},
                    )

            if niveau.is_classe_examen:
                cal_eb, created_eb = CalendrierExamenBlanc.objects.get_or_create(
                    niveau=niveau,
                    trimestre=t1,
                    defaults={"date_debut": date(annee_debut, 12, 2), "date_fin": date(annee_debut, 12, 7)},
                )
                if not created_eb:
                    d1, d2 = date(annee_debut, 12, 2), date(annee_debut, 12, 7)
                    if cal_eb.date_debut != d1 or cal_eb.date_fin != d2:
                        cal_eb.date_debut = d1
                        cal_eb.date_fin = d2
                        cal_eb.save(update_fields=["date_debut", "date_fin"])
                for matiere in matieres.values():
                    if matiere.nom == "Philosophie" and niveau.nom != "Terminale":
                        continue
                    if matiere.nom == "Espagnol" and niveau.nom not in {"2nde", "1ère", "Terminale"}:
                        continue
                    if matiere.nom == "Arts plastiques":
                        continue
                    ProgrammeExamenBlanc.objects.get_or_create(
                        calendrier=cal_eb,
                        matiere=matiere,
                        defaults={"contenu": "Révisions du programme de l'année — " + contenus.get(matiere.nom, "")},
                    )
                Deliberation.objects.get_or_create(
                    niveau=niveau,
                    trimestre=t1,
                    defaults={"decide_par": admin},
                )

    # ── comptes utilisateurs ───────────────────────────
    def _seed_users(self, User, enseignants, eleves, pwd_hash, ecole=None):
        created = []

        def upsert(username, email, role, **extra):
            if username in ADMINS_PROTEGES:
                user = User.objects.filter(username=username).first()
                if user and ecole is not None and user.ecole_id is None:
                    user.ecole = ecole
                    user.save(update_fields=["ecole"])
                return user
            user, _ = User.objects.get_or_create(
                username=username,
                defaults={"email": email, "role": role, "is_active": True, "ecole": ecole, **extra},
            )
            user.email = email
            user.role = role
            user.is_active = True
            if ecole is not None:
                user.ecole = ecole
            for k, v in extra.items():
                setattr(user, k, v)
            user.password = pwd_hash
            if role == "ADMIN":
                user.is_staff = True
                user.is_superuser = True
            user.save()
            created.append(user)
            return user

        upsert(
            "admin",
            "admin@wendpanga.bf",
            "ADMIN",
            first_name="Admin",
            last_name="Wend-Panga",
        )

        for ens in enseignants:
            is_demo_prof = ens.nom == "Koné" and ens.prenom == "Amadou"
            if is_demo_prof:
                uname, email = "enseignant", "enseignant@wendpanga.bf"
            else:
                uname = _slug_ident(ens.prenom, ens.nom)
                email = f"{uname}@wendpanga.bf"
            upsert(
                uname, email, "ENSEIGNANT",
                first_name=ens.prenom, last_name=ens.nom, enseignant=ens,
            )

        test_eleve = None
        for eleve in eleves:
            u = upsert(
                eleve.matricule,
                f"{eleve.matricule.lower()}@eleves.wendpanga.bf",
                "ELEVE",
                first_name=eleve.prenom,
                last_name=eleve.nom,
                eleve=eleve,
            )
            if eleve.matricule.endswith("-0001"):
                test_eleve = u

        if test_eleve:
            upsert(
                "eleve",
                "eleve@wendpanga.bf",
                "ELEVE",
                first_name=test_eleve.first_name,
                last_name=test_eleve.last_name,
                eleve=test_eleve.eleve,
            )

        enfant_a = next((e for e in eleves if e.matricule.endswith("-0001")), None)
        enfant_b = eleves[8] if len(eleves) > 8 else (eleves[1] if len(eleves) > 1 else None)
        if enfant_a and enfant_b and enfant_a.id == enfant_b.id:
            enfant_b = eleves[1] if len(eleves) > 1 else None
        parent = upsert(
            "parent",
            "parent@wendpanga.bf",
            "PARENT",
            first_name=enfant_a.prenom_parent if enfant_a else "Issa",
            last_name=enfant_a.nom_parent if enfant_a else "Traoré",
            eleve=enfant_a,
        )
        enfants = [e for e in (enfant_a, enfant_b) if e]
        if parent and enfants:
            parent.enfants.set(enfants)

        vus = set()
        from scolarite.models import Inscription
        for ins in Inscription.objects.filter(annee_scolaire__is_active=True).select_related("eleve", "classe").order_by("classe_id", "eleve_id"):
            if ins.classe_id in vus:
                continue
            vus.add(ins.classe_id)
            e = ins.eleve
            uname = f"parent.{e.matricule.lower()}"
            p = upsert(
                uname,
                f"{uname}@famille.wendpanga.bf",
                "PARENT",
                first_name=e.prenom_parent or "Parent",
                last_name=e.nom_parent or e.nom,
                eleve=e,
            )
            if p:
                p.enfants.set([e])

        return created

    # ── caisse ─────────────────────────────────────────
    def _seed_caisse(self, annee, niveaux, Inscription, rng, ecole=None):
        from datetime import timedelta
        from caisse.models import TarifNiveau, DossierScolarite, Paiement
        from caisse.services import ouvrir_dossier, enregistrer_paiement

        grilles = {
            "6ème": (15000, 15000, 15000),
            "5ème": (15000, 15000, 15000),
            "4ème": (18000, 18000, 14000),
            "3ème": (20000, 20000, 15000),
            "2nde": (25000, 25000, 20000),
            "1ère": (28000, 28000, 19000),
            "Terminale": (30000, 30000, 25000),
        }
        for nom, (t1, t2, t3) in grilles.items():
            niveau = niveaux.get(nom)
            if not niveau:
                continue
            tarif, _ = TarifNiveau.objects.get_or_create(
                niveau=niveau, annee_scolaire=annee,
                defaults={"tranche1": t1, "tranche2": t2, "tranche3": t3},
            )
            tarif.tranche1, tarif.tranche2, tarif.tranche3 = t1, t2, t3
            tarif.save()

        dossiers = []
        for ins in Inscription.objects.filter(annee_scolaire=annee).select_related("classe__niveau"):
            dossiers.append(ouvrir_dossier(ins))

        today = date.today()
        n_solde = n_partiel = n_impaye = 0
        for i, dossier in enumerate(dossiers):
            if dossier.paiements.exists():
                dossier.rafraichir_statut()
                if dossier.statut == "SOLDE":
                    n_solde += 1
                elif dossier.statut == "PARTIEL":
                    n_partiel += 1
                else:
                    n_impaye += 1
                continue
            roll = i % 10
            tarif = getattr(dossier.inscription.classe.niveau, "id", None)
            t1 = int(dossier.montant_du) // 3 if dossier.montant_du else 15000
            t2 = t1
            t3 = int(dossier.montant_du) - t1 - t2
            if roll < 3:
                for tr, m, days in ((1, t1, 40), (2, t2, 20), (3, max(t3, 0), 5)):
                    if m <= 0:
                        continue
                    enregistrer_paiement(
                        dossier, tranche=tr, montant=m,
                        date_paiement=today - timedelta(days=days),
                        mode=rng.choice(["ESPECES", "MOBILE", "ESPECES"]),
                    )
                n_solde += 1
            elif roll < 7:
                enregistrer_paiement(
                    dossier, tranche=1, montant=t1,
                    date_paiement=today - timedelta(days=25),
                    mode="ESPECES",
                )
                if roll >= 5 and t2:
                    enregistrer_paiement(
                        dossier, tranche=2, montant=t2 // 2,
                        date_paiement=today - timedelta(days=8),
                        mode="MOBILE",
                    )
                n_partiel += 1
            else:
                n_impaye += 1
            if roll == 9:
                dossier.composition_bloquee = True
                dossier.save(update_fields=["composition_bloquee"])

        return {
            "tarifs": TarifNiveau.objects.filter(annee_scolaire=annee).count(),
            "dossiers": DossierScolarite.objects.filter(inscription__annee_scolaire=annee).count(),
            "paiements": Paiement.objects.filter(dossier__inscription__annee_scolaire=annee).count(),
            "solde": n_solde, "partiel": n_partiel, "impaye": n_impaye,
        }

    # ── notifications / SMS ────────────────────────────
    def _seed_notifications(self, User, eleves, Presence, annee, ecole=None):
        from notifications.models import Notification, SmsOutbox
        from notifications.services import notifier_absence, notifier_parents, creer_notification

        parent = User.objects.filter(username="parent").first()
        admin = User.objects.filter(username="admin").first()
        n_abs = n_frais = n_bull = 0

        # Absences du jour (ou plus récent) pour quelques élèves
        absents = list(
            Presence.objects.filter(statut="ABSENT")
            .select_related("eleve", "classe_matiere__matiere")
            .order_by("-date")[:8]
        )
        vus = set()
        for p in absents:
            if p.eleve_id in vus:
                continue
            vus.add(p.eleve_id)
            notifier_absence(p.eleve, jour=p.date, matiere_nom=p.classe_matiere.matiere.nom)
            n_abs += 1

        # Relances frais : enfants du compte parent + quelques autres
        from caisse.models import DossierScolarite
        dossiers = list(
            DossierScolarite.objects.exclude(statut="SOLDE")
            .filter(inscription__annee_scolaire=annee)
            .select_related("inscription__eleve")[:12]
        )
        for d in dossiers:
            e = d.inscription.eleve
            notifier_parents(
                e,
                type="FRAIS",
                titre=f"Rappel de scolarité — {e.prenom} {e.nom}",
                message=(
                    f"Rappel : il reste {int(d.reste)} F CFA à régler pour {e.prenom} {e.nom} "
                    f"(situation : {d.get_statut_display()})."
                ),
                lien="/mes-frais",
            )
            n_frais += 1

        # Bulletins publiés pour le compte parent
        if parent:
            enfants = list(parent.enfants.all()) or ([parent.eleve] if parent.eleve else [])
            for e in enfants:
                notifier_parents(
                    e,
                    type="BULLETIN",
                    titre="Bulletin publié — Trimestre 1",
                    message=(
                        f"Le bulletin de {e.prenom} {e.nom} pour le Trimestre 1 "
                        f"({annee.libelle}) est disponible."
                    ),
                    lien="/mon-bulletin",
                )
                n_bull += 1

        from notifications.services import envoyer_message_groupe
        deja_groupe = Notification.objects.filter(
            type="INFO", titre="Message à tous les parents"
        ).exists()
        if not deja_groupe:
            envoyer_message_groupe(
                titre="Message à tous les parents",
                message=(
                    "Chers parents, ceci est un message d’information envoyé à tout le monde. "
                    "Vous le retrouvez ici, dans le menu Messages."
                ),
                type="INFO",
            )

        if parent:
            creer_notification(
                destinataire=parent,
                type="INFO",
                titre="Bienvenue dans l’espace parent",
                message="Vous pouvez suivre les notes, présences, bulletins et frais de vos enfants. Les messages de l’école sont dans le menu Messages.",
                lien="/messages",
            )
        eleve_user = User.objects.filter(username="eleve").first()
        if eleve_user:
            creer_notification(
                destinataire=eleve_user,
                type="INFO",
                titre="Bienvenue dans l’espace élève",
                message="Les messages de l’école (absences, frais, bulletin) apparaissent dans le menu Messages.",
                eleve=eleve_user.eleve,
                lien="/messages",
            )
        if admin:
            creer_notification(
                destinataire=admin,
                type="INFO",
                titre="Caisse et messages prêts",
                message=(
                    "Les frais de scolarité et les messages parents sont en place. "
                    "Sans API SMS, le parent voit le message dans son espace."
                ),
            )
            creer_notification(
                destinataire=admin,
                type="FRAIS",
                titre="Dossiers de scolarité ouverts",
                message="Les grilles de frais et les situations (soldé / partiel / impayé) sont disponibles dans Caisse / Frais.",
                lien="/admin/caisse",
            )

        return {
            "notifications": Notification.objects.count(),
            "sms": SmsOutbox.objects.count(),
            "absences": n_abs,
            "frais": n_frais,
            "bulletins": n_bull,
        }

    def _seed_examens(self, annee, Inscription, ResultatExamenNational, rng, ecole=None):
        """Liste démo : une partie des 3ème / Terminale admis, le reste redouble."""
        from scolarite.passage import inscriptions_examen

        ResultatExamenNational.objects.filter(annee_scolaire=annee).delete()
        created = {"BEPC": 0, "BAC": 0}

        bepc = inscriptions_examen(annee, "BEPC")
        for i, ins in enumerate(bepc):
            if i % 3 == 2:
                continue
            serie = "C" if "B" in (ins.classe.nom or "") else "A"
            ResultatExamenNational.objects.create(
                eleve=ins.eleve,
                annee_scolaire=annee,
                examen="BEPC",
                admis=True,
                serie_2nde=serie,
                ecole=ecole,
            )
            created["BEPC"] += 1

        bac = inscriptions_examen(annee, "BAC")
        for i, ins in enumerate(bac):
            if i % 3 == 2:
                continue
            ResultatExamenNational.objects.create(
                eleve=ins.eleve,
                annee_scolaire=annee,
                examen="BAC",
                admis=True,
            )
            created["BAC"] += 1

        return {
            "bepc_admis": created["BEPC"],
            "bepc_total": len(bepc),
            "bac_admis": created["BAC"],
            "bac_total": len(bac),
        }

    def _seed_demandes_inscription(self, ecole, niveaux):
        """1–2 dossiers EN_ATTENTE pour tester la vitrine / acceptation admin."""
        from datetime import date
        from scolarite.models import DemandeInscription

        DemandeInscription.objects.filter(ecole=ecole, statut=DemandeInscription.STATUT_EN_ATTENTE).delete()
        samples = [
            {
                "nom": "Sawadogo",
                "prenom": "Aïcha",
                "date_naissance": date(2013, 4, 12),
                "sexe": "F",
                "niveau": niveaux.get("6ème"),
                "nom_parent": "Sawadogo Ibrahim",
                "telephone_parent": "+226 70 11 22 33",
                "email_parent": "ibrahim.sawadogo@example.bf",
                "message": "Souhaitons inscrire notre fille pour la prochaine rentrée.",
            },
            {
                "nom": "Ouédraogo",
                "prenom": "Moussa",
                "date_naissance": date(2010, 9, 3),
                "sexe": "M",
                "niveau": niveaux.get("3ème"),
                "nom_parent": "Ouédraogo Fatimata",
                "telephone_parent": "+226 76 44 55 66",
                "email_parent": "",
                "message": "",
            },
        ]
        n = 0
        for s in samples:
            if s["niveau"] is None:
                continue
            DemandeInscription.objects.create(
                ecole=ecole,
                nom=s["nom"],
                prenom=s["prenom"],
                date_naissance=s["date_naissance"],
                sexe=s["sexe"],
                niveau_souhaite=s["niveau"],
                nom_parent=s["nom_parent"],
                telephone_parent=s["telephone_parent"],
                email_parent=s["email_parent"],
                message=s["message"],
                statut=DemandeInscription.STATUT_EN_ATTENTE,
                is_active=True,
            )
            n += 1
        self.stdout.write(f"  dossiers préinscription : {n}")

    def _rattacher_ecole(self, ecole):
        """Attache à Wend-Panga toute ligne encore sans école (données déjà là)."""
        from accounts.models import User
        from cours.models import Enseignant, Matiere, ClasseMatiere, EmploiDuTemps
        from eleves.models import Eleve, Presence
        from evaluations.models import (
            Evaluation, Note, CalendrierComposition, ProgrammeComposition,
            CalendrierExamenBlanc, ProgrammeExamenBlanc, Deliberation,
        )
        from scolarite.models import (
            Niveau, Classe, AnneeScolaire, Trimestre, Inscription,
            ResultatExamenNational, PassageAnnee,
        )
        from caisse.models import TarifNiveau, DossierScolarite, Paiement
        from notifications.models import Notification, SmsOutbox

        for model in (
            Niveau, Classe, AnneeScolaire, Trimestre, Inscription,
            ResultatExamenNational, PassageAnnee, Eleve, Presence,
            Enseignant, Matiere, ClasseMatiere, EmploiDuTemps,
            Evaluation, Note, CalendrierComposition, ProgrammeComposition,
            CalendrierExamenBlanc, ProgrammeExamenBlanc, Deliberation,
            TarifNiveau, DossierScolarite, Paiement, Notification, SmsOutbox,
        ):
            model.objects.filter(ecole__isnull=True).update(ecole=ecole)
        User.objects.filter(ecole__isnull=True, is_plateforme=False).update(ecole=ecole)

    def _seed_ecole_isolee(self, pwd_hash):
        """Petite 2e école pour prouver que les données ne se mélangent pas."""
        from accounts.models import User
        from cours.models import Enseignant, Matiere, ClasseMatiere
        from eleves.models import Eleve
        from parametres.models import Parametres
        from scolarite.models import Niveau, Classe, AnneeScolaire, Trimestre, Inscription
        from scolarite.utils import annee_scolaire_courante

        ecole, _ = Parametres.objects.get_or_create(
            nom_ecole="École Test Banfora",
            defaults={
                "ville": "Banfora",
                "telephone": "+226 20 91 00 11",
                "email": "directeur@banfora-test.bf",
                "directeur": "Awa Sanou",
                "slogan": "École de démonstration (isolation)",
            },
        )
        if ecole.pk == 1:
            ecole = Parametres.objects.create(
                nom_ecole="École Test Banfora",
                ville="Banfora",
                telephone="+226 20 91 00 11",
                email="directeur@banfora-test.bf",
                directeur="Awa Sanou",
                slogan="École de démonstration (isolation)",
            )

        libelle, _ = annee_scolaire_courante()
        annee, _ = AnneeScolaire.objects.get_or_create(
            libelle=libelle, ecole=ecole, defaults={"is_active": True}
        )
        for nom in ("Trimestre 1", "Trimestre 2", "Trimestre 3"):
            Trimestre.objects.get_or_create(
                nom=nom, annee_scolaire=annee, defaults={"is_active": True, "ecole": ecole}
            )
        niveau, _ = Niveau.objects.get_or_create(
            nom="6ème", ecole=ecole, defaults={"is_active": True}
        )
        ens, _ = Enseignant.objects.get_or_create(
            nom="Sanou", prenom="Issa", ecole=ecole, defaults={"is_active": True}
        )
        matiere, _ = Matiere.objects.get_or_create(
            nom="Mathématiques", ecole=ecole, defaults={"type": "SCIENTIFIQUE"}
        )
        classe, _ = Classe.objects.get_or_create(
            nom="6ème A", niveau=niveau, defaults={"is_active": True, "ecole": ecole, "professeur_principal": ens}
        )
        ClasseMatiere.objects.get_or_create(
            classe=classe, matiere=matiere,
            defaults={"enseignant": ens, "coef": 4, "is_active": True, "ecole": ecole},
        )
        eleve, _ = Eleve.objects.get_or_create(
            matricule="BAN-0001", ecole=ecole,
            defaults={"nom": "Ouattara", "prenom": "Fatou", "is_active": True},
        )
        Inscription.objects.get_or_create(
            eleve=eleve, annee_scolaire=annee,
            defaults={"classe": classe, "ecole": ecole},
        )
        admin, created = User.objects.get_or_create(
            username="admin_banfora",
            defaults={
                "email": "directeur@banfora-test.bf",
                "role": "ADMIN",
                "ecole": ecole,
                "first_name": "Awa",
                "last_name": "Sanou",
                "is_staff": True,
                "is_active": True,
            },
        )
        if created or not admin.ecole_id:
            admin.ecole = ecole
            admin.role = "ADMIN"
            admin.password = pwd_hash
            admin.save()
        ecole.statut = Parametres.STATUT_VALIDEE
        ecole.motif = ""
        ecole.vitrine_active = True
        if not ecole.slug:
            ecole.slug = "ecole-test-banfora"
        ecole.save()
        self.stdout.write(
            self.style.SUCCESS(
                "  2e école : École Test Banfora — admin_banfora / Ecole2025! "
                "(ne voit pas Wend-Panga)"
            )
        )

    def _seed_superadmin(self):
        from accounts.plateforme import SUPERADMIN_PASSWORD, SUPERADMIN_USERNAME, ensure_superadmin
        user, created = ensure_superadmin()
        if created:
            self.stdout.write(self.style.SUCCESS(
                f"  Super admin créé : {SUPERADMIN_USERNAME} / {SUPERADMIN_PASSWORD}"
            ))
        else:
            self.stdout.write(
                f"  Super admin existant : {user.username} (mot de passe inchangé, rôle SUPER_ADMIN)"
            )

    # ── résumé ─────────────────────────────────────────
    def _print_resume(
        self, params, annee, classes, comptes, notes_stats, pres_stats,
        User, Niveau, Classe, AnneeScolaire, Trimestre,
        Enseignant, Matiere, ClasseMatiere, EmploiDuTemps,
        Eleve, Inscription, Evaluation, Note, Presence,
        CalendrierComposition, ProgrammeComposition,
        CalendrierExamenBlanc, ProgrammeExamenBlanc, Deliberation,
        caisse_stats=None, notif_stats=None, exam_stats=None, appel_stats=None,
    ):
        def n(model):
            return model.objects.count()

        from django.db.models import Min, Max, Count

        note_agg = Note.objects.aggregate(mn=Min("valeur"), mx=Max("valeur"), nb=Count("id"))
        zeros = Note.objects.filter(valeur=0).count()
        pres_agg = {
            s: Presence.objects.filter(statut=s).count()
            for s in ("PRESENT", "ABSENT", "RETARD", "EXCUSE")
        }

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=== Données de démonstration chargées (volume modeste) ==="))
        self.stdout.write(f"École            : {params.nom_ecole} ({params.ville})")
        self.stdout.write(f"Année active     : {annee.libelle}")
        self.stdout.write("")
        self.stdout.write("Classes peuplées :")
        for c in classes:
            nb_el = Inscription.objects.filter(classe=c, annee_scolaire=annee).count()
            if nb_el:
                self.stdout.write(f"  • {c.nom:<16} ({c.niveau.nom}) — {nb_el} élèves")

        self.stdout.write("")
        self.stdout.write("Comptages :")
        rows = [
            ("utilisateurs", n(User)),
            ("niveaux", n(Niveau)),
            ("classes", n(Classe)),
            ("années scolaires", n(AnneeScolaire)),
            ("trimestres", n(Trimestre)),
            ("enseignants", n(Enseignant)),
            ("matières", n(Matiere)),
            ("affectations cours", n(ClasseMatiere)),
            ("emplois du temps", n(EmploiDuTemps)),
            ("élèves", n(Eleve)),
            ("inscriptions", n(Inscription)),
            ("évaluations", n(Evaluation)),
            ("notes", n(Note)),
            ("présences", n(Presence)),
            ("calendriers composition", n(CalendrierComposition)),
            ("programmes composition", n(ProgrammeComposition)),
            ("calendriers examen blanc", n(CalendrierExamenBlanc)),
            ("programmes examen blanc", n(ProgrammeExamenBlanc)),
            ("délibérations", n(Deliberation)),
        ]
        try:
            from eleves.models import AppelJournalier
            rows.insert(14, ("appels journaliers", n(AppelJournalier)))
        except Exception:
            pass
        try:
            from caisse.models import TarifNiveau, DossierScolarite, Paiement
            from notifications.models import Notification, SmsOutbox
            rows.extend([
                ("grilles de frais", n(TarifNiveau)),
                ("dossiers scolarité", n(DossierScolarite)),
                ("paiements / reçus", n(Paiement)),
                ("notifications", n(Notification)),
                ("SMS (file)", n(SmsOutbox)),
            ])
        except Exception:
            pass
        for label, count in rows:
            self.stdout.write(f"  • {label:<28} {count}")

        self.stdout.write("")
        self.stdout.write("Notes (variation) :")
        self.stdout.write(f"  min={note_agg['mn']}  max={note_agg['mx']}  total={note_agg['nb']}  notes à 0={zeros}")
        self.stdout.write(f"  absents à l'épreuve (sans note) : {notes_stats.get('absents_epreuve', 0)}")
        self.stdout.write("")
        self.stdout.write("Présences :")
        self.stdout.write(
            f"  présent={pres_agg['PRESENT']}  absent={pres_agg['ABSENT']}  "
            f"retard={pres_agg['RETARD']}  justifié/excusé={pres_agg['EXCUSE']}"
        )
        if appel_stats:
            self.stdout.write(f"Appels journaliers créés : {appel_stats.get('created', 0)}")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Comptes de test (mot de passe unique) :"))
        self.stdout.write(f"  Mot de passe : {MOT_DE_PASSE_TEST}")
        self.stdout.write("  ADMIN      username=admin        (ou email admin@wendpanga.bf)")
        self.stdout.write("  ENSEIGNANT username=enseignant   (Amadou Koné, maths)")
        self.stdout.write(f"  ELEVE      username=eleve        (matricule {annee.libelle[:4]}-0001)")
        self.stdout.write("  PARENT     username=parent       (2 enfants)")
        self.stdout.write("")
        self.stdout.write("Autres connexions :")
        self.stdout.write("  • Chaque enseignant : initiale + nom (ex. akone, fsawadogo)")
        self.stdout.write(f"  • Chaque élève      : son matricule (ex. {annee.libelle[:4]}-0001)")
        self.stdout.write(f"  • Parents de classe : parent.{annee.libelle[:4]}-0001, …")
        self.stdout.write("  • Compte admin existant hamidtoe450 : mot de passe inchangé (Wend-Panga, PAS super admin plateforme)")
        self.stdout.write("  • 2e école (isolation) : admin_banfora / Ecole2025!")
        self.stdout.write("  • SUPER ADMIN plateforme : superadmin / Ecole2025!  (valide les écoles)")
        if exam_stats:
            self.stdout.write("")
            self.stdout.write("Examens nationaux (démo) :")
            self.stdout.write(
                f"  BEPC : {exam_stats.get('bepc_admis', 0)} admis / {exam_stats.get('bepc_total', 0)} élèves de 3ème"
            )
            self.stdout.write(
                f"  BAC  : {exam_stats.get('bac_admis', 0)} admis / {exam_stats.get('bac_total', 0)} élèves de Terminale"
            )
            self.stdout.write("  Les autres 3ème / Terminale redoublent (absents de la liste).")
        self.stdout.write("")
        self.stdout.write("Relancer : python manage.py seed_demo")
        self.stdout.write("Tout recréer : python manage.py seed_demo --reset")