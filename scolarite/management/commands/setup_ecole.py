"""
Initialise les donnees de base : niveaux, annee scolaire, trimestres.
Usage : python manage.py setup_ecole
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Cree les niveaux, une annee scolaire et les trimestres"

    def handle(self, *args, **options):
        from scolarite.models import Niveau, AnneeScolaire, Trimestre

        self.stdout.write("=== Initialisation Gestion Ecole ===")

        # 1. NIVEAUX
        niveaux = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere A', 'Terminale A']
        nb_n = 0
        for nom in niveaux:
            obj, created = Niveau.objects.get_or_create(nom=nom)
            if created:
                nb_n += 1
                self.stdout.write(f"  Niveau cree : {nom}")
            else:
                self.stdout.write(f"  Niveau existant : {nom}")
        self.stdout.write(f"Niveaux : {nb_n} cree(s)")

        # 2. ANNEE SCOLAIRE
        annee, created = AnneeScolaire.objects.get_or_create(libelle='2024-2025')
        if created:
            self.stdout.write("Annee scolaire creee : 2024-2025")
        else:
            self.stdout.write("Annee scolaire existante : 2024-2025")

        # 3. TRIMESTRES
        trimestres = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3']
        nb_t = 0
        for nom in trimestres:
            obj, created = Trimestre.objects.get_or_create(
                nom=nom, annee_scolaire=annee
            )
            if created:
                nb_t += 1
                self.stdout.write(f"  Trimestre cree : {nom}")
            else:
                self.stdout.write(f"  Trimestre existant : {nom}")
        self.stdout.write(f"Trimestres : {nb_t} cree(s)")

        self.stdout.write("")
        self.stdout.write("Termine ! Prochaines etapes :")
        self.stdout.write("  1. Ajouter des enseignants (menu Enseignants)")
        self.stdout.write("  2. Ajouter des matieres (menu Matieres)")
        self.stdout.write("  3. Affecter cours aux niveaux (menu Affectation Cours)")
        self.stdout.write("  4. Ajouter des eleves (menu Eleves)")
        self.stdout.write("  5. Inscrire les eleves dans les niveaux (menu Inscriptions)")
