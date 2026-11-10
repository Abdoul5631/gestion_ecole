"""
Vide les données scolaires en gardant TOUS les comptes utilisateurs.
Usage : python manage.py reset_db --confirm
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Vide les donnees scolaires uniquement (niveaux, classes, eleves, notes...) — garde tous les comptes"

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Confirmer la suppression',
        )

    def handle(self, *args, **options):
        if not options['confirm']:
            self.stdout.write(self.style.WARNING(
                "ATTENTION : Cette commande va supprimer toutes les donnees scolaires."
            ))
            self.stdout.write("   Les comptes utilisateurs seront CONSERVES.")
            self.stdout.write("   Pour confirmer : python manage.py reset_db --confirm")
            return

        from evaluations.models import Note, Evaluation
        from eleves.models import Presence, Eleve
        from scolarite.models import Inscription, Classe, Trimestre, AnneeScolaire, Niveau
        from cours.models import ClasseMatiere, Enseignant, Matiere
        from accounts.models import User
        from caisse.models import Paiement, DossierScolarite, TarifNiveau
        from notifications.models import SmsOutbox, Notification

        self.stdout.write(self.style.MIGRATE_HEADING("=== Suppression des donnees scolaires ==="))

        steps = [
            ("Paiements",          Paiement),
            ("Dossiers scolarite", DossierScolarite),
            ("Tarifs",             TarifNiveau),
            ("SMS",                SmsOutbox),
            ("Notifications",      Notification),
            ("Notes",              Note),
            ("Evaluations",        Evaluation),
            ("Presences",          Presence),
            ("Inscriptions",       Inscription),
            ("Affectations cours", ClasseMatiere),
            ("Classes",            Classe),
            ("Eleves",             Eleve),
            ("Enseignants",        Enseignant),
            ("Matieres",           Matiere),
            ("Trimestres",         Trimestre),
            ("Annees scolaires",   AnneeScolaire),
            ("Niveaux",            Niveau),
        ]

        total = 0
        for label, Model in steps:
            count = Model.objects.count()
            Model.objects.all().delete()
            self.stdout.write(f"  OK {label} : {count} supprime(s)")
            total += count

        nb_comptes = User.objects.count()
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Donnees scolaires videes -- {total} enregistrements supprimes"))
        self.stdout.write(self.style.SUCCESS(f"Comptes utilisateurs conserves : {nb_comptes}"))
        self.stdout.write("")
        self.stdout.write("Prochaine etape : python manage.py setup_ecole")
        self.stdout.write("(pour recree les niveaux, annee scolaire et trimestres)")
